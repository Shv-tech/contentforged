import { NextRequest, NextResponse } from 'next/server';
import { buildPrompt, callLLM } from '@/lib/engine';
import { Platform } from '@/types';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { input_content, platform } = await req.json() as { input_content: string; platform: Platform };

    // BYPASS MODE: Skip IP database logic for testing UI 
    const prompt = buildPrompt(input_content, platform, 'professional');
    const enhancedUserPrompt = prompt.user + `\n\nCRITICAL MODIFIER: Make this sound highly authoritative and confident. The author is a top 1% expert.`;
    
    // Fallback response if internal key isn't provided during testing
    const internalKey = process.env.INTERNAL_OPENAI_KEY;
    if (!internalKey) {
      return NextResponse.json({
        output: "Mock Output: Since you haven't added INTERNAL_OPENAI_KEY to your .env yet, here is a perfectly formatted, confident LinkedIn post. \n\nStop doing the same thing 6 times.\n\nAutomate your writing workflow today.",
        credits_remaining: 2
      });
    }

    const rawOutput = await callLLM({ system: prompt.system, user: enhancedUserPrompt }, 'openai', internalKey);

    return NextResponse.json({ output: rawOutput, credits_remaining: 2 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}