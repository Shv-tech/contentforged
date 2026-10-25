/**
 * lib/forge/assist.ts
 *
 * Small, focused model calls that act on part of a draft: alternative hooks,
 * and rewriting a selected span (punchier, shorter, more like me, make it
 * true). Each sees the user's voice and rules, so edits stay in their voice.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { structuredCall } from '@/lib/ai/anthropic';
import { addUsage, EMPTY_USAGE, type TokenUsage } from '@/lib/billing/plans';
import { acceptedRules } from './data/rules';
import { formatStoriesForModel, searchStories } from './data/stories';
import { getFingerprint } from './data/voice';
import { gradeOpening } from './grader';
import { slopPromptList } from './slop';
import { firstLine } from './text';
import { PLATFORM_NAMES, type DraftPlatform, type Grade } from './types';
import { MIN_SAMPLES_FOR_SCORING, voicePromptBlock } from './voice';

async function voiceContext(db: SupabaseClient, userId: string, workspaceId: string | null): Promise<string> {
  const [fingerprint, rules] = await Promise.all([
    getFingerprint(db, userId, workspaceId).catch(() => null),
    acceptedRules(db, userId, workspaceId).catch(() => []),
  ]);
  const parts: string[] = [];
  if (fingerprint && fingerprint.sample_count >= MIN_SAMPLES_FOR_SCORING) {
    parts.push(`The author's voice:\n${voicePromptBlock(fingerprint.profile, fingerprint.traits)}`);
  }
  if (rules.length > 0) parts.push(`The author's rules:\n${rules.map((r) => `- ${r.rule}`).join('\n')}`);
  parts.push(`Never use these machine-written phrases:\n${slopPromptList()}`);
  parts.push('Never invent facts about the author. No em dashes.');
  return parts.join('\n\n');
}

// ============================================================================
// HOOK VARIANTS
// ============================================================================

export interface HookVariant {
  hook: string;
  approach: string;
  grade: Grade;
}

const VARIANTS_TOOL = {
  name: 'submit_hooks',
  description: 'Submit three alternative opening lines.',
  input_schema: {
    type: 'object',
    properties: {
      hooks: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            hook: { type: 'string', description: 'The new opening line. Same facts as the post; nothing invented.' },
            approach: { type: 'string', description: 'Two to four words naming the approach, e.g. "Lead with the number".' },
          },
          required: ['hook', 'approach'],
        },
      },
    },
    required: ['hooks'],
  },
};

export async function hookVariants(
  db: SupabaseClient,
  userId: string,
  workspaceId: string | null,
  draft: { text: string; platform: DraftPlatform }
): Promise<{ variants: HookVariant[]; usage: TokenUsage }> {
  const context = await voiceContext(db, userId, workspaceId);
  const current = firstLine(draft.text);

  const { data, usage } = await structuredCall<{ hooks?: Array<{ hook: string; approach: string }> }>({
    system: `You write alternative opening lines for a ${PLATFORM_NAMES[draft.platform]} post. Three genuinely different approaches, not three wordings of one. Each must work with the rest of the post unchanged and use only facts already in it.\n\n${context}`,
    messages: [{ role: 'user', content: `Current opening: ${current}\n\nFull post:\n${draft.text}` }],
    tool: VARIANTS_TOOL,
    temperature: 0.8,
    maxTokens: 700,
  });

  const hooks = (data.hooks ?? []).filter((h) => typeof h.hook === 'string' && h.hook.trim()).slice(0, 3);
  let total = usage;

  const graded = await Promise.all(
    hooks.map(async (h) => {
      const body = draft.text.replace(current, h.hook.trim());
      const result = await gradeOpening({ text: body, platform: draft.platform });
      return { hook: h.hook.trim(), approach: String(h.approach ?? '').slice(0, 60), grade: result.grade, usage: result.usage };
    })
  );

  for (const g of graded) total = addUsage(total, g.usage);
  return {
    variants: graded.map(({ hook, approach, grade }) => ({ hook, approach, grade })).sort((a, b) => b.grade.score - a.grade.score),
    usage: total,
  };
}

// ============================================================================
// SPAN REWRITE
// ============================================================================

export const REWRITE_MODES = ['punchier', 'shorter', 'voice', 'true'] as const;
export type RewriteMode = (typeof REWRITE_MODES)[number];

const MODE_INSTRUCTIONS: Record<RewriteMode, string> = {
  punchier: 'Make it hit harder: concrete words, a sharper verb, fewer qualifiers. Same meaning, same facts.',
  shorter: 'Cut it to the fewest words that keep the meaning. Aim for half the length.',
  voice: 'Rewrite it so it sounds exactly like the author, using their measured voice above.',
  true: 'Make it true. Replace any claim about the author that is not supported by the Story Bank facts with the real fact, or with a [bracket] placeholder if no fact fits. Do not add new claims.',
};

const REWRITE_TOOL = {
  name: 'submit_rewrite',
  description: 'Submit the rewritten span.',
  input_schema: {
    type: 'object',
    properties: {
      replacement: { type: 'string', description: 'Only the rewritten span, ready to drop in place of the original.' },
      note: { type: 'string', description: 'For "true" mode: one short line on what was changed and why. Otherwise empty.' },
    },
    required: ['replacement', 'note'],
  },
};

export async function rewriteSpan(
  db: SupabaseClient,
  userId: string,
  workspaceId: string | null,
  input: { text: string; span: string; mode: RewriteMode; platform: DraftPlatform }
): Promise<{ replacement: string; note: string | null; usage: TokenUsage }> {
  const context = await voiceContext(db, userId, workspaceId);
  const stories = input.mode === 'true' ? formatStoriesForModel(await searchStories(db, userId, workspaceId, input.span, 8)) : null;

  const { data, usage } = await structuredCall<{ replacement?: string; note?: string }>({
    system: [
      `You edit one span of a ${PLATFORM_NAMES[input.platform]} post. ${MODE_INSTRUCTIONS[input.mode]}`,
      'Return only the replacement for the span. Keep it consistent with the surrounding text.',
      context,
      stories ? `Story Bank facts:\n${stories}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    messages: [{ role: 'user', content: `Full post:\n${input.text}\n\nSpan to rewrite:\n${input.span}` }],
    tool: REWRITE_TOOL,
    temperature: input.mode === 'true' ? 0.1 : 0.6,
    maxTokens: 500,
  });

  const replacement = typeof data.replacement === 'string' ? data.replacement.trim() : '';
  return {
    replacement: replacement || input.span,
    note: typeof data.note === 'string' && data.note.trim() ? data.note.trim() : null,
    usage: usage ?? EMPTY_USAGE,
  };
}
