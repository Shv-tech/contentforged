/**
 * lib/forge/war-room.ts
 *
 * War Room: a campaign planned and written by four roles in sequence, each
 * reading the previous one's work.
 *
 *   Researcher   live web research on the brief (when search is configured)
 *   Strategist   the audience, the single angle worth betting on, the plan
 *   Writer       the posts, in the brand's measured voice, from its Story Bank
 *   Red Team     what is weak, generic, unsupported or off-voice in each post
 *   Editor       the final posts, fixed against the critique, then graded
 *
 * The output is real drafts (graded, voice-scored, schedulable) plus the
 * strategy brief, saved as a conversation so the run can be reopened and
 * continued in chat.
 *
 * Honesty rules carry over from the chat: no invented statistics, case
 * studies or projections. The Red Team is told to flag any claim that is not
 * supported by the research or the Story Bank.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createMessage, structuredCall, textOf } from '@/lib/ai/anthropic';
import { EMPTY_USAGE, type TokenUsage } from '@/lib/billing/plans';
import { buildChatContext } from './agent/context';
import { createDraft } from './data/drafts';
import type { WorkspaceRef } from './data/workspace';
import { gradeOpening } from './grader';
import { formatResearchForModel, researchWeb, ResearchUnavailableError, type ResearchResult } from './research';
import { slopPromptList } from './slop';
import { DRAFT_PLATFORMS, MARKER, markerBlock, type DraftPlatform, type DraftRecord } from './types';
import type { WarRoomEvent } from './war-room-agents';

export type { WarRoomAgent, WarRoomEvent } from './war-room-agents';

/** Upper bound on output tokens across every call in one run, for the quota reservation. */
export const WAR_ROOM_MAX_OUTPUT_TOKENS = 1200 + 3500 + 2000 + 3500 + 5 * 500;
const MAX_POSTS = 5;

interface PostDraft {
  platform: DraftPlatform;
  kind: 'post' | 'thread';
  body: string;
  segments: string[];
  purpose: string;
}

function addUsage(total: TokenUsage, next: TokenUsage): TokenUsage {
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    cacheReadTokens: total.cacheReadTokens + next.cacheReadTokens,
    cacheWriteTokens: total.cacheWriteTokens + next.cacheWriteTokens,
  };
}

const HONESTY = `Rules that override everything else:
- Never invent statistics, studies, client results, case studies, quotes or projections. Use only facts from the research sources or the user's Story Bank and context. Where a specific is needed and not available, write [bracketed placeholder] for the user to fill.
- No hype words, no em dashes, no emoji or hashtags unless the user's voice uses them.
- Phrases that read as machine-written and must not appear: ${slopPromptList()}.`;

const POSTS_SCHEMA = {
  type: 'array',
  maxItems: MAX_POSTS,
  items: {
    type: 'object',
    properties: {
      platform: { type: 'string', enum: [...DRAFT_PLATFORMS] },
      kind: { type: 'string', enum: ['post', 'thread'] },
      body: { type: 'string', description: 'The full post. For a thread, all parts joined with blank lines.' },
      segments: { type: 'array', items: { type: 'string' }, description: 'Thread parts, in order. Empty for a single post.' },
      purpose: { type: 'string', description: 'One sentence: the job this post does in the campaign.' },
    },
    required: ['platform', 'kind', 'body', 'segments', 'purpose'],
  },
};

function cleanPosts(raw: unknown): PostDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    .map((p) => ({
      platform: (DRAFT_PLATFORMS as readonly string[]).includes(String(p.platform)) ? (p.platform as DraftPlatform) : 'linkedin',
      kind: p.kind === 'thread' ? ('thread' as const) : ('post' as const),
      body: String(p.body ?? '').trim(),
      segments: Array.isArray(p.segments) ? p.segments.map((s) => String(s).trim()).filter(Boolean) : [],
      purpose: String(p.purpose ?? '').trim(),
    }))
    .filter((p) => p.body.length > 0)
    .slice(0, MAX_POSTS);
}

function formatPosts(posts: PostDraft[]): string {
  return posts
    .map(
      (p, i) =>
        `POST ${i + 1} (${p.platform}, ${p.kind}). Purpose: ${p.purpose}\n${p.kind === 'thread' && p.segments.length > 0 ? p.segments.map((s, j) => `[${j + 1}] ${s}`).join('\n') : p.body}`
    )
    .join('\n\n---\n\n');
}

export interface WarRoomInput {
  db: SupabaseClient;
  userId: string;
  workspace: WorkspaceRef | null;
  timezone: string;
  brief: string;
  emit: (event: WarRoomEvent) => void;
}

export async function runWarRoom(input: WarRoomInput): Promise<{ usage: TokenUsage; sessionId: string | null }> {
  const { db, userId, workspace, timezone, brief, emit } = input;
  let usage = EMPTY_USAGE;
  const context = await buildChatContext(db, userId, workspace, timezone);
  const system = `You are one member of a small team planning and writing a content campaign for the user below. Work only on the user's brief.\n\n${HONESTY}\n\n${context.block}`;

  // ----- Researcher --------------------------------------------------------
  emit({ type: 'agent', agent: 'researcher', state: 'active' });
  let research: ResearchResult | null = null;
  try {
    research = await researchWeb(brief);
    emit({ type: 'sources', sources: research.sources });
    emit({ type: 'agent', agent: 'researcher', state: 'done', note: `${research.sources.length} sources read` });
  } catch (error) {
    const note =
      error instanceof ResearchUnavailableError
        ? 'Web research is not configured; working from your context only.'
        : 'Search failed; working from your context only.';
    emit({ type: 'agent', agent: 'researcher', state: 'skipped', note });
  }
  const researchBlock = research
    ? formatResearchForModel(research)
    : 'No web research is available for this run. Do not state any current facts that are not in the user context.';

  // ----- Strategist --------------------------------------------------------
  emit({ type: 'agent', agent: 'strategist', state: 'active' });
  const strategy = await createMessage({
    system,
    messages: [
      {
        role: 'user',
        content: `Brief: ${brief}\n\nResearch:\n${researchBlock}\n\nAs the Strategist, write a short strategy in Markdown, under 350 words, with these sections:\n## Who it is for\n## The angle\nThe one angle worth betting on, and why it is not what everyone else is saying.\n## The plan\nUp to ${MAX_POSTS} posts: platform, format, and the job each one does, in order.\n## What we will not claim\nAnything tempting that the sources or the user's context do not support.\nNo projected numbers.`,
      },
    ],
    maxTokens: 1200,
    temperature: 0.4,
  });
  usage = addUsage(usage, strategy.usage);
  const strategyText = textOf(strategy).trim();
  emit({ type: 'notes', agent: 'strategist', markdown: strategyText });
  emit({ type: 'agent', agent: 'strategist', state: 'done' });

  // ----- Writer ------------------------------------------------------------
  emit({ type: 'agent', agent: 'writer', state: 'active' });
  const written = await structuredCall<{ posts?: unknown }>({
    system,
    messages: [
      {
        role: 'user',
        content: `Brief: ${brief}\n\nStrategy:\n${strategyText}\n\nResearch:\n${researchBlock}\n\nAs the Writer, write every post in the plan, in the user's measured voice. Use their Story Bank for anything personal. Each post must stand on its own in the feed.`,
      },
    ],
    tool: {
      name: 'submit_posts',
      description: 'Submit the campaign posts.',
      input_schema: { type: 'object', properties: { posts: POSTS_SCHEMA }, required: ['posts'] },
    },
    maxTokens: 3500,
    temperature: 0.7,
  });
  usage = addUsage(usage, written.usage);
  const firstPass = cleanPosts(written.data.posts);
  if (firstPass.length === 0) throw new Error('The Writer did not produce any posts. Try a more specific brief.');
  emit({ type: 'agent', agent: 'writer', state: 'done', note: `${firstPass.length} ${firstPass.length === 1 ? 'post' : 'posts'}` });

  // ----- Red Team ----------------------------------------------------------
  emit({ type: 'agent', agent: 'red_team', state: 'active' });
  const critique = await createMessage({
    system,
    messages: [
      {
        role: 'user',
        content: `Brief: ${brief}\n\nResearch:\n${researchBlock}\n\nPosts:\n${formatPosts(firstPass)}\n\nAs the Red Team, attack these posts. For each post, list in Markdown under a "### Post N" heading:\n- Lines a reader would scroll past, and why\n- Anything generic that any account could have posted\n- Any claim not supported by the research or the user's context\n- Anything that does not sound like the user's measured voice\n- The single most important fix\nBe specific and quote the line. Under 450 words in total.`,
      },
    ],
    maxTokens: 2000,
    temperature: 0.3,
  });
  usage = addUsage(usage, critique.usage);
  const critiqueText = textOf(critique).trim();
  emit({ type: 'notes', agent: 'red_team', markdown: critiqueText });
  emit({ type: 'agent', agent: 'red_team', state: 'done' });

  // ----- Editor ------------------------------------------------------------
  emit({ type: 'agent', agent: 'editor', state: 'active' });
  const edited = await structuredCall<{ posts?: unknown }>({
    system,
    messages: [
      {
        role: 'user',
        content: `Posts:\n${formatPosts(firstPass)}\n\nRed Team critique:\n${critiqueText}\n\nAs the Editor, return the final version of every post with each valid criticism fixed. Remove any unsupported claim or replace it with a [bracketed placeholder]. Keep what already works.`,
      },
    ],
    tool: {
      name: 'submit_posts',
      description: 'Submit the final campaign posts.',
      input_schema: { type: 'object', properties: { posts: POSTS_SCHEMA }, required: ['posts'] },
    },
    maxTokens: 3500,
    temperature: 0.4,
  });
  usage = addUsage(usage, edited.usage);
  const finals = cleanPosts(edited.data.posts);
  const posts = finals.length > 0 ? finals : firstPass;

  // Session first, so the drafts can belong to it.
  const title = `War Room: ${brief.replace(/\s+/g, ' ').slice(0, 40)}${brief.length > 40 ? '...' : ''}`;
  const { data: session } = await db
    .from('chat_sessions')
    .insert({ user_id: userId, title, workspace_id: workspace?.id ?? null })
    .select('id')
    .single();
  const sessionId: string | null = session?.id ?? null;

  const drafts: DraftRecord[] = [];
  for (const post of posts) {
    const graded = await gradeOpening({
      text: post.kind === 'thread' && post.segments.length > 0 ? post.segments[0] : post.body,
      platform: post.platform,
    }).catch(() => null);
    if (graded) usage = addUsage(usage, graded.usage);
    const draft = await createDraft(db, userId, workspace?.id ?? null, {
      platform: post.platform,
      kind: post.kind,
      body: post.body,
      segments: post.kind === 'thread' ? post.segments : [],
      notes: post.purpose || null,
      sessionId,
      grade: graded?.grade ?? null,
    });
    drafts.push(draft);
    emit({ type: 'draft', draft });
  }
  emit({ type: 'agent', agent: 'editor', state: 'done', note: `${drafts.length} drafts graded` });

  const sourcesBlock =
    research && research.sources.length > 0 ? `\n\n## Sources\n${research.sources.map((s) => `- [${s.title || s.url}](${s.url})`).join('\n')}` : '';
  const reply = `${strategyText}${sourcesBlock}\n\n## The posts\n${drafts.map((d) => markerBlock(MARKER.draft, { id: d.id })).join('')}\n\n## What the Red Team fixed\n\n${critiqueText}`;

  if (sessionId) {
    await db.from('chat_messages').insert([
      { session_id: sessionId, role: 'user', content: brief },
      { session_id: sessionId, role: 'assistant', content: reply },
    ]);
    await db.from('chat_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', sessionId);
  }

  emit({ type: 'done', sessionId, brief: strategyText });
  return { usage, sessionId };
}
