import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface NotificationResult {
  error?: string;
  [key: string]: unknown;
}

interface NotificationResults {
  email: NotificationResult | null;
  sms: NotificationResult | null;
  whatsapp: NotificationResult | null;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    const userId = claimsData.claims.sub as string;

    const { notificationId } = await req.json();

    if (!notificationId || typeof notificationId !== 'string' || !uuidRegex.test(notificationId)) {
      return new Response(JSON.stringify({ error: "Valid notification ID is required" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // Verify user owns this notification using RLS-scoped client
    const { data: notificationCheck, error: notifCheckError } = await userClient
      .from('notifications')
      .select('id')
      .eq('id', notificationId)
      .single();

    if (notifCheckError || !notificationCheck) {
      return new Response(JSON.stringify({ error: "Notification not found or access denied" }), {
        status: 404, headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // Use service role for cross-table lookups needed for notification processing
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch notification details
    const { data: notification, error: notifError } = await serviceClient
      .from('notifications')
      .select('*')
      .eq('id', notificationId)
      .eq('user_id', userId)
      .single();

    if (notifError || !notification) {
      return new Response(JSON.stringify({ error: "Notification not found" }), {
        status: 404, headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // Fetch user profile
    const { data: user, error: userError } = await serviceClient
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "User profile not found" }), {
        status: 404, headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    const contactInfo = user.contact_info || {};

    // Fetch notification preferences
    const { data: preferences } = await serviceClient
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    const userPrefs = preferences?.[0] || {
      email: false, sms: false, whatsapp: false,
      hearing_reminders: false, document_notifications: false,
      task_reminders: false, payment_reminders: false,
    };

    const sendEmail = userPrefs.email;
    const sendSMS = userPrefs.sms;
    const sendWhatsApp = userPrefs.whatsapp;
    
    let notificationTypeEnabled = true;
    switch (notification.type) {
      case 'hearing': notificationTypeEnabled = userPrefs.hearing_reminders; break;
      case 'document': notificationTypeEnabled = userPrefs.document_notifications; break;
      case 'task': notificationTypeEnabled = userPrefs.task_reminders; break;
      case 'payment': notificationTypeEnabled = userPrefs.payment_reminders; break;
    }

    if (!notificationTypeEnabled) {
      return new Response(JSON.stringify({ message: "Notification type disabled by user preferences", skipped: true }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    const results: NotificationResults = { email: null, sms: null, whatsapp: null };

    if (sendEmail && user.phone_number) {
      try {
        const emailResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-email-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({
            notificationId: notification.id, to: user.phone_number,
            subject: notification.title, message: notification.message,
            type: notification.type, relatedId: notification.related_id,
          }),
        });
        results.email = await emailResponse.json();
      } catch (emailError: unknown) {
        console.error("Error sending email:", emailError);
        results.email = { error: 'Email delivery failed' };
      }
    }

    const phoneNumber = user.phone_number || (contactInfo as Record<string, string>).phone;
    if (sendSMS && phoneNumber) {
      try {
        const smsResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-sms-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({
            notificationId: notification.id, to: phoneNumber,
            message: `${notification.title}: ${notification.message}`, type: notification.type,
          }),
        });
        results.sms = await smsResponse.json();
      } catch (smsError: unknown) {
        console.error("Error sending SMS:", smsError);
        results.sms = { error: 'SMS delivery failed' };
      }
    }

    const whatsappNumber = (contactInfo as Record<string, string>).whatsapp || phoneNumber;
    if (sendWhatsApp && whatsappNumber) {
      try {
        const whatsappResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({
            notificationId: notification.id, to: whatsappNumber,
            message: `${notification.title}: ${notification.message}`, type: notification.type,
          }),
        });
        results.whatsapp = await whatsappResponse.json();
      } catch (whatsappError: unknown) {
        console.error("Error sending WhatsApp:", whatsappError);
        results.whatsapp = { error: 'WhatsApp delivery failed' };
      }
    }

    return new Response(JSON.stringify({ message: "Notification processed", results }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  } catch (error: unknown) {
    console.error("Error in process-notification:", error);
    return new Response(JSON.stringify({ error: "Notification processing failed" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
};

serve(handler);
