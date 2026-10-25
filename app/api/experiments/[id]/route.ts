/**
 * app/api/experiments/[id]/route.ts
 *
 * PATCH { status: 'stopped' }  stop an experiment early. Its result so far
 * is kept; drafts already written keep their arm.
 * POST  recompute the result now, from the latest numbers.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { brandRequest } from '@/lib/forge/brand-request';
import { scopeRows } from '@/lib/forge/data/workspace';
import { EXPERIMENT_COLUMNS, evaluateExperiment } from '@/lib/forge/experiments';
import { HttpError, isUuid, parseJson, route } from '@/lib/forge/http';
import { timezoneOf } from '@/lib/forge/profile';

type Params = { params: { id: string } };

export const PATCH = route('api/experiments/[id]:patch', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Experiment not found.');
  await parseJson(req, z.object({ status: z.literal('stopped') }));
  const { ctx, workspaceId } = await brandRequest(req, { write: true });

  const query = ctx.db.from('experiments').update({ status: 'stopped', completed_at: new Date().toISOString() }).eq('id', params.id).eq('status', 'running');
  const { data, error } = await scopeRows(query, ctx.userId, workspaceId).select(EXPERIMENT_COLUMNS).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HttpError(404, 'No running experiment with that id.');
  return NextResponse.json({ experiment: data });
});

export const POST = route('api/experiments/[id]:post', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Experiment not found.');
  const { ctx, workspaceId } = await brandRequest(req);
  const query = ctx.db.from('experiments').select('id').eq('id', params.id);
  const { data } = await scopeRows(query, ctx.userId, workspaceId).maybeSingle();
  if (!data) throw new HttpError(404, 'Experiment not found.');
  const experiment = await evaluateExperiment(ctx.db, params.id, await timezoneOf(ctx.userId));
  return NextResponse.json({ experiment });
});
