import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { buildPrompt, callLLM, parseOutput, extractFromURL } from '@/lib/engine';
import { CREDIT_COSTS, Platform, LLMProvider } from '@/types';

export const maxDuration = 60; // Vercel function timeout

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { input_type, input_content, tone, voice_reference, platforms, api_key, llm_provider, user_id } =
      body as {
        input_type: 'url' | 'youtube' | 'text';
        input_content: string;
        tone: string;
        voice_reference?: string;
        platforms: Platform[];
        api_key: string;
        llm_provider: LLMProvider;
        user_id: string;
      };

    if (!api_key) {
      return NextResponse.json(
        { error: 'API key is required. Add your key in settings.' },
        { status: 400 }
      );
    }
    if (!platforms.length) {
      return NextResponse.json(
        { error: 'Select at least one platform.' },
        { status: 400 }
      );
    }
    if (!input_content.trim()) {
      return NextResponse.json(
        { error: 'Content cannot be empty.' },
        { status: 400 }
      );
    }

    const creditsNeeded = platforms.reduce((sum, p) => sum + CREDIT_COSTS[p], 0);
    const supabase = createServerClient();

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('credits_remaining, plan')
      .eq('id', user_id)
      .single();

    if (userErr || !user) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    const isUnlimited = user.plan === 'tier3';
    if (!isUnlimited && user.credits_remaining < creditsNeeded) {
      return NextResponse.json(
        {
          error: `You need ${creditsNeeded} credits but have ${user.credits_remaining}. Upgrade your plan.`,
        },
        { status: 403 }
      );
    }

    let content = input_content;
    if (input_type === 'url' || input_type === 'youtube') {
      content = await extractFromURL(input_content);
    }

    if (content.length < 50) {
      return NextResponse.json(
        { error: 'Not enough content to repurpose. Add more text or try a different URL.' },
        { status: 400 }
      );
    }

    const outputs = await Promise.all(
      platforms.map(async (platform) => {
        const prompt = buildPrompt(content, platform, tone, voice_reference);
        const raw = await callLLM(prompt, llm_provider, api_key);
        const posts = parseOutput(raw, platform);
        return { platform, posts };
      })
    );

    if (!isUnlimited) {
      await supabase
        .from('users')
        .update({ credits_remaining: user.credits_remaining - creditsNeeded })
        .eq('id', user_id);
    }

    const { data: record } = await supabase
      .from('generations')
      .insert({
        user_id,
        input_content: input_content.slice(0, 500),
        input_type,
        tone,
        outputs,
        credits_used: creditsNeeded,
      })
      .select('id')
      .single();

    return NextResponse.json({
      outputs,
      id: record?.id,
      credits_used: creditsNeeded,
      credits_remaining: isUnlimited ? -1 : user.credits_remaining - creditsNeeded,
    });
  } catch (err: any) {
    console.error('[generate] Error:', err.message);
    return NextResponse.json(
      { error: err.message || 'Generation failed. Try again.' },
      { status: 500 }
    );
  }
}