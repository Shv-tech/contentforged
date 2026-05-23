export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai'; // Required for the Groq fallback

export async function POST(req: Request) {
  try {
    // Safely parse the body so a malformed request from the client won't crash the server
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const { topic = "General Topic", step, outline = [], chapterTitle = "", provider = "openai", secureUserId } = body;
    
    const openAiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const supabase = createClient();

    let replyText = "";
    let tokensConsumed = 0;

    // ==========================================
    // STEP A: GENERATE THE OUTLINE
    // ==========================================
    if (step === 'outline') {
      const systemInstruction = `You are an apex-level polymath and the world's most authoritative non-fiction architect. You possess absolute, cutting-edge knowledge across all scientific, technical, and cultural domains. Output STRICTLY a valid JSON object. ABSOLUTELY NO EM DASHES allowed.`;
      
      const userInstruction = `The user requires a definitive, paradigm-shifting 5-chapter table of contents for a masterclass ebook about: "${topic}".

Directives:
1. Titles must be magnetic, high-status, and authoritative. Zero clichÃ© marketing fluff.
2. The progression must map a flawless logical escalation from foundational principles to advanced, frontier-level mastery.
3. Rely strictly on the absolute latest paradigms. Exclude all outdated theories or legacy concepts.
4. ABSOLUTELY NO EM DASHES allowed in your output. Do not use them under any circumstances.

Output STRICTLY a valid JSON object with a single key "chapters" containing an array of exactly 5 strings representing the chapter titles. 
Example format: { "chapters": ["Chapter 1: The Genesis Protocol", "Chapter 2: Architectural Foundations"] }
Do not output any conversational text, markdown blocks, or explanations. Only the raw JSON.`;

      let content = '{"chapters": []}';

      try {
        // ----------------------------------------------------------------------
        // TIER 1: PRIMARY EXECUTION (Anthropic / OpenAI)
        // ----------------------------------------------------------------------
        if (provider === 'anthropic' && anthropicKey) {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': anthropicKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 1500,
              system: systemInstruction,
              messages: [{ role: 'user', content: userInstruction }]
            })
          });
          
          const data = await response.json();
          if (!response.ok) throw new Error(data.error?.message || 'Anthropic API Error');
          
          content = data.content[0].text;
          tokensConsumed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

        } else {
          // Fallback to OpenAI if selected
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openAiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: userInstruction }
              ],
              response_format: { type: "json_object" }
            })
          });

          const data = await response.json();
          if (!response.ok) throw new Error(data.error?.message || 'OpenAI API Error');

          content = data.choices[0].message.content || '{"chapters": []}';
          tokensConsumed = data.usage?.total_tokens || 0;
        }

      } catch (primaryError: any) {
        // ----------------------------------------------------------------------
        // TIER 2: FAILOVER EXECUTION (Groq + Llama 3 70B)
        // ----------------------------------------------------------------------
        console.warn("Primary API Failed on Outline. Engaging Groq.", primaryError?.message);
        
        const groqKey = process.env.GROQ_API_KEY;
        if (!groqKey) throw new Error("API Limit Reached and no Fallback Key configured.");

        const groqAI = new OpenAI({ apiKey: groqKey, baseURL: 'https://api.groq.com/openai/v1' });
        const fallbackRes = await groqAI.chat.completions.create({
          model: 'llama3-70b-8192',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userInstruction }
          ],
          response_format: { type: "json_object" },
          temperature: 0.2
        });

        content = fallbackRes.choices[0].message.content || '{"chapters": []}';
        tokensConsumed = fallbackRes.usage?.total_tokens || 0;
      }

      // Safe JSON Parsing Pipeline (strips markdown formatting if models hallucinate it)
      let chapters: string[] = [];
      try {
        const cleanedContent = content.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanedContent);
        
        if (parsed.chapters && Array.isArray(parsed.chapters)) {
          chapters = parsed.chapters;
        } else {
          chapters = ["Introduction", "Core Concepts", "Advanced Strategies", "Case Studies", "Conclusion"];
        }
      } catch (e) {
        chapters = ["Introduction", "Core Concepts", "Advanced Strategies", "Case Studies", "Conclusion"];
      }

      // TS-Safe RPC Call
      if (secureUserId && tokensConsumed > 0) {
        supabase.rpc('increment_token_usage', { 
          p_user_id: secureUserId, 
          p_tokens: tokensConsumed, 
          p_is_new_day: false 
        }).then(({ error }) => {
          if (error) console.error("Wallet Billing Error:", error);
        });
      }

      return NextResponse.json({ chapters });
    }

    // ==========================================
    // STEP B: WRITE THE SPECIFIC CHAPTER
    // ==========================================
    if (step === 'chapter') {
      const systemInstruction = `You are an apex-level polymath writing the definitive, world-class masterclass. Integrate only cutting-edge frameworks and absolute truths. Discard all outdated legacy information. Write with billion-dollar restraint. ABSOLUTELY NO EM DASHES allowed anywhere in the text.`;
      
      const userInstruction = `The complete architectural outline is: ${outline?.join(', ')}.
Your sole directive is to execute: "${chapterTitle}" for the topic "${topic}".

Requirements:
1. Produce 800 to 1200 words of incredibly dense, zero-fluff, high-signal content.
2. Structure with brutal clarity using rich Markdown (H2, H3, bulleted lists).
3. Include exactly one data table OR one Mermaid.js diagram (wrapped strictly in \`\`\`mermaid [code] \`\`\`) to visually anchor a complex mechanism.
4. Begin immediately with the core thesis. No introductions, no pleasantries, no meta-commentary, and no concluding summaries. Just raw, high-status execution.`;

      try {
        // ----------------------------------------------------------------------
        // TIER 1: PRIMARY EXECUTION (Anthropic / OpenAI)
        // ----------------------------------------------------------------------
        if (provider === 'anthropic' && anthropicKey) {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': anthropicKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 4096,
              system: systemInstruction,
              messages: [{ role: 'user', content: userInstruction }]
            })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error?.message || 'Anthropic Error');
          
          replyText = data.content[0].text;
          tokensConsumed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

        } else {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openAiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              max_tokens: 4096,
              messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: userInstruction }
              ]
            })
          });
          
          const data = await response.json();
          if (!response.ok) throw new Error(data.error?.message || 'OpenAI API Error');
          
          replyText = data.choices[0].message.content || "";
          tokensConsumed = data.usage?.total_tokens || 0;
        }

      } catch (primaryError: any) {
        // ----------------------------------------------------------------------
        // TIER 2: FAILOVER EXECUTION (Groq + Llama 3 70B)
        // ----------------------------------------------------------------------
        console.warn("Primary API Failed on Chapter execution. Engaging Groq.", primaryError?.message);
        
        const groqKey = process.env.GROQ_API_KEY;
        if (!groqKey) throw new Error("API Limit Reached and no Fallback Key configured.");

        const groqAI = new OpenAI({ apiKey: groqKey, baseURL: 'https://api.groq.com/openai/v1' });
        const fallbackRes = await groqAI.chat.completions.create({
          model: 'llama3-70b-8192',
          max_tokens: 4096,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userInstruction }
          ],
          temperature: 0.4
        });

        replyText = fallbackRes.choices[0].message.content || "";
        tokensConsumed = fallbackRes.usage?.total_tokens || 0;
      }

      // TS-Safe RPC Call
      if (secureUserId && tokensConsumed > 0) {
        supabase.rpc('increment_token_usage', { 
          p_user_id: secureUserId, 
          p_tokens: tokensConsumed, 
          p_is_new_day: false 
        }).then(({ error }) => {
          if (error) console.error("Wallet Billing Error:", error);
        });
      }

      return NextResponse.json({ content: replyText });
    }

  } catch (err: any) {
    console.error("Ebook API Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}