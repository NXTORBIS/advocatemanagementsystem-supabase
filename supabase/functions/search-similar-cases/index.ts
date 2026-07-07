
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = claimsData.claims.sub as string;

    if (!openAIApiKey) {
      console.error("OpenAI API key is missing");
      return new Response(JSON.stringify({ error: "API configuration error." }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!supabaseUrl) {
      console.error("Supabase configuration is missing");
      return new Response(JSON.stringify({ error: "API configuration error." }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    let precedentId: string, caseId: string;
    try {
      const requestData = await req.json();
      precedentId = requestData.precedentId;
      caseId = requestData.caseId;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (!precedentId || !caseId) {
      return new Response(JSON.stringify({ error: "Precedent ID and Case ID are required" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate UUID format
    if (!uuidRegex.test(precedentId) || !uuidRegex.test(caseId)) {
      return new Response(JSON.stringify({ error: "Invalid ID format" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Use user-scoped client (RLS enforced) - only returns user's own data
    const { data: precedent, error: precedentError } = await supabase
      .from('case_precedents')
      .select('*')
      .eq('id', precedentId)
      .single();
      
    if (precedentError || !precedent) {
      return new Response(JSON.stringify({ error: "Precedent not found or access denied" }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const precedentDescription = `
      Title: ${precedent.precedent_title || 'N/A'}
      ${precedent.citation ? `Citation: ${precedent.citation}` : 'No citation available'}
      Key Points: ${Array.isArray(precedent.points) ? precedent.points.join('; ') : 'No points available'}
      ${precedent.summary ? `Summary: ${precedent.summary}` : 'No summary available'}
      ${precedent.relevance_notes ? `Relevance Notes: ${precedent.relevance_notes}` : 'No relevance notes available'}
    `.trim();
    
    let keyLegalConcepts: string;
    try {
      const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAIApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a legal assistant that helps find similar cases based on precedent details.' },
            { role: 'user', content: `Based on this legal precedent, extract 3-5 key legal concepts that would be relevant for finding similar cases: ${precedentDescription}` }
          ],
          temperature: 0.3
        })
      });
      
      if (!openAIResponse.ok) {
        console.error("OpenAI API error:", await openAIResponse.text());
        return new Response(JSON.stringify({ error: 'AI processing failed. Please try again.' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const aiData = await openAIResponse.json();
      if (!aiData.choices?.[0]?.message?.content) {
        return new Response(JSON.stringify({ error: 'AI returned no content. Please try again.' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      keyLegalConcepts = aiData.choices[0].message.content;
    } catch (openAIError) {
      console.error("Error calling OpenAI API:", openAIError);
      return new Response(JSON.stringify({ error: 'AI processing failed. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // RLS-scoped query: only returns the current user's cases
    const { data: allCases, error: casesError } = await supabase
      .from('cases')
      .select('id, title, case_number, type, status, summary, court, initiation_date')
      .neq('id', caseId)
      .limit(100);
      
    if (casesError) {
      console.error("Error fetching cases:", casesError);
      return new Response(JSON.stringify({ error: 'Failed to fetch cases.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (!allCases || allCases.length === 0) {
      return new Response(JSON.stringify({ similarCases: [], keyLegalConcepts }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // RLS-scoped: only user's own precedents
    const { data: allPrecedents } = await supabase
      .from('case_precedents')
      .select('*')
      .in('case_id', allCases.map(c => c.id));
    
    try {
      const similaritiesPrompt = `
        I have a legal precedent with these key legal concepts:
        ${keyLegalConcepts}
        
        Please rank the following cases by similarity to these concepts, returning only the IDs of the top 5 most similar cases.
        Only return the case IDs in JSON format like: {"similar_cases": ["case-id-1", "case-id-2", ...]}. No other text.
        
        ${allCases.map(c => {
          const casePrecedents = allPrecedents ? allPrecedents.filter(p => p.case_id === c.id) : [];
          return `
            Case ID: ${c.id}
            Title: ${c.title || 'N/A'}
            Case Number: ${c.case_number || 'N/A'}
            Type: ${c.type || 'N/A'}
            Court: ${c.court || 'N/A'}
            Summary: ${c.summary || 'N/A'}
            Related Precedents: ${casePrecedents.length > 0 ? casePrecedents.map(p => 
              `[${p.precedent_title || 'Untitled'}${p.citation ? ` (${p.citation})` : ''}: ${Array.isArray(p.points) ? p.points.join('; ') : 'No points'}${p.summary ? ` - ${p.summary}` : ''}]`
            ).join(' ') : 'No related precedents'}
          `;
        }).join('\n\n')}
      `;
      
      const rankingResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAIApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a legal assistant that ranks cases by similarity. Only respond with JSON.' },
            { role: 'user', content: similaritiesPrompt }
          ],
          temperature: 0.2,
          response_format: { type: "json_object" }
        })
      });
      
      if (!rankingResponse.ok) {
        console.error("OpenAI API error (ranking):", await rankingResponse.text());
        return new Response(JSON.stringify({ error: 'AI ranking failed. Please try again.' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const rankingData = await rankingResponse.json();
      if (!rankingData.choices?.[0]?.message?.content) {
        return new Response(JSON.stringify({ similarCases: [], keyLegalConcepts }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      let similarCaseIds: string[] = [];
      try {
        const parsedContent = JSON.parse(rankingData.choices[0].message.content);
        similarCaseIds = parsedContent.similar_cases || [];
        if (!Array.isArray(similarCaseIds)) throw new Error('Expected array');
        // Validate all IDs are UUIDs
        similarCaseIds = similarCaseIds.filter(id => uuidRegex.test(id));
      } catch {
        return new Response(JSON.stringify({ similarCases: [], keyLegalConcepts }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      if (similarCaseIds.length === 0) {
        return new Response(JSON.stringify({ similarCases: [], keyLegalConcepts }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // RLS-scoped: only user's own cases
      const { data: similarCases } = await supabase
        .from('cases')
        .select('id, title, case_number, type, status, summary, court, initiation_date, case_precedents (*)')
        .in('id', similarCaseIds)
        .limit(5);
      
      return new Response(JSON.stringify({ similarCases: similarCases || [], keyLegalConcepts }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (rankingError) {
      console.error("Error in case ranking:", rankingError);
      return new Response(JSON.stringify({ error: 'Case ranking failed. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Request processing failed.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
