/**
 * app/api/goals/endpoints/[id]/route.ts
 *
 * DELETE  remove a webhook endpoint. Events already recorded stay.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { brandRequest } from '@/lib/forge/brand-request';
import { removeEndpoint } from '@/lib/forge/goals';
import { HttpError, isUuid, route } from '@/lib/forge/http';

export const DELETE = route('api/goals/endpoints/[id]', async (req: Request, { params }: { params: { id: string } }) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Endpoint not found.');
  const { ctx, workspaceId } = await brandRequest(req, { write: true });
  await removeEndpoint(ctx.userId, workspaceId, params.id);
  return NextResponse.json({ deleted: true });
});
