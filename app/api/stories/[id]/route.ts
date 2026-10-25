/**
 * app/api/stories/[id]/route.ts
 *
 * PATCH   edit a story
 * DELETE  remove it (also the Undo on a "Saved to Story Bank" chip)
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { STORY_KINDS } from '@/lib/forge/data/stories';
import { HttpError, isUuid, parseJson, requireUser, route } from '@/lib/forge/http';
import { assertRowWritable } from '@/lib/forge/data/workspace';

type Params = { params: { id: string } };

const PatchSchema = z
  .object({
    kind: z.enum(STORY_KINDS as [string, ...string[]]).optional(),
    title: z.string().trim().min(1).max(140).optional(),
    body: z.string().trim().min(1).max(4000).optional(),
    occurred_on: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    tags: z.array(z.string().max(32)).max(8).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update.');

export const PATCH = route('api/stories/[id]:patch', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Story not found.');
  const ctx = await requireUser(req);
  const patch = await parseJson(req, PatchSchema);
  await assertRowWritable(ctx.db, ctx.userId, 'story_items', params.id, 'Story not found.');
  const { data, error } = await ctx.db.from('story_items').update(patch).eq('id', params.id).select('*').single();
  if (error || !data) throw new HttpError(404, 'Story not found.');
  return NextResponse.json({ story: data });
});

export const DELETE = route('api/stories/[id]:delete', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Story not found.');
  const ctx = await requireUser(req);
  await assertRowWritable(ctx.db, ctx.userId, 'story_items', params.id, 'Story not found.');
  const { error } = await ctx.db.from('story_items').delete().eq('id', params.id);
  if (error) throw new HttpError(500, 'Could not remove the story.');
  return NextResponse.json({ deleted: true });
});
