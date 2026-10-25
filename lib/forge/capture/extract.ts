/**
 * lib/forge/capture/extract.ts
 *
 * Reads raw material (a voice note, an interview, an email, a week of
 * commits) and proposes what is worth keeping: stories, numbers, opinions
 * and wins the person actually stated, each with the words it came from,
 * plus a few angles worth writing about.
 *
 * Proposals are not facts until a person keeps them. The extractor is told
 * to quote, not paraphrase into something grander, and every proposal
 * carries its quote so the person can check it in a second.
 */

import { structuredCall, type ToolDefinition } from '@/lib/ai/anthropic';
import { cleanString as clean } from '../text';
import type { TokenUsage } from '@/lib/billing/plans';
import type { StoryKind, WritingLanguage } from '../types';

import type { CaptureSource } from '../labels';

export { CAPTURE_SOURCE_LABELS, type CaptureSource } from '../labels';

export interface ExtractedProposal {
  kind: StoryKind;
  title: string;
  body: string;
  quote: string | null;
  startSeconds: number | null;
  occurredOn: string | null;
}

export interface ExtractedIdea {
  angle: string;
  rationale: string;
}

export interface Extraction {
  title: string;
  proposals: ExtractedProposal[];
  ideas: ExtractedIdea[];
}

const KINDS: readonly StoryKind[] = ['story', 'metric', 'win', 'failure', 'opinion', 'fact'];

const EXTRACT_TOOL: ToolDefinition = {
  name: 'submit_extraction',
  description: 'Submit what is worth keeping from this material.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Four to eight words naming what this material is about.' },
      proposals: {
        type: 'array',
        maxItems: 10,
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: KINDS as unknown as string[] },
            title: { type: 'string', description: 'Under 12 words, in the person’s own terms.' },
            body: {
              type: 'string',
              description: 'The story, number or belief in one to four sentences, first person, using only what the person said. No embellishment.',
            },
            quote: { type: 'string', description: 'The exact words from the material this comes from, up to 40 words.' },
            timestamp: { type: 'string', description: 'For transcripts, the [m:ss] or [h:mm:ss] marker of the quote. Empty otherwise.' },
            occurred_on: { type: 'string', description: 'YYYY-MM-DD if the material dates it, otherwise empty.' },
          },
          required: ['kind', 'title', 'body', 'quote'],
        },
      },
      ideas: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            angle: { type: 'string', description: 'A post angle in one sentence: the point the post would make.' },
            rationale: { type: 'string', description: 'Why this person can credibly write it, in one sentence, pointing at the material.' },
          },
          required: ['angle', 'rationale'],
        },
      },
    },
    required: ['title', 'proposals', 'ideas'],
  },
};

const SOURCE_HINTS: Record<CaptureSource, string> = {
  voice: 'A voice note the person recorded for themselves. Expect half sentences and filler; keep what they meant.',
  interview: 'A recorded conversation. Only propose what the INTERVIEWEE said about their own work and life, never the interviewer’s words.',
  email: 'An email the person forwarded to themselves. It may be a client thank-you, a result, or a thread. Only propose what concerns the person.',
  share: 'Something the person shared from their phone: a link, a note or a screenshot caption.',
  extension: 'Text the person saved from the web.',
  manual: 'A note the person typed.',
  github: 'A week of releases and merged pull requests in the person’s repositories. Propose shipped work and numbers, never guess at impact.',
  linear: 'Issues the person’s team completed this week.',
  notion: 'Pages the person edited this week.',
  calendar: 'The person’s meetings this week. Do not propose anything about other people; propose only questions worth answering, as ideas.',
};

/** Parses "[1:02:03]" or "4:31" into seconds. */
function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/(\d+):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const [, a, b, c] = match;
  return c !== undefined ? Number(a) * 3600 + Number(b) * 60 + Number(c) : Number(a) * 60 + Number(b);
}

export async function extractFromMaterial(input: {
  source: CaptureSource;
  material: string;
  language: WritingLanguage;
  today: string;
  /** Who the material is about, for interviews: the client's name. */
  subject?: string | null;
}): Promise<{ extraction: Extraction; usage: TokenUsage }> {
  const system = [
    'You read raw material from one person’s working week and propose what is worth keeping for their posts.',
    'Only propose things the material actually says: what happened, what they did, numbers they gave, what they believe, what went wrong. Never infer results, never add detail, never turn a plan into an achievement.',
    'Prefer specific, surprising and personal over general. Skip greetings, logistics and small talk. Fewer, better proposals beat many weak ones; an empty list is a valid answer.',
    'Write proposals in the person’s own language and script, as they spoke or wrote it.',
    'Ideas are angles for posts that this material makes the person credible to write.',
  ].join(' ');

  const user = [
    `TODAY: ${input.today}`,
    `MATERIAL TYPE: ${SOURCE_HINTS[input.source]}`,
    input.subject ? `THE PERSON: ${input.subject}` : '',
    'MATERIAL:',
    '"""',
    input.material.slice(0, 60_000),
    '"""',
  ]
    .filter(Boolean)
    .join('\n');

  const { data, usage } = await structuredCall<Record<string, unknown>>(
    {
      system,
      messages: [{ role: 'user', content: user }],
      tool: EXTRACT_TOOL,
      temperature: 0.2,
      maxTokens: 3000,
    },
    { timeoutMs: 50_000 }
  );

  const proposals = (Array.isArray(data.proposals) ? data.proposals : [])
    .map((raw: Record<string, unknown>): ExtractedProposal | null => {
      const kind = KINDS.includes(raw.kind as StoryKind) ? (raw.kind as StoryKind) : 'story';
      const title = clean(raw.title, 140);
      const body = clean(raw.body, 4000);
      if (!title || !body) return null;
      const occurred = clean(raw.occurred_on, 10);
      return {
        kind,
        title,
        body,
        quote: clean(raw.quote, 1200) || null,
        startSeconds: parseTimestamp(raw.timestamp),
        occurredOn: /^\d{4}-\d{2}-\d{2}$/.test(occurred) ? occurred : null,
      };
    })
    .filter((p): p is ExtractedProposal => p !== null);

  const ideas = (Array.isArray(data.ideas) ? data.ideas : [])
    .map((raw: Record<string, unknown>) => ({ angle: clean(raw.angle, 500), rationale: clean(raw.rationale, 600) }))
    .filter((idea) => idea.angle.length >= 3);

  return { extraction: { title: clean(data.title, 200) || 'Untitled capture', proposals, ideas }, usage };
}
