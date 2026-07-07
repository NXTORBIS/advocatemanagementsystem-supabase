import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");
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
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      console.error("Twilio credentials are not properly configured");
      return new Response(
        JSON.stringify({ error: "SMS service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const normalizedPhone = to.replace(/\D/g, "");
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

    if (smsData.sid) {
      try {
        await patchNotification(notificationId, {
          delivery_status: { sms: smsData.status },
          external_ids: { sms: smsData.sid },
        });
        await insertLog({
          notification_id: notificationId,
          channel: "sms",
          status: smsData.status,
          external_id: smsData.sid,
          sent_at: new Date().toISOString(),
          delivered_at: smsData.status === "delivered" ? new Date().toISOString() : null,
        });
      } catch (dbError) {
        console.error("Database update error:", dbError);
      }
    }

    return new Response(JSON.stringify(smsData), {
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
