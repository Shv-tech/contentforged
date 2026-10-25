/**
 * app/api/formats/[id]/route.ts
 *
 * GET     one format, with its aggregate results when there are enough
 * DELETE  remove a format you published. Drafts already written with it keep it.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getFormat, removeFormat } from '@/lib/forge/formats';
import { HttpError, isUuid, requireUser, route } from '@/lib/forge/http';

type Params = { params: { id: string } };

export const GET = route('api/formats/[id]:get', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Format not found.');
  const ctx = await requireUser(req);
  const format = await getFormat(ctx.db, ctx.userId, params.id);
  if (!format) throw new HttpError(404, 'Format not found.');
  return NextResponse.json({ format });
});

export const DELETE = route('api/formats/[id]:delete', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Format not found.');
  const ctx = await requireUser(req);
  await removeFormat(ctx.userId, params.id);
  return NextResponse.json({ removed: true });
});
