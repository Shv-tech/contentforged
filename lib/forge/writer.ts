/**
 * lib/forge/writer.ts
 *
 * Writes one post outside the chat: for the weekly plan, an idea's "Draft
 * it", repurposing, a shared format, a reply, or an API call. The chat has
 * its own agent loop; everything else comes through here, so a draft
 * written on a Monday morning by a cron job follows the same voice, rules,
 * truth policy and language as one written in conversation.
 *
 * THE TRUTH RULE, AGAIN
 *
 * The writer only states personal facts that appear in the stories it is
 * given. Anything else the post needs is written as a [bracket] for the
 * author to fill. A plan that invents a client win is worse than no plan.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { structuredCall, type ToolDefinition } from '@/lib/ai/anthropic';
import type { TokenUsage } from '@/lib/billing/plans';
import { assembleBrandIdentity } from '@/lib/brand-dna';
import { createServiceClient } from '@/lib/supabase/service';
import { acceptedRules, bannedPhrasesFrom } from './data/rules';
import { formatStoriesForModel, searchStories } from './data/stories';
import { getFingerprint } from './data/voice';
import type { WorkspaceRef } from './data/workspace';
import { languageInstructions } from './language';
import { computePlaybook, loadPostedPosts, playbookPromptLines } from './playbook';
import { slopPromptList } from './slop';
import { joinSegments, measure, PLATFORM_LIMITS, splitIntoThread } from './text';
import { PLATFORM_NAMES, type DraftKind, type DraftPlatform, type StoryItem, type WritingLanguage } from './types';
import { MIN_SAMPLES_FOR_SCORING, voicePromptBlock, type VoiceProfile } from './voice';

// ============================================================================
// BRAND CONTEXT
// ============================================================================

export interface BrandContext {
  db: SupabaseClient;
  /** The person the writing is done for (the actor). */
  userId: string;
  workspace: WorkspaceRef | null;
  workspaceId: string | null;
  brandDna: string | null;
  voiceBlock: string | null;
  voiceProfile: VoiceProfile | null;
  rules: string[];
  bannedPhrases: string[];
  playbook: string[];
  language: WritingLanguage;
  timezone: string;
}

function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

/**
 * Everything the writer needs to know about a brand, loaded once and reused
 * across every draft in a batch. Each source fails independently.
 */
export async function loadBrandContext(db: SupabaseClient, userId: string, workspace: WorkspaceRef | null): Promise<BrandContext> {
  const workspaceId = workspace?.id ?? null;
  const service = createServiceClient();

  const [brand, fingerprint, rules, posts, profile] = await Promise.allSettled([
    workspace ? Promise.resolve(workspace.brand_dna) : assembleBrandIdentity(userId),
    getFingerprint(db, userId, workspaceId),
    acceptedRules(db, userId, workspaceId),
    loadPostedPosts(db, userId, workspaceId, 200),
    service.from('profiles').select('timezone, writing_language').eq('id', userId).maybeSingle(),
  ]);

  const voice = settled(fingerprint, null);
  const usableVoice = voice && voice.sample_count >= MIN_SAMPLES_FOR_SCORING ? voice : null;
  const ruleRows = settled(rules, []);
  const profileRow = profile.status === 'fulfilled' ? (profile.value.data as { timezone?: string | null; writing_language?: string | null } | null) : null;
  const timezone = profileRow?.timezone ?? 'UTC';
  const postedPosts = settled(posts, []);
  const statedLanguage = (workspace?.writing_language ?? profileRow?.writing_language ?? 'en') as WritingLanguage;

  return {
    db,
    userId,
    workspace,
    workspaceId,
    brandDna: settled(brand, null)?.trim() || null,
    voiceBlock: usableVoice ? voicePromptBlock(usableVoice.profile, usableVoice.traits) : null,
    voiceProfile: usableVoice?.profile ?? null,
    rules: ruleRows.map((rule) => rule.rule),
    bannedPhrases: bannedPhrasesFrom(ruleRows),
    playbook: postedPosts.length > 0 ? playbookPromptLines(computePlaybook(postedPosts, timezone)) : [],
    language: usableVoice?.profile.language && usableVoice.profile.language.primary !== 'en' ? usableVoice.profile.language.primary : statedLanguage,
    timezone,
  };
}

// ============================================================================
// WRITING
// ============================================================================

export interface FormatSlot {
  label: string;
  guidance: string;
}

export interface WriteRequest {
  /** What the post is about, in a sentence or two. */
  angle: string;
  platform: DraftPlatform;
  kind?: DraftKind;
  /** Stories the post may draw facts from. When omitted they are searched by angle. */
  stories?: StoryItem[];
  /** Source material being repurposed: its title and the passage to work from. */
  source?: { title: string; excerpt: string } | null;
  /** A shared format's structure, followed slot by slot. */
  format?: { title: string; slots: FormatSlot[] } | null;
  /** An experiment arm's instruction, e.g. "Open with a question." */
  experiment?: string | null;
  /** Anything else the caller needs, e.g. "This is a reply to: ...". */
  extra?: string | null;
}

export interface WrittenDraft {
  platform: DraftPlatform;
  kind: DraftKind;
  title: string;
  body: string;
  segments: string[];
  storyIdsUsed: string[];
  /** Facts the post needs that were not in the stories, left as [brackets]. */
  missingFacts: string[];
}

const WRITE_TOOL: ToolDefinition = {
  name: 'submit_post',
  description: 'Submit the finished post.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'A three to seven word working title for the author, not part of the post.' },
      body: {
        type: 'string',
        description: 'The full post text, exactly as it would be published. For threads and carousels, separate each post or slide with a blank line.',
      },
      segments: {
        type: 'array',
        items: { type: 'string' },
        description: 'For a thread: each post in order. For a carousel: each slide in order. Empty for a single post.',
      },
      story_ids_used: { type: 'array', items: { type: 'string' }, description: 'Ids of the stories whose facts the post uses.' },
      missing_facts: {
        type: 'array',
        items: { type: 'string' },
        description: 'Facts the post needs that the stories did not provide, each written in the post as a [bracket].',
      },
    },
    required: ['title', 'body', 'segments', 'story_ids_used', 'missing_facts'],
  },
};

const PLATFORM_GUIDANCE: Record<DraftPlatform, string> = {
  x: 'X: one post under 280 characters, or a thread when the idea needs room (each post under 280). No hashtags unless the author uses them.',
  linkedin: 'LinkedIn: one post, ideally 600 to 1,300 characters. The first two lines show above "see more" and must earn the click. Short paragraphs.',
  threads: 'Threads: one post under 500 characters, conversational.',
  bluesky: 'Bluesky: one post under 300 characters.',
  instagram: 'Instagram: a caption under 2,200 characters. When asked for a carousel, each slide is one short idea of under 30 words.',
  newsletter: 'Newsletter: a short essay with a clear opening, three to six paragraphs, and one takeaway.',
};

const POST_ROLE = 'You write social posts for one specific person, in their voice, about their real experience. You are a ghostwriter, not a content generator.';

function systemPrompt(context: BrandContext): string {
  return brandSystemPrompt(context, POST_ROLE);
}

/**
 * The brand's full writing brief (truth rule, style, voice, rules, playbook,
 * brand DNA) behind a role line. Shared by everything that writes as the
 * author, so long form and posts follow the same rules.
 */
export function brandSystemPrompt(context: BrandContext, role: string): string {
  const parts = [
    role,
    'TRUTH: State personal facts (numbers, clients, events, results, quotes) only when they appear in the STORIES given. When the post needs a fact that is not there, write a short [bracket] describing it, for example [number of customers in March]. Never invent a fact, a person or a result.',
    'STYLE: Plain words. Specific over general. No em dashes. No emoji or hashtags unless the voice fingerprint says the author uses them. No "Here\'s the thing", no rhetorical "Not X. Not Y.", no listicle filler.',
    `NEVER USE THESE MACHINE-WRITTEN PHRASES:\n${slopPromptList()}`,
    languageInstructions(context.language, context.voiceProfile?.language ?? null),
  ];
  if (context.voiceBlock) parts.push(`VOICE FINGERPRINT:\n${context.voiceBlock}`);
  if (context.rules.length > 0) parts.push(`THE AUTHOR'S RULES (follow all):\n${context.rules.map((r) => `- ${r}`).join('\n')}`);
  if (context.playbook.length > 0) parts.push(`WHAT HAS WORKED FOR THIS AUTHOR:\n${context.playbook.map((line) => `- ${line}`).join('\n')}`);
  if (context.bannedPhrases.length > 0) parts.push(`PHRASES THE AUTHOR HAS BANNED: ${context.bannedPhrases.join('; ')}`);
  parts.push(
    context.brandDna
      ? `BRAND DNA (the author's own description; treat as true):\n${context.brandDna.slice(0, 8000)}`
      : 'BRAND DNA: not provided. Do not invent one.'
  );
  if (context.workspace) {
    parts.push(
      context.workspace.kind === 'company'
        ? `You are writing as this person for the company "${context.workspace.name}". The brand rules apply; the voice is the person's own.`
        : `You are writing for the client "${context.workspace.name}", in the client's voice.`
    );
  }
  return parts.join('\n\n');
}

function userPrompt(request: WriteRequest, stories: StoryItem[]): string {
  const kind = request.kind ?? 'post';
  const lines = [
    `PLATFORM: ${PLATFORM_NAMES[request.platform]}. ${PLATFORM_GUIDANCE[request.platform]}`,
    `FORMAT: ${kind === 'thread' ? 'a thread' : kind === 'carousel' ? 'a carousel, one idea per slide, 5 to 9 slides' : 'a single post'}.`,
    `ANGLE: ${request.angle}`,
  ];
  if (request.experiment) lines.push(`EXPERIMENT (follow exactly, it is being measured): ${request.experiment}`);
  if (request.format) {
    lines.push(
      `STRUCTURE "${request.format.title}" (follow it in order, with the author's own material):\n${request.format.slots.map((slot, i) => `${i + 1}. ${slot.label}: ${slot.guidance}`).join('\n')}`
    );
  }
  if (request.source) lines.push(`SOURCE MATERIAL "${request.source.title}" (work from this; it is the author's own):\n"""\n${request.source.excerpt.slice(0, 12_000)}\n"""`);
  if (request.extra) lines.push(request.extra);
  lines.push(`STORIES (the only personal facts you may state):\n${formatStoriesForModel(stories)}`);
  return lines.join('\n\n');
}

/** Cleans what the model returned into a draft that fits its platform. */
function normalise(raw: Record<string, unknown>, request: WriteRequest, stories: StoryItem[]): WrittenDraft {
  const kind: DraftKind = request.kind ?? 'post';
  const known = new Set(stories.map((story) => story.id));
  const text = (value: unknown) => (typeof value === 'string' ? value.replace(/—/g, ',').trim() : '');

  let segments = Array.isArray(raw.segments) ? raw.segments.map(text).filter(Boolean) : [];
  let body = text(raw.body);

  if (kind === 'thread') {
    if (segments.length === 0) segments = splitIntoThread(body, request.platform);
    body = joinSegments(segments);
  } else if (kind === 'carousel') {
    if (segments.length === 0) segments = body.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
    body = segments.join('\n\n');
  } else {
    segments = [];
    // A single post that came back over the limit on X becomes a thread
    // rather than being truncated mid-sentence.
    if (request.platform !== 'linkedin' && request.platform !== 'newsletter' && measure(body, request.platform) > PLATFORM_LIMITS[request.platform]) {
      segments = splitIntoThread(body, request.platform);
    }
  }

  return {
    platform: request.platform,
    kind: kind === 'post' && segments.length > 1 ? 'thread' : kind,
    title: text(raw.title).slice(0, 120) || request.angle.slice(0, 60),
    body,
    segments,
    storyIdsUsed: (Array.isArray(raw.story_ids_used) ? raw.story_ids_used : []).filter((id): id is string => typeof id === 'string' && known.has(id)),
    missingFacts: (Array.isArray(raw.missing_facts) ? raw.missing_facts : []).filter((f): f is string => typeof f === 'string').slice(0, 8),
  };
}

export async function writePost(context: BrandContext, request: WriteRequest): Promise<{ draft: WrittenDraft; usage: TokenUsage }> {
  const stories = request.stories ?? (await searchStories(context.db, context.userId, context.workspaceId, request.angle, 6).catch(() => []));

  const { data, usage } = await structuredCall<Record<string, unknown>>({
    system: [{ type: 'text', text: systemPrompt(context), cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: [{ role: 'user', content: userPrompt(request, stories) }],
    tool: WRITE_TOOL,
    temperature: 0.6,
    maxTokens: request.kind === 'carousel' || request.kind === 'thread' || request.platform === 'newsletter' ? 2400 : 1400,
  });

  return { draft: normalise(data, request, stories), usage };
}

/** Rough input size of a write, for quota reservation. */
export function estimateWriteTokens(context: BrandContext, request: WriteRequest): number {
  const characters = systemPrompt(context).length + request.angle.length + (request.source?.excerpt.length ?? 0) + 3000;
  return Math.ceil(characters / 4);
}
