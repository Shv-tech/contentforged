/**
 * POST /api/admin/ops/check
 * Runs every service health check now, the same as the five-minute job.
 * Admins only.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { requireUser, route } from '@/lib/forge/http';
import { requireAdmin } from '@/lib/forge/insights';
import { runHealthChecks } from '@/lib/ops/health';

export const POST = route('api/admin/ops/check', async (req: Request) => {
  requireAdmin(await requireUser(req));
  return NextResponse.json({ results: await runHealthChecks() });
});
