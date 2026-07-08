import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- AI provider abstraction ---
// Prefers whichever key is configured; AI_PROVIDER env var can force a choice.
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const AI_MODEL = Deno.env.get("AI_MODEL");
const provider = Deno.env.get("AI_PROVIDER") ??
  (LOVABLE_API_KEY ? "lovable" : OPENAI_API_KEY ? "openai" : GEMINI_API_KEY ? "gemini" : undefined);

const PROVIDER_ENDPOINTS: Record<string, string> = {
  lovable: "https://ai.gateway.lovable.dev/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
};

const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
  lovable: "google/gemini-2.5-pro",
  openai: "gpt-4o",
  gemini: "gemini-2.5-flash",
};

const PROVIDER_KEY: Record<string, string | undefined> = {
  lovable: LOVABLE_API_KEY,
  openai: OPENAI_API_KEY,
  gemini: GEMINI_API_KEY,
};

const SYSTEM_PROMPT = `You are an AI Legal Assistant integrated into an Advocate Management Application. You answer legal questions using documents when available and general legal knowledge when documents are not provided.

🔄 Internal Modes — Automatically determine and operate in one of the following modes:

1. DOCUMENT_MODE → A document is directly uploaded or provided inline.
   - Treat the uploaded document as the primary source of truth.
   - Answer based on the document's content.
   - Cite relevant clauses, sections, headings, or paragraph numbers (e.g., "Section 4.2", "Clause 7(a)", "Paragraph 12").
   - Use general legal knowledge only to explain or clarify the document.
   - Do not introduce facts or conclusions not supported by the document.

2. CASE_MODE → One or more case documents are referenced via case context.
   - Use only the selected case document(s) and provided case context.
   - Clearly identify which document(s) or case details are being cited.
   - Cross-reference documents when relevant.
   - Provide clause/section/paragraph-level citations where possible.
   - Do not rely on documents outside the referenced case files.

3. GENERAL_MODE → No document is provided, or the question is generic.
   - Answer using general legal principles.
   - Provide high-level, jurisdiction-agnostic explanations by default.
   - If a jurisdiction is specified, tailor the response accordingly.
   - Clearly state that the answer is based on general legal knowledge, not a specific document.

Always select the most appropriate mode before responding, and explicitly state the active mode at the start of your response.

Multi-Jurisdiction Rules:
- Do not assume a jurisdiction unless explicitly stated.
- If multiple jurisdictions are mentioned, highlight key differences.
- If jurisdiction is unclear and material to the answer, state the assumption or ask for clarification.
- When Indian law is relevant, prefer Indian statutes (IPC, CrPC, Constitution), procedures, and Supreme Court / High Court precedents.

Transparency & Citations:
- In every response, indicate the source: Uploaded document, Case document(s), or General legal knowledge.
- Include citations to document sections or paragraphs whenever applicable.
- Tag applicable court decisions and legal principles as "Precedents."
- Tag explanations, clarifications, legal reasoning, and practice guidance as "AI Notes."

Boundaries:
- Do not fabricate document content or citations.
- Do not provide definitive legal advice — clarify that outputs are assistive insights, not judicial decisions.
- If the document does not contain enough information, state the limitation and optionally provide general context.
- Maintain strict confidentiality.
- The AI should supplement existing case data and never replace user-entered content. All AI-generated material must be clearly labeled as AI-assisted.

Output Structure:
- Use headings, numbered sections, and clear legal terminology.
- Provide short, precise explanations.

Tone: Clear, neutral, professional, and easy to understand.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Authentication ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Create an RLS-scoped client using the caller's token
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

    const userId = claimsData.claims.sub as string;

    const { messages, conversationId, caseId, language } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Invalid request: messages array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!provider) {
      throw new Error("No AI provider configured: set LOVABLE_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY");
    }

    // If we have case context, fetch case details using RLS-scoped client
    let caseContext = "";
    if (caseId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(caseId)) {
        return new Response(JSON.stringify({ error: "Invalid caseId format" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: caseData } = await supabase
        .from("cases")
        .select("title, description, type, status, court, judge, opposing_counsel, notes")
        .eq("id", caseId)
        .single();
      
      if (caseData) {
        caseContext = `\n\nCurrent Case Context:
- Title: ${caseData.title}
- Type: ${caseData.type || "Not specified"}
- Status: ${caseData.status || "Not specified"}
- Court: ${caseData.court || "Not specified"}
- Judge: ${caseData.judge || "Not specified"}
- Opposing Counsel: ${caseData.opposing_counsel || "Not specified"}
- Description: ${caseData.description || "Not provided"}
- Notes: ${caseData.notes || "None"}`;
      }
    }

    // If the user has selected a non-English language, instruct the model to
    // respond in it. No pre-translation needed - the model natively supports
    // a very wide range of languages given a plain instruction like this.
    const languageInstruction = language && language !== "en"
      ? `\n\nRespond in ${language} (ISO language code). Keep legal terminology precise; if a term is more standard in English, you may include the English term in parentheses.`
      : "";

    // Prepare messages with system prompt
    const aiMessages = [
      { role: "system", content: SYSTEM_PROMPT + caseContext + languageInstruction },
      ...messages,
    ];

    console.log("Sending request to AI gateway with", aiMessages.length, "messages for user", userId);

    const response = await fetch(PROVIDER_ENDPOINTS[provider], {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PROVIDER_KEY[provider]}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL || PROVIDER_DEFAULT_MODEL[provider],
        messages: aiMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds to your account." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI gateway error:", response.status);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("AI Legal Assistant error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
