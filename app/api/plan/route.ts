/**
 * app/api/plan/route.ts
 *
 * GET    this week's plan for the active brand: settings, the plan, its
 *        drafts with a prediction for each, and whether plans are paused
 * PATCH  plan settings: on or off, posts a week, platforms, delivery time
 * POST   plan my week now (writes up to the weekly goal, or tops it up)
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { brandRequest } from '@/lib/forge/brand-request';
import { WEEKLY_GOAL_MAX } from '@/lib/forge/entitlements';
import { HttpError, parseJson, route } from '@/lib/forge/http';
import { computePlaybook, loadPostedPosts } from '@/lib/forge/playbook';
import { featuresOf, hitRate, predictFrom } from '@/lib/forge/prediction';
import { resolvePlan } from '@/lib/forge/plan';
import { timezoneOf } from '@/lib/forge/profile';
import { DRAFT_PLATFORMS } from '@/lib/forge/types';
import { buildWeeklyPlan, dueAt, getPlanSettings, latestPlan, plansPaused, savePlanSettings } from '@/lib/forge/weekly-plan';

export const GET = route('api/plan:get', async (req: Request) => {
  const { ctx, workspace, workspaceId } = await brandRequest(req);
  const timezone = await timezoneOf(ctx.userId);

  const [settings, current, paused, posts, rate, ownerPlan] = await Promise.all([
    getPlanSettings(ctx.db, ctx.userId, workspaceId),
    latestPlan(ctx.db, ctx.userId, workspaceId),
    plansPaused(ctx.db, ctx.userId, workspaceId),
    loadPostedPosts(ctx.db, ctx.userId, workspaceId, 300).catch(() => []),
    hitRate(ctx.db, ctx.userId, workspaceId),
    resolvePlan(workspace?.ownerId ?? ctx.userId),
  ]);

  const { scored } = computePlaybook(posts, timezone);
  const predictions = Object.fromEntries(
    current.drafts.map((draft) => [draft.id, predictFrom(scored, draft.platform, featuresOf(draft, timezone), timezone, draft.id)])
  );

  const now = new Date();
  const nextDue = dueAt(now, timezone, settings);
  const upcoming = nextDue.getTime() > now.getTime() ? nextDue : new Date(nextDue.getTime() + 7 * 86_400_000);

  return NextResponse.json({
    settings,
    maxGoal: WEEKLY_GOAL_MAX[ownerPlan],
    timezone,
    plan: current.plan,
    drafts: current.drafts,
    predictions,
    hitRate: rate,
    paused,
    nextPlanAt: upcoming.toISOString(),
  });
});

const SettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    weekly_goal: z.number().int().min(1).max(14).optional(),
    platforms: z.array(z.enum(DRAFT_PLATFORMS)).min(1).max(6).optional(),
    delivery_weekday: z.number().int().min(0).max(6).optional(),
    delivery_hour: z.number().int().min(0).max(23).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update.');

export const PATCH = route('api/plan:patch', async (req: Request) => {
  const patch = await parseJson(req, SettingsSchema);
  const { ctx, workspace, workspaceId } = await brandRequest(req, { write: true, feature: 'weekly_plan' });
  if (patch.weekly_goal !== undefined) {
    const max = WEEKLY_GOAL_MAX[await resolvePlan(workspace?.ownerId ?? ctx.userId)];
    if (patch.weekly_goal > max) throw new HttpError(402, `Your plan includes up to ${max} drafts a week.`, { requiredPlan: 'starter' });
  }
  const settings = await savePlanSettings(ctx.db, ctx.userId, workspaceId, patch);
  return NextResponse.json({ settings });
});

export const POST = route('api/plan:post', async (req: Request) => {
  const { ctx, workspace, workspaceId } = await brandRequest(req, { write: true, feature: 'weekly_plan' });
  const [settings, timezone, ownerPlan] = await Promise.all([getPlanSettings(ctx.db, ctx.userId, workspaceId), timezoneOf(ctx.userId), resolvePlan(workspace?.ownerId ?? ctx.userId)]);

  const result = await buildWeeklyPlan({
    db: ctx.db,
    userId: ctx.userId,
    workspace,
    settings: { ...settings, weekly_goal: Math.min(settings.weekly_goal, WEEKLY_GOAL_MAX[ownerPlan]) },
    timezone,
    trigger: 'manual',
  });
  return NextResponse.json({ plan: result.plan, created: result.drafts.length, note: result.note });
});
