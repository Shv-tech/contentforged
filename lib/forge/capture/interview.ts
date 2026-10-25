/**
 * lib/forge/capture/interview.ts
 *
 * The question list for interview mode. A ghostwriter recording a session
 * with their client (or someone interviewing themselves) gets questions
 * aimed at what the Story Bank is missing: the kinds of material it has
 * least of, and the topics the brand posts about with the fewest true
 * stories behind them.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { structuredCall, type ToolDefinition } from '@/lib/ai/anthropic';
import type { TokenUsage } from '@/lib/billing/plans';
import { listStories } from '../data/stories';
import { STORY_KIND_LABELS } from '../labels';
import { cleanString } from '../text';
import type { StoryKind } from '../types';

export interface InterviewQuestion {
  question: string;
  /** Why this question, in a few words: the gap it fills. */
  why: string;
  followUp: string | null;
}

const GUIDE_TOOL: ToolDefinition = {
  name: 'submit_questions',
  description: 'Submit the interview questions.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: 5,
        maxItems: 10,
        items: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'Open, concrete, about a specific moment. Never yes/no.' },
            why: { type: 'string', description: 'Under ten words: what gap in their material this fills.' },
            follow_up: { type: 'string', description: 'One probe to get the specific detail: the number, the name of the moment, what they said.' },
          },
          required: ['question', 'why'],
        },
      },
    },
    required: ['questions'],
  },
};

const SYSTEM = `You prepare questions for a recorded interview whose answers become social posts in the interviewee's own words.

Good questions ask about one specific moment: "Tell me about the last time a client pushed back on price. What did you say?" Bad questions ask for opinions in the abstract: "What do you think about pricing?"
Aim at what their material lacks. Ask for numbers, turning points, mistakes and disagreements: those make the posts people remember.
Plain words. No compliments, no warm-up questions.`;

export async function interviewGuide(input: { db: SupabaseClient; userId: string; workspaceId: string | null; subject: string | null; topic: string | null; brandDna: string | null }): Promise<{ questions: InterviewQuestion[]; usage: TokenUsage }> {
  const stories = await listStories(input.db, input.userId, input.workspaceId, 120).catch(() => []);
  const counts = new Map<StoryKind, number>();
  for (const story of stories) counts.set(story.kind, (counts.get(story.kind) ?? 0) + 1);
  const coverage = (Object.keys(STORY_KIND_LABELS) as StoryKind[]).map((kind) => `${STORY_KIND_LABELS[kind]}: ${counts.get(kind) ?? 0}`).join(', ');
  const recent = stories.slice(0, 25).map((s) => `- ${s.title}`).join('\n');

  const user = [
    input.subject ? `INTERVIEWEE: ${input.subject}` : 'INTERVIEWEE: the account owner, interviewing themselves.',
    input.topic ? `FOCUS: ${input.topic}` : 'FOCUS: whatever their material is thinnest on.',
    `STORY BANK COVERAGE (${stories.length} items): ${coverage}`,
    recent ? `ALREADY CAPTURED (do not ask for these again):\n${recent}` : 'ALREADY CAPTURED: nothing yet. Start with their work, their customers, and a recent decision.',
    input.brandDna ? `WHAT THEY DO:\n${input.brandDna.slice(0, 3000)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const { data, usage } = await structuredCall<Record<string, unknown>>(
    { system: SYSTEM, messages: [{ role: 'user', content: user }], tool: GUIDE_TOOL, temperature: 0.5, maxTokens: 1500 },
    { timeoutMs: 40_000 }
  );

  const questions = (Array.isArray(data.questions) ? data.questions : [])
    .map((raw: unknown): InterviewQuestion | null => {
      const value = (raw ?? {}) as Record<string, unknown>;
      const question = cleanString(value.question, 300);
      if (!question) return null;
      return { question, why: cleanString(value.why, 120), followUp: cleanString(value.follow_up, 240) || null };
    })
    .filter((q): q is InterviewQuestion => q !== null)
    .slice(0, 10);
  return { questions, usage };
}
