import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDocFragment, indianKanoonDocUrl, isIndianKanoonConfigured, searchIndianKanoon, stripHtml } from "../_shared/indianKanoon.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DISCLAIMER_WITH_CITATIONS =
  "This document was AI-drafted. Supporting case law citations were retrieved from Indian Kanoon's real case database (not AI-recalled), but relevance and summaries were AI-generated — a qualified advocate must review all content and citations before filing.";
const DISCLAIMER_NO_CITATIONS =
  "This document was AI-drafted. A qualified advocate must review all content before filing.";

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

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionOptions {
  messages: ChatMessage[];
  tools?: unknown[];
  tool_choice?: unknown;
  temperature?: number;
}

async function callChatCompletion(opts: ChatCompletionOptions): Promise<Response> {
  return fetch(PROVIDER_ENDPOINTS[provider!], {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PROVIDER_KEY[provider!]}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_MODEL || PROVIDER_DEFAULT_MODEL[provider!],
      messages: opts.messages,
      ...(opts.tools ? { tools: opts.tools, tool_choice: opts.tool_choice } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    }),
  });
}

// Sanitize text fields for prompt injection / length safety
const sanitize = (val: unknown, maxLen = 1000): string => {
  if (val == null) return "N/A";
  return String(val).substring(0, maxLen);
};

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
      console.error("No AI provider configured (missing LOVABLE_API_KEY, OPENAI_API_KEY, and GEMINI_API_KEY)");
      return new Response(JSON.stringify({ error: "AI configuration error. Please contact support." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Input validation ---
    let body: {
      caseId?: string;
      documentType?: string;
      additionalInstructions?: string;
      opponentPlaintText?: string;
      language?: string;
      includeCitations?: boolean;
    };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { caseId, documentType, additionalInstructions, opponentPlaintText, language, includeCitations } = body;

    if (!documentType || typeof documentType !== "string" || documentType.length > 200) {
      return new Response(JSON.stringify({ error: "Invalid input: documentType is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (documentType === "Written Statement" && !opponentPlaintText?.trim()) {
      return new Response(
        JSON.stringify({ error: "opponentPlaintText is required to draft a Written Statement" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (additionalInstructions && (typeof additionalInstructions !== "string" || additionalInstructions.length > 5000)) {
      return new Response(JSON.stringify({ error: "Invalid input: additionalInstructions too long (max 5000 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!caseId || !uuidRegex.test(caseId)) {
      return new Response(JSON.stringify({ error: "A valid caseId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Case ownership + full context (server-fetched, not trusted from client) ---
    const { data: caseData, error: caseError } = await supabase
      .from("cases")
      .select("title, case_number, type, court, description, summary, status, initiation_date, client_id")
      .eq("id", caseId)
      .single();

    if (caseError || !caseData) {
      return new Response(JSON.stringify({ error: "Case not found or access denied" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let clientBlock = "Not on file";
    if (caseData.client_id) {
      const { data: clientData } = await supabase
        .from("clients")
        .select("name, email, phone, address")
        .eq("id", caseData.client_id)
        .single();

      if (clientData) {
        clientBlock = `Name: ${sanitize(clientData.name, 200)} | Email: ${sanitize(clientData.email, 200)} | Phone: ${sanitize(clientData.phone, 50)} | Address: ${sanitize(clientData.address, 300)}`;
      }
    }

    const { data: partyRows } = await supabase
      .from("parties")
      .select("name, type, role, contact, email, address, mobile, profession, guardian_relation, guardian_name")
      .eq("case_id", caseId)
      .limit(40);

    const formatParty = (p: Record<string, unknown>) => {
      const guardianPart = p.guardian_name
        ? ` ${sanitize(p.guardian_relation, 10)} ${sanitize(p.guardian_name, 200)}`
        : "";
      return `- ${sanitize(p.name, 200)}${guardianPart}${p.role ? ` (${sanitize(p.role, 100)})` : ""} — Address: ${sanitize(p.address, 300)}, Contact: ${sanitize(p.contact || p.mobile, 50)}, Email: ${sanitize(p.email, 200)}`;
    };

    const petitioners = (partyRows || []).filter((p) => p.type === "petitioner").slice(0, 20);
    const respondents = (partyRows || []).filter((p) => p.type === "respondent").slice(0, 20);

    const { data: opponentRows } = await supabase
      .from("opponents")
      .select("name, advocate, contact, email, notes")
      .eq("case_id", caseId)
      .limit(20);

    const caseContext = `
CASE INFORMATION:
- Title: ${sanitize(caseData.title, 500)}
- Case Number: ${sanitize(caseData.case_number, 100)}
- Type: ${sanitize(caseData.type, 100)}
- Court: ${sanitize(caseData.court, 200)}
- Status: ${sanitize(caseData.status, 50)}
- Initiation Date: ${sanitize(caseData.initiation_date, 50)}
- Description: ${sanitize(caseData.description)}
- Summary: ${sanitize(caseData.summary)}

CLIENT: ${clientBlock}

PETITIONERS:
${petitioners.length > 0 ? petitioners.map(formatParty).join("\n") : "None on file"}

RESPONDENTS:
${respondents.length > 0 ? respondents.map(formatParty).join("\n") : "None on file"}

OPPONENTS / OPPOSING COUNSEL:
${(opponentRows || []).length > 0
  ? (opponentRows || [])
      .map((o) => `- ${sanitize(o.name, 200)}${o.advocate ? ` (Advocate: ${sanitize(o.advocate, 200)})` : ""} — Contact: ${sanitize(o.contact, 50)}, Email: ${sanitize(o.email, 200)}`)
      .join("\n")
  : "None on file"}`;

    // Supporting case law (when requested) is looked up separately via
    // Indian Kanoon search after drafting - never let the draft body itself
    // contain AI-recalled case names, since those would be unverified.
    const citationInstruction = `

CASE LAW: Do not reference or cite specific case law, judgments, or precedents by name within the drafted document itself. Any supporting case law is supplied separately from a verified source.`;

    const formattingInstruction = `

FORMATTING: Structure your output using this exact lightweight markup so it can be converted into a properly formatted Word document. Do not use any other markup, and do not wrap the whole output in a code block.
- Prefix centered headings/titles (court name, document title, section headings like "IN THE MATTER OF") with "## " on their own line. Combine with __underline__ for a document title that should be both centered and underlined, e.g. "## __PLAINT__".
- Wrap bold text in double asterisks: **bold**.
- Wrap underlined text in double underscores: __underlined__.
- Separate paragraphs with a blank line. Number paragraphs manually where appropriate (e.g. "1. ...", "2. ...").
- For any tabular information (e.g. schedule of properties, list of dates/hearings, list of documents/exhibits), use a markdown table: a header row, then a separator row of dashes, then data rows, with "|" separating columns.`;

    // Language is a drafting instruction only, not a pre-translation step - the
    // model drafts directly in the target language, same approach as
    // ai-legal-assistant. English stays the implicit default.
    const languageInstruction = language && language !== "en"
      ? `\n\nDraft the entire document in ${language} (ISO language code), including all headings and boilerplate. Keep case names, statute citations, and party names in their original form even if the surrounding text is translated.`
      : "";

    let systemPrompt: string;
    let userPrompt: string;

    if (documentType === "Written Statement") {
      systemPrompt = `You are an expert Indian legal drafting assistant. Draft a complete, properly formatted Written Statement in response to the opponent's Plaint provided below, under Indian civil procedure. Address each paragraph of the opponent's plaint point-by-point (admit/deny/state facts), raise preliminary objections where applicable, and include a prayer clause and verification clause. Use formal, precise legal language.${formattingInstruction}${citationInstruction}${languageInstruction}`;
      userPrompt = `${caseContext ? caseContext + "\n\n" : ""}OPPONENT'S PLAINT:
${sanitize(opponentPlaintText, 50000)}
${additionalInstructions ? `\nADDITIONAL INSTRUCTIONS:\n${sanitize(additionalInstructions, 5000)}` : ""}

Draft the complete Written Statement now.`;
    } else {
      systemPrompt = `You are an expert Indian legal drafting assistant. Draft a complete, properly formatted ${documentType} under Indian civil/criminal procedure — including cause-title, numbered paragraphs, prayer clause, and verification clause as applicable. Use formal, precise legal language appropriate for the jurisdiction implied by the case details.${formattingInstruction}${citationInstruction}${languageInstruction}`;
      userPrompt = `${caseContext ? caseContext + "\n\n" : ""}${additionalInstructions ? `ADDITIONAL INSTRUCTIONS:\n${sanitize(additionalInstructions, 5000)}\n\n` : ""}Draft the complete ${documentType} now.`;
    }

    // --- Call #1: draft the document (plain text) ---
    let draftedDocument: string;
    try {
      const draftResponse = await callChatCompletion({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      });

      if (!draftResponse.ok) {
        console.error("AI drafting error:", draftResponse.status, await draftResponse.text());
        return new Response(JSON.stringify({ error: "Document generation failed. Please try again." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const draftData = await draftResponse.json();
      draftedDocument = draftData.choices?.[0]?.message?.content;
      if (!draftedDocument) {
        return new Response(JSON.stringify({ error: "AI returned no content. Please try again." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (err) {
      console.error("Error calling AI provider for drafting:", err);
      return new Response(JSON.stringify({ error: "Document generation failed. Please try again." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Call #2: find supporting case law via Indian Kanoon search, not AI recall ---
    // Bounded pipeline (not an open-ended agent loop): generate a few search
    // queries -> search Indian Kanoon -> fetch a matching excerpt per
    // candidate -> ask the model to select/rank up to 5 BY INDEX. The model
    // never invents case names/citations - those come straight from Indian
    // Kanoon's real search results, keyed back by index, so the only thing
    // the model contributes is relevance judgement and excerpt summarizing.
    interface Citation {
      caseName: string;
      citationText: string;
      summary?: string;
      relevance?: string;
      points: string[];
      sourceUrl?: string;
    }
    let citations: Citation[] = [];
    if (includeCitations && isIndianKanoonConfigured()) {
      try {
        const queryResponse = await callChatCompletion({
          messages: [
            {
              role: "system",
              content: "Generate up to 4 short Indian Kanoon search queries (a few keywords each) that would find real Indian case law relevant to the legal issues in the drafted document below. Return ONLY a JSON array of strings, nothing else.",
            },
            { role: "user", content: draftedDocument.substring(0, 8000) },
          ],
          temperature: 0.3,
        });

        let queries: string[] = [];
        if (queryResponse.ok) {
          const qData = await queryResponse.json();
          const content: string = qData.choices?.[0]?.message?.content || "[]";
          try {
            const match = content.match(/\[[\s\S]*\]/);
            const parsed = JSON.parse(match ? match[0] : "[]");
            if (Array.isArray(parsed)) {
              queries = parsed.filter((q) => typeof q === "string" && q.trim()).slice(0, 4);
            }
          } catch (parseErr) {
            console.error("Failed to parse search query list:", parseErr);
          }
        }

        const seen = new Set<string>();
        const candidates: { tid: string; title: string; headline: string; docsource: string }[] = [];
        for (const q of queries) {
          try {
            const docs = await searchIndianKanoon(q, 3);
            for (const d of docs) {
              const tid = String(d.tid);
              if (!seen.has(tid)) {
                seen.add(tid);
                candidates.push({ tid, title: stripHtml(d.title), headline: stripHtml(d.headline), docsource: d.docsource || "" });
              }
            }
          } catch (err) {
            console.error("Indian Kanoon search failed for query:", q, err);
          }
        }
        const topCandidates = candidates.slice(0, 8);

        const withFragments = await Promise.all(
          topCandidates.map(async (c) => {
            try {
              const fragment = await getDocFragment(c.tid, queries[0] || c.title);
              return { ...c, fragment: fragment || c.headline };
            } catch {
              return { ...c, fragment: c.headline };
            }
          })
        );

        if (withFragments.length > 0) {
          const selectionResponse = await callChatCompletion({
            messages: [
              {
                role: "system",
                content: "You are a legal research assistant. From the numbered list of real, verified Indian Kanoon search results below, select up to 5 that are genuinely relevant to the drafted document. Reference each by its index only - do not restate or alter the case name/citation. Extract key points and relevance strictly from the given excerpt; do not add outside knowledge.",
              },
              {
                role: "user",
                content: `DRAFT:\n${draftedDocument.substring(0, 8000)}\n\nCANDIDATE CASES (verified via Indian Kanoon):\n${withFragments.map((c, i) => `${i + 1}. ${c.title} (${c.docsource})\nExcerpt: ${c.fragment}`).join("\n\n")}`,
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "select_citations",
                  description: "Select up to 5 relevant candidate cases by index",
                  parameters: {
                    type: "object",
                    properties: {
                      selections: {
                        type: "array",
                        maxItems: 5,
                        items: {
                          type: "object",
                          properties: {
                            index: { type: "integer", description: "1-based index of the candidate case being selected" },
                            relevance: { type: "string", description: "How this case supports the draft" },
                            points: { type: "array", items: { type: "string" }, description: "Key point bullets from the excerpt" },
                          },
                          required: ["index", "relevance", "points"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["selections"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "select_citations" } },
          });

          if (selectionResponse.ok) {
            const selData = await selectionResponse.json();
            const toolCall = selData.choices?.[0]?.message?.tool_calls?.[0];
            if (toolCall) {
              try {
                const parsed = JSON.parse(toolCall.function.arguments);
                if (Array.isArray(parsed.selections)) {
                  citations = parsed.selections
                    .map((s: { index: number; relevance?: string; points?: string[] }) => {
                      const candidate = withFragments[s.index - 1];
                      if (!candidate) return null;
                      return {
                        caseName: candidate.title,
                        citationText: candidate.docsource,
                        summary: candidate.fragment,
                        relevance: s.relevance,
                        points: Array.isArray(s.points) ? s.points.slice(0, 8) : [],
                        sourceUrl: indianKanoonDocUrl(candidate.tid),
                      } as Citation;
                    })
                    .filter((c): c is Citation => c !== null)
                    .slice(0, 5);
                }
              } catch (parseErr) {
                console.error("Failed to parse citation selection:", parseErr);
              }
            }
          } else {
            console.error("Citation selection error:", selectionResponse.status, await selectionResponse.text());
          }
        }
      } catch (err) {
        console.error("Indian Kanoon citation pipeline failed:", err);
        // Citation lookup failing should not block returning the drafted document
      }
    }

    const baseDisclaimer = citations.length > 0 ? DISCLAIMER_WITH_CITATIONS : DISCLAIMER_NO_CITATIONS;
    const disclaimer = languageInstruction
      ? `${baseDisclaimer} This document was also drafted directly in a non-English language — legal terminology accuracy in translation should be independently verified by a qualified advocate.`
      : baseDisclaimer;

    return new Response(
      JSON.stringify({
        document: draftedDocument,
        documentType,
        citations,
        citationsIncluded: !!includeCitations,
        citationsUnavailable: !!includeCitations && !isIndianKanoonConfigured(),
        disclaimer,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in draft-legal-document function:", error);
    return new Response(JSON.stringify({ error: "Request processing failed. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
