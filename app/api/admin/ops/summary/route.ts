/**
 * GET /api/admin/ops/summary?window=15m|1h|24h|7d
 * Everything on the /admin/ops dashboard except the live feed. Admins only.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser, route } from '@/lib/forge/http';
import { requireAdmin } from '@/lib/forge/insights';
import { buildOpsSummary } from '@/lib/ops/summary';
import { WINDOWS, type OpsWindow } from '@/lib/ops/types';

export const GET = route('api/admin/ops/summary', async (req: Request) => {
  requireAdmin(await requireUser(req));
  const raw = new URL(req.url).searchParams.get('window') ?? '1h';
  const window = (raw in WINDOWS ? raw : '1h') as OpsWindow;
  return NextResponse.json(await buildOpsSummary(window), { headers: { 'cache-control': 'no-store' } });
});
