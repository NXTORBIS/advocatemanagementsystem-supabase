import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

// --- SMS provider abstraction ---
// SMS_PROVIDER env var can force a choice; otherwise prefers MSG91 (default vendor)
// when configured, falling back to Twilio.
const MSG91_AUTH_KEY = Deno.env.get("MSG91_AUTH_KEY");
const MSG91_SMS_SENDER_ID = Deno.env.get("MSG91_SMS_SENDER_ID");
// DLT-registered template ID (India requires all SMS content to match a pre-approved
// template). The template must contain exactly one variable (##VAR1## or similar) that
// the full notification message is substituted into, e.g. "Update: {{VAR1}}".
const MSG91_SMS_TEMPLATE_ID = Deno.env.get("MSG91_SMS_TEMPLATE_ID");
const smsProvider = Deno.env.get("SMS_PROVIDER") ??
  (MSG91_AUTH_KEY ? "msg91" : TWILIO_ACCOUNT_SID ? "twilio" : undefined);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SmsNotificationRequest {
  notificationId: string;
  to: string;
  message: string;
  type: string;
}

async function patchNotification(notificationId: string, body: unknown) {
  if (!UUID_RE.test(notificationId)) return;
  await fetch(
    `${SUPABASE_URL}/rest/v1/notifications?id=eq.${encodeURIComponent(notificationId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(body),
    }
  );
}

async function insertLog(body: unknown) {
  await fetch(`${SUPABASE_URL}/rest/v1/notification_delivery_logs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Prefer": "return=minimal",
    },
    body: JSON.stringify(body),
  });
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  const token = authHeader.replace("Bearer ", "");
  if (token !== SUPABASE_SERVICE_ROLE_KEY) {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data, error } = await userClient.auth.getUser(token);
    if (error || !data?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }

  let parsed: SmsNotificationRequest;
  try {
    parsed = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const { notificationId, to, message } = parsed;
  if (!notificationId || !UUID_RE.test(notificationId)) {
    return new Response(JSON.stringify({ error: "Invalid notificationId" }), {
      status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  if (!to || typeof to !== "string" || !message || typeof message !== "string") {
    return new Response(JSON.stringify({ error: "Invalid input" }), {
      status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    if (!smsProvider) {
      console.error("No SMS provider configured: set MSG91_AUTH_KEY or TWILIO_ACCOUNT_SID");
      return new Response(
        JSON.stringify({ error: "SMS service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const normalizedPhone = to.replace(/\D/g, "");

    let externalId: string | undefined;
    let deliveryStatus = "sent";

    if (smsProvider === "msg91") {
      if (!MSG91_AUTH_KEY || !MSG91_SMS_SENDER_ID || !MSG91_SMS_TEMPLATE_ID) {
        console.error("MSG91 SMS credentials are not properly configured");
        return new Response(
          JSON.stringify({ error: "SMS service not configured" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const msg91Response = await fetch("https://control.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: {
          "Authkey": MSG91_AUTH_KEY,
          "accept": "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          template_id: MSG91_SMS_TEMPLATE_ID,
          sender: MSG91_SMS_SENDER_ID,
          short_url: "0",
          mobiles: normalizedPhone,
          VAR1: message,
        }),
      });

      const msg91Data = await msg91Response.json();
      if (msg91Data.type !== "success") {
        console.error("MSG91 SMS error:", msg91Data);
        throw new Error(msg91Data.message || "MSG91 SMS delivery failed");
      }
      externalId = msg91Data.request_id;
    } else {
      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
        console.error("Twilio credentials are not properly configured");
        return new Response(
          JSON.stringify({ error: "SMS service not configured" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const formattedPhone = normalizedPhone.startsWith("+") ? normalizedPhone : `+${normalizedPhone}`;

      const smsResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          },
          body: new URLSearchParams({
            To: formattedPhone,
            From: TWILIO_PHONE_NUMBER,
            Body: message,
          }).toString(),
        }
      );

      const smsData = await smsResponse.json();
      if (!smsData.sid) {
        console.error("Twilio SMS error:", smsData);
        throw new Error(smsData.message || "Twilio SMS delivery failed");
      }
      externalId = smsData.sid;
      deliveryStatus = smsData.status;
    }

    try {
      await patchNotification(notificationId, {
        delivery_status: { sms: deliveryStatus },
        external_ids: { sms: externalId },
      });
      await insertLog({
        notification_id: notificationId,
        channel: "sms",
        status: deliveryStatus,
        external_id: externalId,
        sent_at: new Date().toISOString(),
        delivered_at: deliveryStatus === "delivered" ? new Date().toISOString() : null,
      });
    } catch (dbError) {
      console.error("Database update error:", dbError);
    }

    return new Response(JSON.stringify({ provider: smsProvider, status: deliveryStatus, id: externalId }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-sms-notification function:", error);
    try {
      await patchNotification(notificationId, { delivery_status: { sms: "failed" } });
      await insertLog({
        notification_id: notificationId,
        channel: "sms",
        status: "failed",
        error_message: error?.message || "Unknown error",
        sent_at: new Date().toISOString(),
      });
    } catch (logError) {
      console.error("Error logging notification failure:", logError);
    }
    return new Response(
      JSON.stringify({ error: "Notification delivery failed. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
