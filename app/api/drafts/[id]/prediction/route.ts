/**
 * app/api/drafts/[id]/prediction/route.ts
 *
 * GET  how this draft is likely to do against the author's usual, the
 *      range, how many past posts it rests on, and how often Forge's ranges
 *      have been right for this brand. After posting, the frozen prediction
 *      and the actual result.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { loadDraftFor } from '@/lib/forge/data/drafts';
import { isUuid, HttpError, requireUser, route } from '@/lib/forge/http';
import { describeRange, hitRate, MIN_BASIS, predictDraft } from '@/lib/forge/prediction';
import { timezoneOf } from '@/lib/forge/profile';

export const GET = route('api/drafts/[id]/prediction', async (req: Request, { params }: { params: { id: string } }) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Draft not found.');
  const ctx = await requireUser(req);
  const { draft } = await loadDraftFor(ctx, params.id, 'read');

  const [timezone, rate, frozen] = await Promise.all([
    timezoneOf(draft.user_id),
    hitRate(ctx.db, draft.user_id, draft.workspace_id),
    ctx.db.from('predictions').select('expected, low, high, basis_count, actual, landed, evaluated_at, created_at').eq('draft_id', draft.id).maybeSingle(),
  ]);

  if (draft.status === 'posted' && frozen.data) {
    const record = frozen.data;
    return NextResponse.json({
      prediction: { expected: Number(record.expected), low: Number(record.low), high: Number(record.high), basisCount: record.basis_count },
      label: describeRange({ expected: Number(record.expected), low: Number(record.low), high: Number(record.high) }),
      actual: record.actual === null ? null : Number(record.actual),
      landed: record.landed,
      hitRate: rate,
      minBasis: MIN_BASIS,
    });
  }

  const prediction = await predictDraft(ctx.db, draft, timezone);
  return NextResponse.json({ prediction, label: prediction ? describeRange(prediction) : null, actual: null, landed: null, hitRate: rate, minBasis: MIN_BASIS });
});
