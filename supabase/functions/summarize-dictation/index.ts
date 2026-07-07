import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const AI_MODEL = Deno.env.get("AI_MODEL");
const provider = Deno.env.get("AI_PROVIDER") ?? (LOVABLE_API_KEY ? "lovable" : OPENAI_API_KEY ? "openai" : undefined);

async function callChatCompletion(messages: { role: string; content: string }[]): Promise<Response> {
  if (provider === "lovable") {
    return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL || "google/gemini-2.5-pro",
        messages,
        temperature: 0.3,
      }),
    });
  }

  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_MODEL || "gpt-4o-mini",
      messages,
      temperature: 0.3,
    }),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!provider) {
      console.error("No AI provider configured (missing LOVABLE_API_KEY and OPENAI_API_KEY)");
      return new Response(JSON.stringify({ error: "AI configuration error. Please contact support." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: { transcript?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { transcript } = body;
    if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
      return new Response(JSON.stringify({ error: "transcript is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sanitizedTranscript = transcript.substring(0, 20000);

    const systemPrompt =
      "You clean up dictated speech for a busy advocate into a well-formed paragraph. Remove filler words (um, uh), false starts, and repetition. Preserve every fact, name, date, and legal term exactly as said — do not add anything that wasn't said, and do not add commentary. Return only the cleaned text, nothing else.";

    let cleanedText: string;
    try {
      const response = await callChatCompletion([
        { role: "system", content: systemPrompt },
        { role: "user", content: sanitizedTranscript },
      ]);

      if (!response.ok) {
        console.error("AI cleanup error:", response.status, await response.text());
        return new Response(JSON.stringify({ error: "Cleanup failed. Please try again." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      cleanedText = data.choices?.[0]?.message?.content;
      if (!cleanedText) {
        return new Response(JSON.stringify({ error: "AI returned no content. Please try again." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (err) {
      console.error("Error calling AI provider for dictation cleanup:", err);
      return new Response(JSON.stringify({ error: "Cleanup failed. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ cleanedText: cleanedText.trim() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in summarize-dictation function:", error);
    return new Response(JSON.stringify({ error: "Request processing failed. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
