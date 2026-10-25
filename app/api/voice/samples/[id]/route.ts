/**
 * app/api/voice/samples/[id]/route.ts
 *
 * DELETE  remove one sample and rebuild the fingerprint without it
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { deleteSample } from '@/lib/forge/data/voice';
import { getActiveWorkspace, requireWrite } from '@/lib/forge/data/workspace';
import { HttpError, isUuid, requireUser, route } from '@/lib/forge/http';

export const DELETE = route('api/voice/samples/[id]', async (req: Request, { params }: { params: { id: string } }) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Sample not found.');
  const ctx = await requireUser(req);
  const workspace = await getActiveWorkspace(ctx.db, ctx.userId);
  requireWrite(workspace);
  const fingerprint = await deleteSample(ctx.db, ctx.userId, workspace?.id ?? null, params.id);
  return NextResponse.json({ fingerprint });
});
