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
const AI_MODEL = Deno.env.get("AI_MODEL");
const provider = Deno.env.get("AI_PROVIDER") ?? (LOVABLE_API_KEY ? "lovable" : OPENAI_API_KEY ? "openai" : undefined);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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

    const userId = claimsData.claims.sub as string;

    const { aiResponse, caseId, conversationId } = await req.json();

    if (!aiResponse || !caseId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: aiResponse, caseId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(caseId)) {
      return new Response(JSON.stringify({ error: "Invalid caseId format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!provider) {
      throw new Error("No AI provider configured: set LOVABLE_API_KEY or OPENAI_API_KEY");
    }

    // Fetch case context using RLS-scoped client (only returns user's own cases)
    const { data: caseData } = await supabase
      .from("cases")
      .select("title, description, type, status, court, notes")
      .eq("id", caseId)
      .single();

    const caseContext = caseData
      ? `Case: "${caseData.title}" | Type: ${caseData.type || "N/A"} | Court: ${caseData.court || "N/A"} | Status: ${caseData.status || "N/A"}`
      : "";

    console.log("Extracting insights for case:", caseId, "user:", userId);

    // Use AI tool calling to extract structured insights
    const extractionResponse = await fetch(
      provider === "lovable"
        ? "https://ai.gateway.lovable.dev/v1/chat/completions"
        : "https://api.openai.com/v1/chat/completions",
      {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider === "lovable" ? LOVABLE_API_KEY : OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL || (provider === "lovable" ? "google/gemini-3-flash-preview" : "gpt-4o-mini"),
        messages: [
          {
            role: "system",
            content: `You are a legal research extraction tool. Analyze the AI assistant's response and extract:
1. **Precedents**: Any court decisions, judgments, or case law referenced. Include case name, citation, court, year, key principles, and how it applies.
2. **AI Notes**: Legal reasoning, explanations, procedural guidance, statutory interpretations, practice tips, or strategic insights.

${caseContext ? `Context - ${caseContext}` : ""}

RULES:
- Only extract items that are genuinely present in the response
- Do NOT fabricate or hallucinate precedents or notes
- If the response contains no precedents or notes, return empty arrays
- For precedents, ensure case names and citations are accurate as stated in the response
- For AI notes, categorize them clearly (legal_reasoning, procedural_guidance, statutory_interpretation, practice_tip, strategic_insight, case_analysis)
- Keep notes concise but actionable`
          },
          {
            role: "user",
            content: `Extract precedents and AI notes from this AI legal assistant response:\n\n${aiResponse}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "save_case_insights",
              description: "Save extracted precedents and AI notes from the legal assistant response",
              parameters: {
                type: "object",
                properties: {
                  precedents: {
                    type: "array",
                    description: "Court decisions and case law referenced in the response",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Case name/title" },
                        citation: { type: "string", description: "Legal citation" },
                        court: { type: "string", description: "Court name (e.g., Supreme Court of India)" },
                        year: { type: "string", description: "Year of judgment" },
                        key_principles: { type: "string", description: "Key legal principles established" },
                        relevance_notes: { type: "string", description: "How this precedent applies to the current case" },
                        summary: { type: "string", description: "Brief summary of the judgment" }
                      },
                      required: ["title", "citation", "key_principles"],
                      additionalProperties: false
                    }
                  },
                  ai_notes: {
                    type: "array",
                    description: "Legal reasoning, guidance, and insights from the response",
                    items: {
                      type: "object",
                      properties: {
                        content: { type: "string", description: "The note content" },
                        category: {
                          type: "string",
                          enum: ["legal_reasoning", "procedural_guidance", "statutory_interpretation", "practice_tip", "strategic_insight", "case_analysis"],
                          description: "Category of the note"
                        }
                      },
                      required: ["content", "category"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["precedents", "ai_notes"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "save_case_insights" } }
      }),
    });

    if (!extractionResponse.ok) {
      if (extractionResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (extractionResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds to your account." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI extraction error:", extractionResponse.status);
      throw new Error("AI extraction failed");
    }

    const extractionData = await extractionResponse.json();

    // Parse tool call result
    const toolCall = extractionData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(
        JSON.stringify({ precedents: [], ai_notes: [], message: "No insights found in the response" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const insights = JSON.parse(toolCall.function.arguments);

    const savedPrecedents: any[] = [];
    const savedNotes: any[] = [];

    // Save precedents using RLS-scoped client
    if (insights.precedents && insights.precedents.length > 0) {
      for (const precedent of insights.precedents) {
        const { data: existing } = await supabase
          .from("case_precedents")
          .select("id")
          .eq("case_id", caseId)
          .eq("citation", precedent.citation)
          .maybeSingle();

        if (!existing) {
          const { data, error } = await supabase
            .from("case_precedents")
            .insert({
              case_id: caseId,
              user_id: userId,
              precedent_title: precedent.title,
              citation: precedent.citation,
              court: precedent.court || null,
              year: precedent.year || null,
              key_principles: precedent.key_principles,
              relevance_notes: precedent.relevance_notes || null,
              summary: precedent.summary || null,
              source: "ai_generated",
              source_conversation_id: conversationId || null,
              points: [],
            })
            .select()
            .single();

          if (error) {
            console.error("Error saving precedent:", error);
          } else {
            savedPrecedents.push(data);
          }
        }
      }
    }

    // Save AI notes using RLS-scoped client
    if (insights.ai_notes && insights.ai_notes.length > 0) {
      for (const note of insights.ai_notes) {
        const { data, error } = await supabase
          .from("ai_case_notes")
          .insert({
            case_id: caseId,
            user_id: userId,
            content: note.content,
            category: note.category,
            source_conversation_id: conversationId || null,
          })
          .select()
          .single();

        if (error) {
          console.error("Error saving AI note:", error);
        } else {
          savedNotes.push(data);
        }
      }
    }

    return new Response(
      JSON.stringify({
        precedents: savedPrecedents,
        ai_notes: savedNotes,
        message: `Extracted ${savedPrecedents.length} precedents and ${savedNotes.length} AI notes`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Extract case insights error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
