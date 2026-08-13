export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

type Provider = 'openai' | 'anthropic';
type Step = 'outline' | 'chapter';

interface EbookRequestBody {
  topic?: string;
  step?: Step;
  outline?: string[];
  chapterTitle?: string;
  provider?: Provider;
}

interface GenerationResult {
  text: string;
  tokensConsumed: number;
  usedFallback: boolean;
}

type SupabaseClient = ReturnType<typeof createClient>;

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const OPENAI_MODEL = 'gpt-4o';
const GROQ_FALLBACK_MODEL = 'llama3-70b-8192';

const OUTLINE_MAX_TOKENS = 1500;
const CHAPTER_MAX_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 55000;

const FALLBACK_CHAPTERS = [
  'Introduction',
  'Core Concepts',
  'Advanced Strategies',
  'Case Studies',
  'Conclusion',
];

// ---------------------------------------------------------------------------
// Output sanitation
// ---------------------------------------------------------------------------

/**
 * Strips artifacts that a model can emit despite instructions to the
 * contrary: reasoning/thinking tags, markdown fences wrapping the whole
 * response, and surrounding whitespace.
 */
function sanitizeModelOutput(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/```json/gi, '')
    .replace(/```markdown/gi, '')
    .replace(/```/g, '')
    .trim();
}

/**
 * Extracts the first well-formed JSON object from a string, in case the
 * model prepends or appends conversational text around the JSON payload.
 */
function extractJsonObject(raw: string): unknown {
  const sanitized = sanitizeModelOutput(raw);
  const start = sanitized.indexOf('{');
  const end = sanitized.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in model output');
  }
  return JSON.parse(sanitized.slice(start, end + 1));
}

// ---------------------------------------------------------------------------
// Networking helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function callAnthropic(
  apiKey: string,
  system: string,
  userPrompt: string,
  maxTokens: number
): Promise<{ text: string; tokensConsumed: number }> {
  const response = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    },
    REQUEST_TIMEOUT_MS
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Anthropic API error');
  }

  const text = (data.content ?? [])
    .filter((block: { type: string }) => block.type === 'text')
    .map((block: { text: string }) => block.text)
    .join('\n');

  const tokensConsumed = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
  return { text, tokensConsumed };
}

async function callOpenAI(
  apiKey: string,
  system: string,
  userPrompt: string,
  maxTokens: number,
  jsonMode: boolean
): Promise<{ text: string; tokensConsumed: number }> {
  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    },
    REQUEST_TIMEOUT_MS
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'OpenAI API error');
  }

  const text = data.choices?.[0]?.message?.content ?? '';
  const tokensConsumed = data.usage?.total_tokens ?? 0;
  return { text, tokensConsumed };
}

async function callGroqFallback(
  system: string,
  userPrompt: string,
  maxTokens: number,
  jsonMode: boolean
): Promise<{ text: string; tokensConsumed: number }> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    throw new Error('Primary provider failed and no fallback key is configured');
  }

  const groqClient = new OpenAI({ apiKey: groqKey, baseURL: 'https://api.groq.com/openai/v1' });
  const response = await groqClient.chat.completions.create({
    model: GROQ_FALLBACK_MODEL,
    max_tokens: maxTokens,
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ],
    ...(jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
  });

  const text = response.choices[0]?.message?.content ?? '';
  const tokensConsumed = response.usage?.total_tokens ?? 0;
  return { text, tokensConsumed };
}

/**
 * Runs the user's selected provider (Anthropic or OpenAI) and transparently
 * falls back to Groq/Llama 3 if the primary call fails for any reason.
 */
async function generateWithFailover(
  provider: Provider,
  anthropicKey: string | undefined,
  openAiKey: string | undefined,
  system: string,
  userPrompt: string,
  maxTokens: number,
  jsonMode: boolean
): Promise<GenerationResult> {
  try {
    if (provider === 'anthropic' && anthropicKey) {
      const { text, tokensConsumed } = await callAnthropic(anthropicKey, system, userPrompt, maxTokens);
      return { text, tokensConsumed, usedFallback: false };
    }

    if (!openAiKey) {
      throw new Error('No OpenAI API key configured');
    }
    const { text, tokensConsumed } = await callOpenAI(openAiKey, system, userPrompt, maxTokens, jsonMode);
    return { text, tokensConsumed, usedFallback: false };
  } catch (primaryError) {
    console.warn('Primary provider failed, falling back to Groq:', (primaryError as Error).message);
    const { text, tokensConsumed } = await callGroqFallback(system, userPrompt, maxTokens, jsonMode);
    return { text, tokensConsumed, usedFallback: true };
  }
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

function recordTokenUsage(supabase: SupabaseClient, userId: string, tokens: number): void {
  if (tokens <= 0) return;
  Promise.resolve(
    supabase.rpc('increment_token_usage', { p_user_id: userId, p_tokens: tokens, p_is_new_day: false })
  )
    .then(({ error }: { error: unknown }) => {
      if (error) console.error('Wallet billing error:', error);
    })
    .catch((error: unknown) => {
      console.error('Wallet billing request failed:', error);
    });
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildOutlinePrompts(topic: string): { system: string; user: string } {
  const system =
    "You are an apex-level polymath and the world's most authoritative non-fiction architect. " +
    'You possess absolute, cutting-edge knowledge across all scientific, technical, and cultural domains. ' +
    'Output STRICTLY a valid JSON object. Do not ask questions. Do not request clarification or ' +
    'additional information. Use only the context provided. Never use em dashes.';

  const user = `The user requires a definitive, paradigm-shifting 5-chapter table of contents for a masterclass ebook about: "${topic}".

Directives:
1. Titles must be magnetic, high-status, and authoritative. Zero cliche marketing fluff.
2. The progression must map a flawless logical escalation from foundational principles to advanced, frontier-level mastery.
3. Rely strictly on the latest paradigms. Exclude outdated theories or legacy concepts.
4. Never use em dashes anywhere in your output.

Output STRICTLY a valid JSON object with a single key "chapters" containing an array of exactly 5 strings representing the chapter titles.
Example format: {"chapters": ["Chapter 1: The Genesis Protocol", "Chapter 2: Architectural Foundations"]}
Do not output conversational text, markdown blocks, or explanations. Only the raw JSON.`;

  return { system, user };
}

function buildChapterPrompts(
  topic: string,
  outline: string[],
  chapterTitle: string
): { system: string; user: string } {
  const chapterIndex = outline.indexOf(chapterTitle);
  const totalChapters = outline.length || 1;
  const position = chapterIndex >= 0 ? `${chapterIndex + 1} of ${totalChapters}` : `1 of ${totalChapters}`;
  const siblingChapters = outline.filter((title) => title !== chapterTitle);
  const scopeNote = siblingChapters.length
    ? `: ${siblingChapters.join(', ')}`
    : '';

  const system =
    'You are an apex-level polymath writing a definitive, world-class masterclass. ' +
    'Integrate only cutting-edge frameworks and established truths. Discard outdated legacy information. ' +
    'Write with restraint. Do not ask questions. Do not request clarification or additional information. ' +
    'Use only the context provided. Never use em dashes anywhere in the text.';

  const user = `The complete architectural outline is: ${outline.join(', ') || 'not provided'}.
This is chapter ${position}: "${chapterTitle}", for the topic "${topic}".

Scope discipline: this chapter owns only its own title's territory. Do not repeat explanations, examples, or arguments that belong to the other chapters in the outline${scopeNote}. If a concept overlaps, reference it in one sentence and move forward instead of re-explaining it.

Requirements:
1. Produce 800 to 1200 words of dense, zero-fluff, high-signal content.
2. Structure with clear hierarchy using rich Markdown (H2, H3, bulleted lists).
3. Include exactly one data table OR one Mermaid.js diagram (wrapped strictly in \`\`\`mermaid [code] \`\`\`) to visually anchor a complex mechanism.
4. Begin immediately with the core thesis. No introductions, no pleasantries, no meta-commentary, and no concluding summary.
5. Never use em dashes anywhere in the text.`;

  return { system, user };
}

// ---------------------------------------------------------------------------
// Step handlers
// ---------------------------------------------------------------------------

async function handleOutlineStep(
  supabase: SupabaseClient,
  body: EbookRequestBody,
  userId: string,
  anthropicKey: string | undefined,
  openAiKey: string | undefined
): Promise<NextResponse> {
  const topic = body.topic?.trim() || 'General Topic';
  const provider: Provider = body.provider === 'anthropic' ? 'anthropic' : 'openai';
  const { system, user } = buildOutlinePrompts(topic);

  let chapters: string[] = FALLBACK_CHAPTERS;
  let tokensConsumed = 0;

  try {
    const result = await generateWithFailover(
      provider,
      anthropicKey,
      openAiKey,
      system,
      user,
      OUTLINE_MAX_TOKENS,
      true
    );
    tokensConsumed = result.tokensConsumed;

    const parsed = extractJsonObject(result.text) as { chapters?: unknown };
    if (Array.isArray(parsed.chapters) && parsed.chapters.every((title) => typeof title === 'string')) {
      chapters = parsed.chapters;
    }
  } catch (error) {
    console.error('Outline generation failed, using fallback outline:', (error as Error).message);
  }

  recordTokenUsage(supabase, userId, tokensConsumed);
  return NextResponse.json({ chapters });
}

async function handleChapterStep(
  supabase: SupabaseClient,
  body: EbookRequestBody,
  userId: string,
  anthropicKey: string | undefined,
  openAiKey: string | undefined
): Promise<NextResponse> {
  const chapterTitle = body.chapterTitle?.trim();
  if (!chapterTitle) {
    return NextResponse.json({ error: 'chapterTitle is required for step "chapter"' }, { status: 400 });
  }

  const topic = body.topic?.trim() || 'General Topic';
  const outline = Array.isArray(body.outline) && body.outline.length > 0 ? body.outline : [chapterTitle];
  const provider: Provider = body.provider === 'anthropic' ? 'anthropic' : 'openai';
  const { system, user } = buildChapterPrompts(topic, outline, chapterTitle);

  let content = '';
  let tokensConsumed = 0;

  try {
    const result = await generateWithFailover(
      provider,
      anthropicKey,
      openAiKey,
      system,
      user,
      CHAPTER_MAX_TOKENS,
      false
    );
    content = sanitizeModelOutput(result.text);
    tokensConsumed = result.tokensConsumed;
  } catch (error) {
    console.error('Chapter generation failed:', (error as Error).message);
    return NextResponse.json({ error: 'Chapter generation failed. Please try again.' }, { status: 502 });
  }

  recordTokenUsage(supabase, userId, tokensConsumed);
  return NextResponse.json({ content });
}

// ---------------------------------------------------------------------------
// Route entry point
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<NextResponse> {
  let body: EbookRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;
  const supabase = createClient();

  // SECURITY BOUNDARY: the billed user is derived from the verified server-side
  // session and never from the request body. An earlier revision accepted a
  // `secureUserId` field from the client, which allowed unauthenticated callers
  // to generate ebooks billed to an arbitrary account. Any future field that
  // identifies a user must be derived here, not accepted from the caller.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (body.step === 'outline') {
      return await handleOutlineStep(supabase, body, user.id, anthropicKey, openAiKey);
    }
    if (body.step === 'chapter') {
      return await handleChapterStep(supabase, body, user.id, anthropicKey, openAiKey);
    }
    return NextResponse.json({ error: `Unsupported step: "${body.step}"` }, { status: 400 });
  } catch (error) {
    console.error('Ebook API error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}