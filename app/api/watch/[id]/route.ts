/**
 * app/api/watch/[id]/route.ts
 *
 * DELETE  stop watching an account
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { HttpError, isUuid, requireUser, route } from '@/lib/forge/http';

export const DELETE = route('api/watch/[id]:delete', async (req: Request, { params }: { params: { id: string } }) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Not found.');
  const ctx = await requireUser(req);
  const { error } = await ctx.db.from('watch_accounts').delete().eq('id', params.id).eq('user_id', ctx.userId);
  if (error) throw new Error(error.message);
  return NextResponse.json({ deleted: true });
});
