import { Platform, LLMProvider } from '@/types';

// =========================================
// PROMPT ENGINEERING — CONVERSION-OPTIMIZED & GHOSTWRITER
// =========================================

const SYSTEM_PROMPT = `You are ContentForge, an elite content repurposing engine used by the world's top creators, marketers, and founders. You transform source material into platform-native content that feels hand-crafted by a specialist copywriter for each channel.

Rules:
- Never summarize lazily. Extract insights, reframe angles, find the non-obvious takeaway.
- If VOICE REFERENCE MATERIAL is provided, you MUST analyze it and mimic the author's exact syntax, formatting habits, sentence length, and vocabulary.
- Each output must feel native to its platform — as if a platform specialist wrote it from scratch.
- Vary hooks, structures, and angles across outputs. No two pieces should open the same way.
- Use line breaks, spacing, and formatting conventions native to each platform.
- Never use hashtags on LinkedIn or Twitter unless explicitly relevant. Never start with "🧵" on threads.
- Write like a human with taste — not like an AI regurgitating bullet points.`;

const PLATFORM_INSTRUCTIONS: Record<Platform, string> = {
  linkedin: `Generate exactly 10 LinkedIn posts from the source material.

Each post must:
- Open with a bold, scroll-stopping first line (this is the hook — it appears before "...see more")
- Be 100-200 words with generous line breaks (LinkedIn rewards whitespace)
- End with a question, call-to-action, or provocative closing thought
- Feel like a thought leader wrote it, not an AI
- Use varied structures: story, lesson, contrarian take, framework, personal reflection, data-driven insight

Separate each post with exactly ---`,

  twitter: `Generate exactly 10 standalone tweets from the source material.

Each tweet must:
- Be under 280 characters — hard limit, no exceptions
- Be instantly quotable and shareable
- Mix formats: hot take, actionable tip, one-liner, question, surprising stat, reframe
- Feel punchy and confident — no hedging, no "here's my take"

Separate each tweet with exactly ---`,

  email_newsletter: `Generate exactly 3 email newsletters from the source material.

Each email must:
- Start with SUBJECT: followed by a compelling subject line (under 50 chars, curiosity-driven)
- Open with a personal, conversational hook (2-3 sentences)
- Restructure the key insights for email (scannable, value-dense)
- End with a single, clear CTA
- Be 200-400 words total
- Feel like a smart friend sharing insights, not a corporate broadcast

Separate each email with exactly ---`,

  twitter_thread: `Generate exactly 1 Twitter/X thread of 8-12 tweets from the source material.

Thread rules:
- Tweet 1 is the hook — it must make someone stop scrolling and click "Show this thread"
- Number each tweet: 1/, 2/, 3/, etc.
- Each tweet under 280 characters — hard limit
- Build a narrative arc: hook → context → insights → takeaway
- Last tweet: summarize + CTA (follow, share, bookmark)
- Format each tweet on its own line`,

  instagram: `Generate exactly 5 Instagram captions from the source material.

Each caption must:
- Open with a strong first line (this shows in the feed preview)
- Be 50-150 words — concise but substantial
- Include 5-8 relevant hashtags at the end (research-quality, not generic)
- Mix emotional, educational, and inspirational tones
- Feel authentic — not corporate, not cringe

Separate each caption with exactly ---`,

  blog_summary: `Generate exactly 1 executive blog summary from the source material.

The summary must:
- Start with TITLE: followed by a compelling title
- Be 150-250 words
- Capture the 3-5 most important insights in the reader's own interest (why should they care?)
- Work as a standalone piece for cross-posting or sharing
- End with a one-line takeaway that the reader will remember`,
};

const TONE_INSTRUCTIONS: Record<string, string> = {
  professional:
    'Write with authority and precision. Data-driven where possible. Confident but not arrogant. Think: McKinsey partner who actually enjoys writing.',
  casual:
    'Write conversationally — like explaining something to a smart friend over coffee. Contractions, natural rhythm, genuine voice. Think: your favorite newsletter writer.',
  witty:
    'Write with sharp wit and clever framing. Unexpected analogies, wordplay, subversive observations. Think: a comedian who is also genuinely smart about the topic.',
  inspirational:
    'Write with energy and conviction. Paint a vision of what is possible. Empowering without being preachy. Think: the best TED talk you have ever seen, distilled into text.',
};

// =========================================
// PROMPT BUILDER
// =========================================

export function buildPrompt(
  content: string,
  platform: Platform,
  tone: string,
  voiceReference?: string
): { system: string; user: string } {
  let toneInstruction = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.professional;

  if (voiceReference && voiceReference.length > 50) {
    toneInstruction = `GHOSTWRITER MODE ACTIVATED. 
Analyze the following reference material to understand the user's unique writing voice. Ignore the generic tone directive and strictly emulate the cadence, formatting, and personality found here:
<VOICE_REFERENCE>
${voiceReference.slice(0, 3000)}
</VOICE_REFERENCE>`;
  }

  const user = `TONE DIRECTIVE:
${toneInstruction}

SOURCE CONTENT:
---
${content.slice(0, 12000)}
---

TASK:
${PLATFORM_INSTRUCTIONS[platform]}`;

  return { system: SYSTEM_PROMPT, user };
}

// =========================================
// LLM CALLING
// =========================================

export async function callLLM(
  prompt: { system: string; user: string },
  provider: LLMProvider,
  apiKey: string
): Promise<string> {
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        max_tokens: 4096,
        temperature: 0.85,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        err.error?.message || `OpenAI returned ${res.status}. Check your API key.`
      );
    }

    const data = await res.json();
    return data.choices[0].message.content;
  }

  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        err.error?.message || `Anthropic returned ${res.status}. Check your API key.`
      );
    }

    const data = await res.json();
    return data.content[0].text;
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

// =========================================
// OUTPUT PARSER
// =========================================

export function parseOutput(raw: string, platform: Platform): string[] {
  if (platform === 'twitter_thread') {
    // Thread: split by numbered tweets
    const tweets = raw
      .split(/\n(?=\d+\/)/)
      .map((t) => t.trim())
      .filter((t) => t.length > 5);
    return tweets.length > 0 ? [tweets.join('\n\n')] : [raw.trim()];
  }

  if (platform === 'blog_summary') {
    return [raw.trim()];
  }

  // Default: split by ---
  const pieces = raw
    .split(/\n?---\n?/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  return pieces.length > 0 ? pieces : [raw.trim()];
}

// =========================================
// URL CONTENT EXTRACTION
// =========================================

export async function extractFromURL(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; ContentForge/1.0; +https://contentforge.app)',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Could not fetch URL (${res.status}). Check the link and try again.`);
  }

  const html = await res.text();

  // Strip scripts, styles, nav, footer, aside
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  // Truncate to ~4000 words
  const words = text.split(' ');
  if (words.length > 4000) {
    text = words.slice(0, 4000).join(' ');
  }

  if (text.length < 100) {
    throw new Error(
      'Could not extract enough content from this URL. Try pasting the text directly.'
    );
  }

  return text;
}