/**
 * lib/forge/agent/tools.ts
 *
 * The tools the chat model can call, and the executor that runs them.
 *
 * Two kinds of tool:
 *   - Working tools (search_story_bank, web_research, present_draft, ...)
 *     run, return a result to the model, and the conversation continues.
 *   - Turn-ending tools (ask_user, propose_plan) hand control back to the
 *     user. The loop stops, the client renders a card, and the user's answer
 *     arrives as the next message.
 *
 * SECURITY BOUNDARY: identity and scope always come from AgentContext, which
 * the route builds from the verified session. Nothing the model passes can
 * change which user or workspace a tool acts on.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolDefinition } from '@/lib/ai/anthropic';
import type { TokenUsage } from '@/lib/billing/plans';
import { createStory, formatStoriesForModel, markStoriesUsed, searchStories, STORY_KINDS } from '../data/stories';
import { addRule } from '../data/rules';
import { createDraft, draftText, updateDraft } from '../data/drafts';
import { gradeOpening } from '../grader';
import { formatResearchForModel, researchWeb, ResearchUnavailableError } from '../research';
import { splitIntoThread, measure, PLATFORM_LIMITS } from '../text';
import {
  isDraftPlatform,
  PLATFORM_NAMES,
  type ChatStreamEvent,
  type ClarifyingQuestion,
  type DraftKind,
  type DraftRecord,
  type PlanProposal,
  type StoryKind,
} from '../types';

export interface AgentContext {
  db: SupabaseClient;
  userId: string;
  workspaceId: string | null;
  sessionId: string | null;
  emit: (event: ChatStreamEvent) => void;
  /** Usage from grading and other model calls made inside tools. */
  addUsage: (usage: TokenUsage) => void;
  /** Background work (grading) that must finish before the turn closes. */
  defer: (work: Promise<unknown>) => void;
}

export interface ToolOutcome {
  /** Returned to the model as the tool_result content. */
  result: string;
  isError?: boolean;
  /** Stops the loop and returns control to the user. */
  endsTurn?: boolean;
  /** Marker text to persist in the assistant message for this tool. */
  marker?: string;
}

// ============================================================================
// DEFINITIONS
// ============================================================================

export const FORGE_TOOLS: ToolDefinition[] = [
  {
    name: 'ask_user',
    description:
      'Ask the user one to three short questions before writing, when a missing fact or an open choice would change the post. Renders as tappable options. Ends your turn; the answers arrive as the next message. Never ask about anything already in the Brand DNA, Story Bank or conversation.',
    input_schema: {
      type: 'object',
      properties: {
        intro: { type: 'string', description: 'Optional one-line lead-in, e.g. "Two things before I write this."' },
        questions: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Short slug, e.g. "audience".' },
              question: { type: 'string', description: 'The question, under 80 characters.' },
              mode: {
                type: 'string',
                enum: ['single', 'multi', 'free'],
                description: 'single: pick one option. multi: pick several. free: type an answer (for real numbers and facts).',
              },
              options: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'Two to four short options for single or multi. Empty for free.' },
              placeholder: { type: 'string', description: 'Hint for the text field.' },
            },
            required: ['id', 'question', 'mode'],
          },
        },
      },
      required: ['questions'],
    },
  },
  {
    name: 'propose_plan',
    description:
      'Before a long generation (an ebook, a thread longer than six posts, a campaign or a series), propose the outline for the user to edit and approve. Ends your turn; the approved plan arrives as the next message.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        kind: { type: 'string', enum: ['ebook', 'thread', 'campaign', 'series'] },
        items: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 30, description: 'Chapters, posts or steps, one line each.' },
        note: { type: 'string', description: 'Optional one-line note on the approach.' },
      },
      required: ['title', 'kind', 'items'],
    },
  },
  {
    name: 'present_draft',
    description:
      'Deliver a publishable post, thread or caption to the user as a draft card with grading, preview, scheduling and posting. Use this for every post you write; never paste a finished post into your reply. One call per platform.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['x', 'linkedin', 'threads', 'bluesky', 'instagram', 'newsletter'] },
        kind: { type: 'string', enum: ['post', 'thread', 'carousel'], description: 'thread: pass segments. carousel: one slide per segment.' },
        body: { type: 'string', description: 'The full post text, for kind "post".' },
        segments: { type: 'array', items: { type: 'string' }, description: 'For threads and carousels: each post or slide, in order.' },
        title: { type: 'string', description: 'A short internal label, e.g. "Launch thread". Not part of the post.' },
        notes: { type: 'string', description: 'One or two lines for the user: what to check or fill in. Not part of the post.' },
        story_ids: { type: 'array', items: { type: 'string' }, description: 'Ids of Story Bank items this draft uses.' },
      },
      required: ['platform', 'kind'],
    },
  },
  {
    name: 'search_story_bank',
    description:
      "Search the user's Story Bank for real facts, numbers and stories about a topic. Call this before writing anything about the user's own life or work, and use what it returns exactly.",
    input_schema: {
      type: 'object',
      properties: { topic: { type: 'string', description: 'What the post is about, in a few words.' } },
      required: ['topic'],
    },
  },
  {
    name: 'save_story',
    description:
      "Save a reusable fact or story the user just shared about themselves or their business (a result, a milestone, a failure, a belief, a number). Use the user's own words. Do not save hypotheticals, small talk, or anything you inferred.",
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: [...STORY_KINDS] },
        title: { type: 'string', description: 'A short label, e.g. "First 60 users came from replies".' },
        body: { type: 'string', description: 'The fact or story as the user told it.' },
        occurred_on: { type: 'string', description: 'ISO date if the user gave one.' },
      },
      required: ['kind', 'title', 'body'],
    },
  },
  {
    name: 'remember_rule',
    description:
      'Save a lasting writing preference the user just stated ("never use emoji", "write in lowercase", "stop ending with questions"). Phrase it as an instruction.',
    input_schema: {
      type: 'object',
      properties: {
        rule: { type: 'string', description: 'The instruction, e.g. "No emoji."' },
        kind: { type: 'string', enum: ['preference', 'banned_phrase', 'structure', 'format'] },
      },
      required: ['rule'],
    },
  },
  {
    name: 'web_research',
    description:
      'Search the web for current facts: recent events, launches, prices, what a person or company is doing now. Returns sources to cite. Do not use for the user’s own facts; use search_story_bank for those.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
];

export const TURN_ENDING_TOOLS = new Set(['ask_user', 'propose_plan']);

/** Progress label shown while each tool runs. */
export const TOOL_STEP_LABELS: Record<string, string> = {
  ask_user: 'Preparing questions',
  propose_plan: 'Outlining',
  present_draft: 'Drafting',
  search_story_bank: 'Checking your Story Bank',
  save_story: 'Saving to your Story Bank',
  remember_rule: 'Saving your rule',
  web_research: 'Searching the web',
  get_calendar_events: 'Reading your calendar',
  create_calendar_event: 'Scheduling',
  create_calendar_events_bulk: 'Building the schedule',
  update_calendar_event: 'Updating the calendar',
  delete_calendar_events: 'Updating the calendar',
};

// ============================================================================
// EXECUTION
// ============================================================================

function asString(value: unknown, max = 10_000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function asStringArray(value: unknown, maxItems: number, maxLength = 4000): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

export async function executeForgeTool(name: string, input: Record<string, unknown>, ctx: AgentContext): Promise<ToolOutcome> {
  switch (name) {
    case 'ask_user':
      return askUser(input, ctx);
    case 'propose_plan':
      return proposePlan(input, ctx);
    case 'present_draft':
      return presentDraft(input, ctx);
    case 'search_story_bank':
      return searchStoryBank(input, ctx);
    case 'save_story':
      return saveStory(input, ctx);
    case 'remember_rule':
      return rememberRule(input, ctx);
    case 'web_research':
      return webResearch(input);
    default:
      return { result: `Unknown tool: ${name}`, isError: true };
  }
}

function askUser(input: Record<string, unknown>, ctx: AgentContext): ToolOutcome {
  const raw = Array.isArray(input.questions) ? input.questions : [];
  const questions: ClarifyingQuestion[] = raw
    .slice(0, 3)
    .map((item, index): ClarifyingQuestion | null => {
      if (!item || typeof item !== 'object') return null;
      const q = item as Record<string, unknown>;
      const question = asString(q.question, 160);
      if (!question) return null;
      const options = asStringArray(q.options, 4, 80);
      const requested = q.mode === 'multi' || q.mode === 'free' ? q.mode : 'single';
      // A choice question with no options can only be answered by typing.
      const mode = requested !== 'free' && options.length < 2 ? 'free' : requested;
      return {
        id: asString(q.id, 40) || `q${index + 1}`,
        question,
        mode,
        options: mode === 'free' ? [] : options,
        placeholder: asString(q.placeholder, 80) || undefined,
      };
    })
    .filter((q): q is ClarifyingQuestion => q !== null);

  if (questions.length === 0) {
    return { result: 'No valid questions were provided. Write the draft with [brackets] for missing facts instead.', isError: true };
  }

  const intro = asString(input.intro, 160) || null;
  ctx.emit({ type: 'questions', intro, questions });
  return {
    result: 'Questions shown to the user. Wait for their answers.',
    endsTurn: true,
    marker: JSON.stringify({ intro, questions }),
  };
}

function proposePlan(input: Record<string, unknown>, ctx: AgentContext): ToolOutcome {
  const kinds: PlanProposal['kind'][] = ['ebook', 'thread', 'campaign', 'series'];
  const plan: PlanProposal = {
    title: asString(input.title, 140) || 'Plan',
    kind: kinds.includes(input.kind as PlanProposal['kind']) ? (input.kind as PlanProposal['kind']) : 'series',
    items: asStringArray(input.items, 30, 240),
    note: asString(input.note, 240) || undefined,
  };
  if (plan.items.length < 2) return { result: 'A plan needs at least two items.', isError: true };

  ctx.emit({ type: 'plan', plan });
  return { result: 'Plan shown to the user for approval.', endsTurn: true, marker: JSON.stringify(plan) };
}

async function presentDraft(input: Record<string, unknown>, ctx: AgentContext): Promise<ToolOutcome> {
  const platform = isDraftPlatform(input.platform) ? input.platform : 'linkedin';
  let kind: DraftKind = input.kind === 'thread' || input.kind === 'carousel' ? input.kind : 'post';
  let segments = asStringArray(input.segments, 25, 4000);
  let body = asString(input.body, 20_000);

  if (kind === 'post' && !body && segments.length > 0) body = segments.join('\n\n');
  if (kind !== 'post' && segments.length === 0 && body) {
    segments = kind === 'thread' ? splitIntoThread(body, platform) : body.split(/\n{2,}/).filter(Boolean);
  }
  // A "post" too long for X becomes a thread automatically rather than a
  // draft that cannot be published as written.
  if (kind === 'post' && platform === 'x' && measure(body, 'x') > PLATFORM_LIMITS.x) {
    kind = 'thread';
    segments = splitIntoThread(body, 'x');
  }
  if (!body && segments.length === 0) {
    return { result: 'The draft was empty. Provide body or segments.', isError: true };
  }

  const draft = await createDraft(ctx.db, ctx.userId, ctx.workspaceId, {
    platform,
    kind,
    body,
    segments,
    title: asString(input.title, 120) || null,
    notes: asString(input.notes, 600) || null,
    sessionId: ctx.sessionId,
  });

  ctx.emit({ type: 'draft', draft });

  const storyIds = asStringArray(input.story_ids, 10, 64);
  if (storyIds.length > 0) {
    ctx.defer(markStoriesUsed(ctx.db, ctx.userId, storyIds, ctx.workspaceId).catch(() => undefined));
  }

  // Grading runs alongside the rest of the turn. The card shows the draft
  // immediately, then fills in the grade when it lands.
  ctx.defer(
    gradeOpening({ text: draftText(draft), platform })
      .then(async ({ grade, usage }) => {
        ctx.addUsage(usage);
        const graded = await updateDraft(ctx.db, ctx.userId, draft.id, { grade });
        ctx.emit({ type: 'draft', draft: graded as DraftRecord });
      })
      .catch((error) => console.error('[forge/agent] grading failed:', error))
  );

  const issues: string[] = [];
  if (kind === 'thread') {
    const over = segments.filter((s) => measure(s, platform) > PLATFORM_LIMITS[platform]).length;
    if (over > 0) issues.push(`${over} segment(s) are over the ${PLATFORM_NAMES[platform]} limit.`);
  } else if (measure(draft.body, platform) > PLATFORM_LIMITS[platform]) {
    issues.push(`The post is over the ${PLATFORM_NAMES[platform]} limit of ${PLATFORM_LIMITS[platform]} characters.`);
  }

  return {
    result: [
      `Draft ${draft.id} shown to the user as a card (${PLATFORM_NAMES[platform]}, ${kind}).`,
      draft.voice_score !== null ? `Voice match: ${draft.voice_score}/100.` : 'No voice fingerprint yet.',
      ...issues,
      'Do not repeat the post in your reply. Add at most three short lines.',
    ].join(' '),
    marker: JSON.stringify({ id: draft.id }),
  };
}

async function searchStoryBank(input: Record<string, unknown>, ctx: AgentContext): Promise<ToolOutcome> {
  const topic = asString(input.topic, 200);
  const items = await searchStories(ctx.db, ctx.userId, ctx.workspaceId, topic);
  return { result: formatStoriesForModel(items) };
}

async function saveStory(input: Record<string, unknown>, ctx: AgentContext): Promise<ToolOutcome> {
  const kind = (STORY_KINDS as readonly string[]).includes(input.kind as string) ? (input.kind as StoryKind) : 'fact';
  const title = asString(input.title, 140);
  const body = asString(input.body, 4000);
  if (!title || !body) return { result: 'A story needs a title and a body.', isError: true };

  const occurred = asString(input.occurred_on, 10);
  const story = await createStory(ctx.db, ctx.userId, ctx.workspaceId, {
    kind,
    title,
    body,
    occurred_on: /^\d{4}-\d{2}-\d{2}$/.test(occurred) ? occurred : null,
    source: 'chat',
  });

  ctx.emit({ type: 'memory', kind: 'story', id: story.id, label: story.title });
  return {
    result: `Saved to the Story Bank as ${story.id}.`,
    marker: JSON.stringify({ kind: 'story', id: story.id, label: story.title }),
  };
}

async function rememberRule(input: Record<string, unknown>, ctx: AgentContext): Promise<ToolOutcome> {
  const rule = asString(input.rule, 280);
  if (rule.length < 3) return { result: 'The rule was empty.', isError: true };
  const kinds = ['preference', 'banned_phrase', 'structure', 'format'] as const;
  const kind = kinds.includes(input.kind as (typeof kinds)[number]) ? (input.kind as (typeof kinds)[number]) : 'preference';

  const saved = await addRule(ctx.db, ctx.userId, ctx.workspaceId, { rule, kind, source: 'chat' });
  ctx.emit({ type: 'memory', kind: 'rule', id: saved.id, label: saved.rule });
  return {
    result: 'Rule saved. It applies to every future draft.',
    marker: JSON.stringify({ kind: 'rule', id: saved.id, label: saved.rule }),
  };
}

async function webResearch(input: Record<string, unknown>): Promise<ToolOutcome> {
  const query = asString(input.query, 400);
  if (!query) return { result: 'The query was empty.', isError: true };
  try {
    return { result: formatResearchForModel(await researchWeb(query)) };
  } catch (error) {
    const message =
      error instanceof ResearchUnavailableError
        ? `${error.message} Tell the user you could not check this, and do not state it as fact.`
        : 'The search failed. Tell the user you could not check this, and do not state it as fact.';
    return { result: message, isError: true };
  }
}
