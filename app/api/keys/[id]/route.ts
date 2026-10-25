/**
 * app/api/keys/[id]/route.ts
 *
 * DELETE  revoke an API key. Requests with it fail from this moment.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { revokeApiKey } from '@/lib/forge/api-keys';
import { HttpError, isUuid, requireUser, route } from '@/lib/forge/http';

export const DELETE = route('api/keys/[id]', async (req: Request, { params }: { params: { id: string } }) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Key not found.');
  const ctx = await requireUser(req);
  if (ctx.via !== 'session') throw new HttpError(403, 'Manage API keys from the app.');
  await revokeApiKey(ctx.userId, params.id);
  return NextResponse.json({ revoked: true });
});
