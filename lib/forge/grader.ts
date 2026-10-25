/**
 * lib/forge/grader.ts
 *
 * The Stop-Scroll Grader: scores an opening line on five dimensions and names
 * the one fix that matters most.
 *
 * DESIGN NOTES
 *
 * Calibration over flattery. A grader that gives everything a 44 teaches
 * people to ignore it. The rubric anchors each dimension with what a 2, a 5
 * and a 9 look like, the model runs at temperature 0, and the verdict comes
 * from the arithmetic, not from the model's mood.
 *
 * One fix, not ten. The output is the single weakest thing and a rewrite
 * that addresses it. A list of ten suggestions gets skimmed; one gets acted on.
 *
 * Structured output. The model answers through a forced tool call, so the
 * result is schema-shaped JSON rather than prose scraped with a regex (which
 * is how the previous grader card read its score).
 */

import { structuredCall, type ToolDefinition } from '@/lib/ai/anthropic';
import type { TokenUsage } from '@/lib/billing/plans';
import { GRADE_DIMENSIONS, PLATFORM_NAMES, type DraftPlatform, type Grade, type GradeVerdict } from './types';

export const GRADE_THRESHOLDS = { ready: 40, revise: 30 } as const;

export function verdictFor(score: number): GradeVerdict {
  if (score >= GRADE_THRESHOLDS.ready) return 'ready';
  if (score >= GRADE_THRESHOLDS.revise) return 'revise';
  return 'rethink';
}

const GRADE_TOOL: ToolDefinition = {
  name: 'submit_grade',
  description: 'Submit the grade for the opening line.',
  input_schema: {
    type: 'object',
    properties: {
      pattern_interrupt: { type: 'integer', minimum: 0, maximum: 10 },
      curiosity_gap: { type: 'integer', minimum: 0, maximum: 10 },
      emotional_charge: { type: 'integer', minimum: 0, maximum: 10 },
      specificity: { type: 'integer', minimum: 0, maximum: 10 },
      shareability: { type: 'integer', minimum: 0, maximum: 10 },
      weakest: {
        type: 'string',
        description: 'One sentence naming the single weakest thing about the line, concretely. No hedging.',
      },
      rewrite: {
        type: 'string',
        description:
          'The opening line rewritten to fix the weakest thing, in the same voice. Keep every fact as given. If a fact is missing, use a [bracket] placeholder; never invent numbers or events. Empty string if the line already scores 45 or more.',
      },
    },
    required: ['pattern_interrupt', 'curiosity_gap', 'emotional_charge', 'specificity', 'shareability', 'weakest', 'rewrite'],
  },
};

const RUBRIC = `You grade the opening line of a social post: the part a reader sees before deciding to keep reading. You are calibrated and blunt. Most lines are average; average is 5.

Score each dimension 0-10:

PATTERN INTERRUPT: does it break the feed's rhythm?
  2 = reads like every other post ("Excited to share...", "Here are 5 tips")
  5 = competent but familiar
  9 = an unexpected claim, image or admission that makes a thumb stop

CURIOSITY GAP: does it open a question the reader needs closed?
  2 = gives the whole point away, or promises nothing
  5 = mild interest
  9 = a specific gap that only the rest of the post can close

EMOTIONAL CHARGE: does it make the reader feel something?
  2 = neutral information
  5 = mild interest or agreement
  9 = recognition, tension, surprise, or stakes the reader feels

SPECIFICITY: are there concrete numbers, names, places or details?
  2 = abstractions ("success", "growth", "the journey")
  5 = one concrete detail
  9 = precise and real, the kind of detail nobody makes up

SHAREABILITY: would someone repost it to look smart or to say "this is me"?
  2 = no reason to share
  5 = maybe within a niche
  9 = a line people quote

Rules:
- Grade only the opening (up to the first blank line). Use the rest for context.
- Do not reward length, emoji, or hype. Penalise phrases readers recognise as machine-written.
- The rewrite must keep the author's facts. Never invent numbers, names or events; use [brackets] for anything missing.`;

export interface GradeInput {
  text: string;
  platform?: DraftPlatform;
  /** Optional per-user calibration note from the Playbook. */
  calibration?: string;
}

export async function gradeOpening(input: GradeInput): Promise<{ grade: Grade; usage: TokenUsage }> {
  const text = input.text.trim().slice(0, 4000);
  const platform = input.platform ? PLATFORM_NAMES[input.platform] : 'X or LinkedIn';

  const { data, usage } = await structuredCall<Record<string, unknown>>({
    system: [{ type: 'text', text: RUBRIC, cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: [
      {
        role: 'user',
        content: [`Platform: ${platform}.`, input.calibration ? `Calibration for this author: ${input.calibration}` : '', 'Post:', '"""', text, '"""']
          .filter(Boolean)
          .join('\n'),
      },
    ],
    tool: GRADE_TOOL,
    temperature: 0,
    maxTokens: 600,
  });

  return { grade: toGrade(data), usage };
}

function clampScore(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n)));
}

export function toGrade(raw: Record<string, unknown>): Grade {
  const dimensions = GRADE_DIMENSIONS.map(({ key, label }) => ({
    key,
    label,
    score: clampScore(raw[key]),
  }));
  const score = dimensions.reduce((total, d) => total + d.score, 0);
  const rewrite = typeof raw.rewrite === 'string' && raw.rewrite.trim() ? raw.rewrite.trim() : null;

  return {
    score,
    verdict: verdictFor(score),
    dimensions,
    weakest: typeof raw.weakest === 'string' ? raw.weakest.trim() : '',
    rewrite: score >= 45 ? null : rewrite,
    gradedAt: new Date().toISOString(),
  };
}
