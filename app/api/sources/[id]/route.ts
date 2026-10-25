/**
 * app/api/sources/[id]/route.ts
 *
 * POST    sync now
 * DELETE  disconnect and delete the stored credential
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { brandRequest } from '@/lib/forge/brand-request';
import { disconnectSource, listSources, syncSourceById } from '@/lib/forge/capture/sync';
import { recordAudit } from '@/lib/forge/data/collab';
import { HttpError, isUuid, route } from '@/lib/forge/http';

type Params = { params: { id: string } };

export const POST = route('api/sources/[id]:post', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Source not found.');
  const { ctx, workspaceId } = await brandRequest(req, { write: true, feature: 'sources' });
  const captures = await syncSourceById(ctx.userId, workspaceId, params.id);
  const source = (await listSources(ctx.userId, workspaceId)).find((s) => s.id === params.id) ?? null;
  return NextResponse.json({ source, captures });
});

export const DELETE = route('api/sources/[id]:delete', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Source not found.');
  const { ctx, workspaceId } = await brandRequest(req, { write: true });
  await disconnectSource(ctx.userId, workspaceId, params.id);
  await recordAudit(workspaceId, ctx.userId, 'connection.removed', { type: 'source', id: params.id });
  return NextResponse.json({ deleted: true });
});
