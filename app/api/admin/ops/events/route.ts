/**
 * GET /api/admin/ops/events?level=errors|problems|all&kind=all|request|client|upstream|health
 *     &feature=&q=&before=<id>&limit=50
 * The live feed on /admin/ops, newest first. `q` matches a reference
 * (r_...), a user id, or text in the message, route or path. Admins only.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser, route } from '@/lib/forge/http';
import { requireAdmin } from '@/lib/forge/insights';
import { listOpsEvents, type FeedQuery } from '@/lib/ops/summary';

const LEVELS = ['errors', 'problems', 'all'] as const;
const KINDS = ['all', 'request', 'client', 'upstream', 'health'] as const;

export const GET = route('api/admin/ops/events', async (req: Request) => {
  requireAdmin(await requireUser(req));
  const p = new URL(req.url).searchParams;
  const level = (LEVELS as readonly string[]).includes(p.get('level') ?? '') ? (p.get('level') as FeedQuery['level']) : 'problems';
  const kind = (KINDS as readonly string[]).includes(p.get('kind') ?? '') ? (p.get('kind') as FeedQuery['kind']) : 'all';
  const before = Number.parseInt(p.get('before') ?? '', 10);
  const limit = Number.parseInt(p.get('limit') ?? '50', 10);
  const events = await listOpsEvents({
    level,
    kind,
    feature: p.get('feature')?.slice(0, 80) || null,
    search: p.get('q')?.slice(0, 100) || null,
    before: Number.isFinite(before) ? before : null,
    limit: Number.isFinite(limit) ? limit : 50,
  });
  return NextResponse.json({ events }, { headers: { 'cache-control': 'no-store' } });
});
