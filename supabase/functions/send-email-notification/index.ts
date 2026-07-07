import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "notifications@example.com";
const APP_URL = Deno.env.get("APP_URL") || "http://localhost:5173";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const escapeHtml = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

interface EmailNotificationRequest {
  notificationId: string;
  to: string;
  subject: string;
  message: string;
  type: string;
  relatedId?: string;
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

  // Require an authenticated caller (user JWT or service role from internal orchestrator)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
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
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }

  let parsed: EmailNotificationRequest;
  try {
    parsed = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const { notificationId, to, subject, message, type, relatedId } = parsed;

  if (!notificationId || !UUID_RE.test(notificationId)) {
    return new Response(JSON.stringify({ error: "Invalid notificationId" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  if (!to || typeof to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return new Response(JSON.stringify({ error: "Invalid recipient" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  if (relatedId && !UUID_RE.test(relatedId)) {
    return new Response(JSON.stringify({ error: "Invalid relatedId" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not set");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let actionLink = APP_URL;
    if (relatedId) {
      switch (type) {
        case "case": actionLink = `${APP_URL}/cases/${relatedId}`; break;
        case "hearing": actionLink = `${APP_URL}/court-diary?hearingId=${relatedId}`; break;
        case "client": actionLink = `${APP_URL}/clients?clientId=${relatedId}`; break;
        case "document": actionLink = `${APP_URL}/documents?documentId=${relatedId}`; break;
        case "task": actionLink = `${APP_URL}/todos?todoId=${relatedId}`; break;
        default: actionLink = `${APP_URL}/notifications`;
      }
    }

    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message);
    const safeLink = escapeHtml(actionLink);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
            <h2 style="color: #2563eb;">${safeSubject}</h2>
            <p style="font-size: 16px; line-height: 1.5; color: #333;">${safeMessage}</p>
            <div style="margin-top: 30px;">
              <a href="${safeLink}" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 5px;">View Details</a>
            </div>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 14px; color: #666;">
              <p>You received this email because you enabled email notifications. To manage your notification preferences, visit your profile settings.</p>
            </div>
          </div>
        `,
      }),
    });

    const emailResult = await emailResponse.json();

    if (emailResult.id) {
      try {
        await patchNotification(notificationId, {
          delivery_status: { email: "delivered" },
          external_ids: { email: emailResult.id },
        });
        await insertLog({
          notification_id: notificationId,
          channel: "email",
          status: "delivered",
          external_id: emailResult.id,
          sent_at: new Date().toISOString(),
          delivered_at: new Date().toISOString(),
        });
      } catch (dbError) {
        console.error("Database update error:", dbError);
      }
    }

    return new Response(JSON.stringify(emailResult), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-email-notification function:", error);
    try {
      await patchNotification(notificationId, { delivery_status: { email: "failed" } });
      await insertLog({
        notification_id: notificationId,
        channel: "email",
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
