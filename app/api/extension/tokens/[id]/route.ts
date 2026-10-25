/**
 * app/api/extension/tokens/[id]/route.ts
 *
 * DELETE  revoke a token. Requests carrying it fail from the next call.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { HttpError, isUuid, requireUser, route } from '@/lib/forge/http';

export const DELETE = route('api/extension/tokens/[id]', async (req: Request, { params }: { params: { id: string } }) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Token not found.');
  const ctx = await requireUser(req);
  if (ctx.via !== 'session') throw new HttpError(403, 'Revoke tokens from the Forge website.');
  const { error } = await ctx.db.from('extension_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', params.id).eq('user_id', ctx.userId).eq('kind', 'extension');
  if (error) throw new Error(error.message);
  return NextResponse.json({ revoked: true });
});
