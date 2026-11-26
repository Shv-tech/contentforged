/**
 * app/api/health/route.ts
 *
 * GET: a plain liveness check for outside uptime monitors (UptimeRobot,
 * Better Stack, Vercel checks). Answers 200 when the app runs and the
 * database answers, 503 otherwise. Shows no details: those are on
 * /admin/ops for admins.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET() {
  const started = performance.now();
  let database = false;
  try {
    const { error } = await createServiceClient().from('profiles').select('id', { head: true }).limit(1);
    database = !error;
  } catch {
    database = false;
  }
  const body = { status: database ? 'ok' : 'degraded', database, ms: Math.round(performance.now() - started), time: new Date().toISOString() };
  return NextResponse.json(body, { status: database ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
