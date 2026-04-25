import { NextResponse } from 'next/server';
import { TOOL_PROMPTS } from '@/lib/promt';

export async function POST(req: Request) {
  try {
    const { inputContent, activeTool, apiKey, llmProvider } = await req.json();

    // 1. Security & Validation Checks
    if (!apiKey) {
      return NextResponse.json({ error: 'No API key provided. Go to Account to set your Bring-Your-Own-Key.' }, { status: 401 });
    }
    if (!inputContent) {
      return NextResponse.json({ error: 'Input content is empty.' }, { status: 400 });
    }

    // 2. Load the specific cognitive framework
    const systemPrompt = TOOL_PROMPTS[activeTool] || TOOL_PROMPTS['default'];

    // 3. Execute OpenAI Engine
    if (llmProvider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`, // Secure BYOK injection
        },
        body: JSON.stringify({
          model: 'gpt-4o', // Or gpt-4o-mini for speed/cost
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: inputContent }
          ],
          temperature: 0.4, // Keep it grounded and sharp
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'OpenAI API Error');
      }

      return NextResponse.json({ result: data.choices[0].message.content });
    } 
    
    // 4. Execute Anthropic Engine (If you want Claude 3.5 support)
    else if (llmProvider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20240620',
          system: systemPrompt,
          messages: [
            { role: 'user', content: inputContent }
          ],
          max_tokens: 1024,
          temperature: 0.4,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Anthropic API Error');
      }

      return NextResponse.json({ result: data.content[0].text });
    }

    return NextResponse.json({ error: 'Invalid Provider' }, { status: 400 });

  } catch (error: any) {
    console.error('Execution Error:', error.message);
    return NextResponse.json({ error: error.message || 'Failed to execute tool.' }, { status: 500 });
  }
}