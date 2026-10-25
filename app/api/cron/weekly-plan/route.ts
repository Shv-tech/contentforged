/**
 * app/api/cron/weekly-plan/route.ts
 *
 * Hourly: writes the weekly plan for every brand whose delivery time has
 * passed this week and that has no plan yet, then notifies its owner.
 *
 * Catching up rather than firing on the exact hour means a missed run (or a
 * run that hit its time budget) is made up on the next one, the same day.
 * Brands whose last two plans went unreviewed are paused until the person
 * reviews again or asks for a plan by hand.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { requireCron } from '@/lib/forge/cron';
import { loadWorkspace } from '@/lib/forge/data/workspace';
import { WEEKLY_GOAL_MAX } from '@/lib/forge/entitlements';
import { route } from '@/lib/forge/http';
import { resolvePlan } from '@/lib/forge/plan';
import { timezoneOf } from '@/lib/forge/profile';
import { buildWeeklyPlan, dueAt, plansPaused, weekStartFor, type PlanSettings } from '@/lib/forge/weekly-plan';
import { createServiceClient } from '@/lib/supabase/service';

const BUDGET_MS = 260_000;
const MAX_BRANDS = 200;

interface SettingsRow extends PlanSettings {
  user_id: string;
  workspace_id: string | null;
}

export const GET = route('api/cron/weekly-plan', async (req: Request) => {
  requireCron(req);
  const started = Date.now();
  const db = createServiceClient();
  const now = new Date();

  const { data, error } = await db
    .from('plan_settings')
    .select('user_id, workspace_id, enabled, weekly_goal, platforms, delivery_weekday, delivery_hour')
    .eq('enabled', true)
    .order('updated_at', { ascending: true })
    .limit(MAX_BRANDS);
  if (error) throw new Error(error.message);

  let built = 0;
  let skipped = 0;
  for (const row of (data ?? []) as SettingsRow[]) {
    if (Date.now() - started > BUDGET_MS) break;

    const timezone = await timezoneOf(row.user_id);
    if (dueAt(now, timezone, row).getTime() > now.getTime()) continue;

    const weekStart = weekStartFor(now, timezone, row.delivery_weekday);
    const existing = db.from('weekly_plans').select('id').eq('user_id', row.user_id).eq('week_start', weekStart);
    const { data: plan } = await (row.workspace_id ? existing.eq('workspace_id', row.workspace_id) : existing.is('workspace_id', null)).maybeSingle();
    if (plan) continue;

    if (await plansPaused(db, row.user_id, row.workspace_id)) {
      skipped += 1;
      continue;
    }

    const workspace = row.workspace_id ? await loadWorkspace(db, row.user_id, row.workspace_id) : null;
    if (row.workspace_id && !workspace) continue;

    const ownerPlan = await resolvePlan(workspace?.ownerId ?? row.user_id);
    try {
      await buildWeeklyPlan({
        db,
        userId: row.user_id,
        workspace,
        settings: { ...row, weekly_goal: Math.min(row.weekly_goal, WEEKLY_GOAL_MAX[ownerPlan]) },
        timezone,
        trigger: 'cron',
        now,
      });
      built += 1;
    } catch (failure) {
      console.error('[cron/weekly-plan] plan failed for', row.user_id, failure);
    }
  }

  return NextResponse.json({ built, skipped });
});
