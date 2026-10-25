/**
 * lib/forge/repurpose.ts
 *
 * One long piece (a newsletter, a podcast transcript, a talk, an article)
 * becomes a set of posts across platforms, each remembering where it came
 * from. The lineage is what later lets the Playbook say which kinds of
 * source produce the posts that work.
 *
 * Two steps. First the source is read for its distinct ideas, so ten posts
 * are ten different points rather than one point said ten ways. Then each
 * idea is written with the normal writer, against the source passage it came
 * from, under the same truth rule as everything else.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { structuredCall, type ToolDefinition } from '@/lib/ai/anthropic';
import { gradeOpening } from './grader';
import { createDraft } from './data/drafts';
import { recordVersion } from './data/collab';
import type { WorkspaceRef } from './data/workspace';
import { HttpError } from './http';
import { estimateTokens, metered } from './metered';
import type { DraftKind, DraftPlatform, DraftRecord } from './types';
import { estimateWriteTokens, loadBrandContext, writePost } from './writer';

export type SourceKind = 'newsletter' | 'podcast' | 'video' | 'article' | 'post' | 'notes';

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  newsletter: 'Newsletter',
  podcast: 'Podcast transcript',
  video: 'Video transcript',
  article: 'Article',
  post: 'Long post',
  notes: 'Notes',
};

export interface RepurposeTarget {
  platform: DraftPlatform;
  kind: DraftKind;
}

export interface SourcePoint {
  angle: string;
  passage: string;
}

const POINTS_TOOL: ToolDefinition = {
  name: 'submit_points',
  description: 'Submit the distinct ideas in the source.',
  input_schema: {
    type: 'object',
    properties: {
      points: {
        type: 'array',
        minItems: 1,
        maxItems: 12,
        items: {
          type: 'object',
          properties: {
            angle: { type: 'string', description: 'The point, in one sentence, as a post would make it.' },
            passage: { type: 'string', description: 'The passage of the source this point comes from, quoted, up to 1,200 characters.' },
          },
          required: ['angle', 'passage'],
        },
      },
    },
    required: ['points'],
  },
};

async function findPoints(userId: string, title: string, body: string, count: number): Promise<SourcePoint[]> {
  return metered({ userId, route: 'repurpose:points', maxOutputTokens: 3000, estimatedInputTokens: estimateTokens(body) + 600 }, async () => {
    const { data, usage } = await structuredCall<{ points?: Array<{ angle?: string; passage?: string }> }>({
      system:
        'You read one long piece by an author and list its distinct ideas: different points, not the same point reworded. Prefer points with a specific example, number or story behind them. Quote the passage each point comes from exactly.',
      messages: [{ role: 'user', content: `List up to ${count} distinct ideas in "${title}".\n\n"""\n${body.slice(0, 60_000)}\n"""` }],
      tool: POINTS_TOOL,
      temperature: 0.2,
      maxTokens: 3000,
    });
    const points = (data.points ?? [])
      .map((p) => ({ angle: (p.angle ?? '').trim(), passage: (p.passage ?? '').trim() }))
      .filter((p) => p.angle.length > 3);
    return { value: points.slice(0, count), usage };
  });
}

export interface RepurposeInput {
  db: SupabaseClient;
  userId: string;
  workspace: WorkspaceRef | null;
  source: { kind: SourceKind; title: string; url: string | null; body: string };
  targets: RepurposeTarget[];
  /** How many distinct ideas to take from the source. */
  ideas: number;
}

export interface RepurposeResult {
  sourceId: string;
  drafts: DraftRecord[];
  skipped: number;
}

export async function repurpose(input: RepurposeInput): Promise<RepurposeResult> {
  const { db, userId, workspace } = input;
  const workspaceId = workspace?.id ?? null;
  if (input.source.body.trim().length < 300) throw new HttpError(400, 'Paste at least a few paragraphs to repurpose.');
  if (input.targets.length === 0) throw new HttpError(400, 'Choose at least one platform.');

  const { data: sourceRow, error } = await db
    .from('repurpose_sources')
    .insert({ user_id: userId, workspace_id: workspaceId, kind: input.source.kind, title: input.source.title.slice(0, 200), url: input.source.url, body: input.source.body.slice(0, 200_000) })
    .select('id')
    .single();
  if (error || !sourceRow) throw new Error(`Could not save the source: ${error?.message ?? 'unknown error'}`);

  const points = await findPoints(userId, input.source.title, input.source.body, Math.min(input.ideas, 12));
  const context = await loadBrandContext(db, userId, workspace);

  // Each idea goes to the targets in turn, so a set of ten posts is spread
  // across platforms instead of every idea landing everywhere.
  const jobs = points.map((point, index) => ({ point, target: input.targets[index % input.targets.length] }));
  const drafts: DraftRecord[] = [];
  let skipped = 0;

  for (const job of jobs) {
    const request = {
      angle: job.point.angle,
      platform: job.target.platform,
      kind: job.target.kind,
      source: { title: input.source.title, excerpt: job.point.passage || input.source.body.slice(0, 4000) },
    };
    try {
      const written = await metered({ userId, route: 'repurpose:write', maxOutputTokens: 2400, estimatedInputTokens: estimateWriteTokens(context, request) }, async () => {
        const result = await writePost(context, request);
        return { value: result.draft, usage: result.usage };
      });
      const text = written.segments.length > 0 ? written.segments.join('\n\n') : written.body;
      const grade = await metered({ userId, route: 'repurpose:grade', maxOutputTokens: 600, estimatedInputTokens: estimateTokens(text) + 900 }, async () => {
        const result = await gradeOpening({ text, platform: job.target.platform });
        return { value: result.grade, usage: result.usage };
      }).catch(() => null);

      const draft = await createDraft(db, userId, workspaceId, {
        platform: written.platform,
        kind: written.kind,
        body: written.body,
        segments: written.segments,
        title: written.title,
        notes: written.missingFacts.length > 0 ? `Fill in before posting: ${written.missingFacts.join('; ')}.` : null,
        grade,
        sourceId: sourceRow.id,
        language: context.language,
      });
      await recordVersion(db, { draft, userId, reason: 'created' }).catch(() => undefined);
      drafts.push(draft);
    } catch (error) {
      if (error instanceof HttpError && error.status === 429) {
        // Out of allowance: everything not yet written is skipped.
        skipped = jobs.length - drafts.length;
        break;
      }
      console.error('[forge/repurpose] one draft failed:', error);
      skipped += 1;
    }
  }

  return { sourceId: sourceRow.id, drafts, skipped };
}
