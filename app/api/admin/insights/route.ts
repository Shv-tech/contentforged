/**
 * app/api/admin/insights/route.ts
 *
 * GET ?days=30  aggregate product usage for the internal insights page.
 *     Signed-in people listed in ADMIN_EMAILS only; everyone else gets 404.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser, route } from '@/lib/forge/http';
import { buildInsights, requireAdmin } from '@/lib/forge/insights';

export const GET = route('api/admin/insights', async (req: Request) => {
  const ctx = await requireUser(req);
  requireAdmin(ctx);
  const days = Number.parseInt(new URL(req.url).searchParams.get('days') ?? '30', 10);
  return NextResponse.json(await buildInsights(Number.isFinite(days) ? days : 30));
});
