
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface Party {
  name?: string;
  address?: string;
  mobile?: string;
}

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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = claimsData.claims.sub;

    const { caseDetails, documentType, additionalInstructions } = await req.json();

    // Input validation
    if (!caseDetails || typeof caseDetails !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid input: caseDetails is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!documentType || typeof documentType !== 'string' || documentType.length > 200) {
      return new Response(JSON.stringify({ error: 'Invalid input: documentType is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (additionalInstructions && (typeof additionalInstructions !== 'string' || additionalInstructions.length > 5000)) {
      return new Response(JSON.stringify({ error: 'Invalid input: additionalInstructions too long (max 5000 chars)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify user owns the case if case ID provided
    if (caseDetails.id) {
      const { data: caseData, error: caseError } = await supabase
        .from('cases')
        .select('id')
        .eq('id', caseDetails.id)
        .single();

      if (caseError || !caseData) {
        return new Response(JSON.stringify({ error: 'Case not found or access denied' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    if (!openAIApiKey) {
      console.error("OpenAI API key is missing");
      return new Response(
        JSON.stringify({ error: "API configuration error. Please contact support." }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Sanitize text fields for prompt
    const sanitize = (val: unknown, maxLen = 1000): string => {
      if (val == null) return 'N/A';
      return String(val).substring(0, maxLen);
    };

    let systemPrompt = `You are an expert legal document generator with experience in ${sanitize(caseDetails.type, 100)} law. 
Create a professional, well-structured ${sanitize(documentType, 100)} based on the following information. 
Format the document properly with all necessary legal sections and clauses.
Use formal, precise legal language appropriate for the jurisdiction implied by the case details.`;

    let userPrompt = `Generate a complete ${sanitize(documentType, 100)} with the following details:

CASE INFORMATION:
- Title: ${sanitize(caseDetails.title, 500)}
- Case Number: ${sanitize(caseDetails.caseNumber, 100)}
- Type: ${sanitize(caseDetails.type, 100)}
- Court: ${sanitize(caseDetails.courtName, 200)}
- Description: ${sanitize(caseDetails.description)}
- Summary: ${sanitize(caseDetails.summary)}
- Current Status: ${sanitize(caseDetails.status, 50)}
- Initiation Date: ${sanitize(caseDetails.initiationDate, 50)}

CLIENT INFORMATION:
${caseDetails.client ? `- Name: ${sanitize(caseDetails.client.firstName, 100)} ${sanitize(caseDetails.client.lastName, 100)}
- Contact: ${sanitize(caseDetails.client.email, 200)}, ${sanitize(caseDetails.client.phone?.mobile, 50)}
- Address: ${sanitize(caseDetails.client.address?.street, 200)}, ${sanitize(caseDetails.client.address?.city, 100)}, ${sanitize(caseDetails.client.address?.state, 100)} ${sanitize(caseDetails.client.address?.zipCode, 20)}
` : '- Client information not available'}

${caseDetails.petitioners && Array.isArray(caseDetails.petitioners) && caseDetails.petitioners.length > 0 ? 
`PETITIONERS:
${caseDetails.petitioners.slice(0, 20).map((p: Party) => `- ${sanitize(p.name, 200)}, ${sanitize(p.address, 300)}, ${sanitize(p.mobile, 50)}`).join('\n')}` : ''}

${caseDetails.respondents && Array.isArray(caseDetails.respondents) && caseDetails.respondents.length > 0 ? 
`RESPONDENTS:
${caseDetails.respondents.slice(0, 20).map((r: Party) => `- ${sanitize(r.name, 200)}, ${sanitize(r.address, 300)}, ${sanitize(r.mobile, 50)}`).join('\n')}` : ''}

${additionalInstructions ? `ADDITIONAL INSTRUCTIONS:\n${sanitize(additionalInstructions, 5000)}` : ''}

Create the document in a format that can be easily copied and used in a legal context. Include all necessary sections, proper formatting, and placeholder text where specific information may be missing.`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('OpenAI API error:', errorData);
        return new Response(JSON.stringify({ error: 'Document generation failed. Please try again.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const data = await response.json();
      const generatedDocument = data.choices[0].message.content;

      return new Response(JSON.stringify({ 
        document: generatedDocument,
        documentType: documentType,
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (openaiError: unknown) {
      console.error('OpenAI API communication error:', openaiError);
      return new Response(JSON.stringify({ error: 'Document generation failed. Please try again.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error: unknown) {
    console.error('Error in generate-legal-document function:', error);
    return new Response(JSON.stringify({ error: 'Request processing failed. Please try again.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
