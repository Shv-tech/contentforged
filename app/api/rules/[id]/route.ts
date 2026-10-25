/**
 * app/api/rules/[id]/route.ts
 *
 * PATCH   edit a rule's wording
 * DELETE  remove a rule (also the Undo on a "Saved to your rules" chip)
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HttpError, isUuid, parseJson, requireUser, route } from '@/lib/forge/http';
import { assertRowWritable } from '@/lib/forge/data/workspace';

type Params = { params: { id: string } };

const PatchSchema = z.object({ rule: z.string().trim().min(3).max(280) });

export const PATCH = route('api/rules/[id]:patch', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Rule not found.');
  const ctx = await requireUser(req);
  const { rule } = await parseJson(req, PatchSchema);
  await assertRowWritable(ctx.db, ctx.userId, 'learned_rules', params.id, 'Rule not found.');
  const { data, error } = await ctx.db
    .from('learned_rules')
    .update({ rule })
    .eq('id', params.id)
    .select('id, rule, kind, status, source, signal_key, evidence_count, created_at')
    .single();
  if (error || !data) throw new HttpError(404, 'Rule not found.');
  return NextResponse.json({ rule: data });
});

export const DELETE = route('api/rules/[id]:delete', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Rule not found.');
  const ctx = await requireUser(req);
  await assertRowWritable(ctx.db, ctx.userId, 'learned_rules', params.id, 'Rule not found.');
  const { error } = await ctx.db.from('learned_rules').delete().eq('id', params.id);
  if (error) throw new HttpError(500, 'Could not remove the rule.');
  return NextResponse.json({ deleted: true });
});
