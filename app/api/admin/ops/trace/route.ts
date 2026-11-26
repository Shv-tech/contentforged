/**
 * GET /api/admin/ops/trace?ref=r_ab12cd34ef
 * Everything recorded for one request (or one page-crash digest): the
 * request, the outside services it called, and browser reports. Admins only.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { HttpError, requireUser, route } from '@/lib/forge/http';
import { requireAdmin } from '@/lib/forge/insights';
import { traceRequest } from '@/lib/ops/summary';

export const GET = route('api/admin/ops/trace', async (req: Request) => {
  requireAdmin(await requireUser(req));
  const ref = new URL(req.url).searchParams.get('ref')?.trim();
  if (!ref) throw new HttpError(400, 'Give a reference, for example r_ab12cd34ef.');
  return NextResponse.json({ reference: ref, events: await traceRequest(ref) }, { headers: { 'cache-control': 'no-store' } });
});
