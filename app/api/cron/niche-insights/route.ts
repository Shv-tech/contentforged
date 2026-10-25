/**
 * app/api/cron/niche-insights/route.ts
 *
 * Daily: recomputes anonymous niche signals and shared-format results from
 * opted-in creators. See lib/forge/niche-insights.ts for the privacy model.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { requireCron } from '@/lib/forge/cron';
import { computeFormatStats } from '@/lib/forge/formats';
import { route } from '@/lib/forge/http';
import { computeNicheSignals } from '@/lib/forge/niche-insights';
import { createServiceClient } from '@/lib/supabase/service';

export const GET = route('api/cron/niche-insights', async (req: Request) => {
  requireCron(req);
  const db = createServiceClient();
  const [signals, formats] = await Promise.all([computeNicheSignals(db), computeFormatStats(db)]);
  return NextResponse.json({ ...signals, formatStats: formats.formats });
});
