/**
 * app/api/predictions/route.ts
 *
 * GET  the brand's predictions, newest first: what Forge expected before each
 *      post went out, what happened, and whether it landed in the range.
 *      With the hit rate and which way the misses went, so the person can
 *      see whether to trust the next range.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { brandRequest } from '@/lib/forge/brand-request';
import { scopeRows } from '@/lib/forge/data/workspace';
import { draftText } from '@/lib/forge/draft-text';
import { route } from '@/lib/forge/http';
import { hitRate } from '@/lib/forge/prediction';
import { firstLine, truncate } from '@/lib/forge/text';
import type { DraftRecord } from '@/lib/forge/types';

interface PredictionRow {
  draft_id: string;
  platform: string;
  expected: number;
  low: number;
  high: number;
  basis_count: number;
  actual: number | null;
  landed: boolean | null;
  evaluated_at: string | null;
  created_at: string;
}

export const GET = route('api/predictions', async (req: Request) => {
  const { ctx, workspaceId } = await brandRequest(req);
  const query = ctx.db.from('predictions').select('draft_id, platform, expected, low, high, basis_count, actual, landed, evaluated_at, created_at');
  const { data, error } = await scopeRows(query, ctx.userId, workspaceId).order('created_at', { ascending: false }).limit(60);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as PredictionRow[]).map((r) => ({ ...r, expected: Number(r.expected), low: Number(r.low), high: Number(r.high), actual: r.actual === null ? null : Number(r.actual) }));

  const ids = rows.map((r) => r.draft_id);
  const { data: drafts } = ids.length ? await ctx.db.from('drafts').select('id, kind, body, segments, posted_at, post_url').in('id', ids) : { data: [] };
  const byId = new Map(((drafts ?? []) as Array<Pick<DraftRecord, 'id' | 'kind' | 'body' | 'segments' | 'posted_at' | 'post_url'>>).map((d) => [d.id, d]));

  const evaluated = rows.filter((r) => r.actual !== null);
  return NextResponse.json({
    hitRate: await hitRate(ctx.db, ctx.userId, workspaceId),
    misses: {
      above: evaluated.filter((r) => r.actual !== null && r.actual > r.high).length,
      below: evaluated.filter((r) => r.actual !== null && r.actual < r.low).length,
    },
    predictions: rows.map((r) => {
      const draft = byId.get(r.draft_id);
      return {
        ...r,
        opening: draft ? truncate(firstLine(draftText(draft)), 120) : '',
        postedAt: draft?.posted_at ?? null,
        postUrl: draft?.post_url ?? null,
      };
    }),
  });
});
