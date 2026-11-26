/**
 * app/api/cron/ops-health/route.ts
 *
 * GET, every 5 minutes from pg_cron with "Authorization: Bearer <CRON_SECRET>".
 * Checks every service Forge depends on, stores the results for /admin/ops,
 * emails ADMIN_EMAILS if something is badly wrong (at most every 30
 * minutes), and deletes monitoring rows past their retention.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { requireCron } from '@/lib/forge/cron';
import { route } from '@/lib/forge/http';
import { consumeLimit } from '@/lib/forge/limits';
import { alertReasons, pruneOpsEvents, runHealthChecks, sendAlert } from '@/lib/ops/health';

export const GET = route('api/cron/ops-health', async (req: Request) => {
  requireCron(req);
  const results = await runHealthChecks();

  let alerted = false;
  const reasons = await alertReasons(results).catch(() => [] as string[]);
  if (reasons.length > 0) {
    const slot = await consumeLimit('ops:alert-email', 1, 30 * 60);
    if (slot.allowed) alerted = await sendAlert(reasons);
  }

  // Pruning once an hour is plenty.
  if (new Date().getMinutes() < 5) await pruneOpsEvents().catch(() => undefined);

  return NextResponse.json({ checked: results.length, problems: reasons, alerted, results });
});
