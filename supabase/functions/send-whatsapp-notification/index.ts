import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_WHATSAPP_NUMBER = Deno.env.get("TWILIO_WHATSAPP_NUMBER");

// --- WhatsApp provider abstraction ---
// WHATSAPP_PROVIDER env var can force a choice; otherwise prefers MSG91 (default
// vendor) when configured, falling back to Twilio.
const MSG91_AUTH_KEY = Deno.env.get("MSG91_AUTH_KEY");
const MSG91_WHATSAPP_INTEGRATED_NUMBER = Deno.env.get("MSG91_WHATSAPP_INTEGRATED_NUMBER");
// Meta-approved template name/language/namespace (business-initiated WhatsApp messages
// must use a pre-approved template, not freeform text). The template must have exactly
// one body variable that the full notification message is substituted into.
const MSG91_WHATSAPP_TEMPLATE_NAME = Deno.env.get("MSG91_WHATSAPP_TEMPLATE_NAME");
const MSG91_WHATSAPP_TEMPLATE_LANGUAGE = Deno.env.get("MSG91_WHATSAPP_TEMPLATE_LANGUAGE") || "en";
const MSG91_WHATSAPP_NAMESPACE = Deno.env.get("MSG91_WHATSAPP_NAMESPACE");
const whatsappProvider = Deno.env.get("WHATSAPP_PROVIDER") ??
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

interface WhatsAppNotificationRequest {
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

  let parsed: WhatsAppNotificationRequest;
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
    if (!whatsappProvider) {
      console.error("No WhatsApp provider configured: set MSG91_AUTH_KEY or TWILIO_ACCOUNT_SID");
      return new Response(
        JSON.stringify({ error: "WhatsApp service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const normalizedPhone = to.replace(/\D/g, "");

    let externalId: string | undefined;
    let deliveryStatus = "sent";

    if (whatsappProvider === "msg91") {
      if (!MSG91_AUTH_KEY || !MSG91_WHATSAPP_INTEGRATED_NUMBER || !MSG91_WHATSAPP_TEMPLATE_NAME) {
        console.error("MSG91 WhatsApp credentials are not properly configured");
        return new Response(
          JSON.stringify({ error: "WhatsApp service not configured" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const msg91Response = await fetch(
        "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
        {
          method: "POST",
          headers: {
            "authkey": MSG91_AUTH_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            integrated_number: MSG91_WHATSAPP_INTEGRATED_NUMBER,
            content_type: "template",
            payload: {
              messaging_product: "whatsapp",
              type: "template",
              template: {
                name: MSG91_WHATSAPP_TEMPLATE_NAME,
                language: { code: MSG91_WHATSAPP_TEMPLATE_LANGUAGE, policy: "deterministic" },
                ...(MSG91_WHATSAPP_NAMESPACE ? { namespace: MSG91_WHATSAPP_NAMESPACE } : {}),
                to_and_components: [
                  {
                    to: [normalizedPhone],
                    components: {
                      body_1: { type: "text", value: message },
                    },
                  },
                ],
              },
            },
          }),
        }
      );

      const msg91Data = await msg91Response.json();
      if (!msg91Response.ok) {
        console.error("MSG91 WhatsApp error:", msg91Data);
        throw new Error(msg91Data.message || "MSG91 WhatsApp delivery failed");
      }
      externalId = msg91Data.request_id || msg91Data.data?.[0]?.messageId;
    } else {
      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_NUMBER) {
        console.error("Twilio WhatsApp credentials are not properly configured");
        return new Response(
          JSON.stringify({ error: "WhatsApp service not configured" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const formattedPhone = normalizedPhone.startsWith("+") ? normalizedPhone : `+${normalizedPhone}`;

      const whatsappResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          },
          body: new URLSearchParams({
            To: `whatsapp:${formattedPhone}`,
            From: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
            Body: message,
          }).toString(),
        }
      );

      const whatsappData = await whatsappResponse.json();
      if (!whatsappData.sid) {
        console.error("Twilio WhatsApp error:", whatsappData);
        throw new Error(whatsappData.message || "Twilio WhatsApp delivery failed");
      }
      externalId = whatsappData.sid;
      deliveryStatus = whatsappData.status;
    }

    try {
      await patchNotification(notificationId, {
        delivery_status: { whatsapp: deliveryStatus },
        external_ids: { whatsapp: externalId },
      });
      await insertLog({
        notification_id: notificationId,
        channel: "whatsapp",
        status: deliveryStatus,
        external_id: externalId,
        sent_at: new Date().toISOString(),
        delivered_at: deliveryStatus === "delivered" ? new Date().toISOString() : null,
      });
    } catch (dbError) {
      console.error("Database update error:", dbError);
    }

    return new Response(JSON.stringify({ provider: whatsappProvider, status: deliveryStatus, id: externalId }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-whatsapp-notification function:", error);
    try {
      await patchNotification(notificationId, { delivery_status: { whatsapp: "failed" } });
      await insertLog({
        notification_id: notificationId,
        channel: "whatsapp",
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
