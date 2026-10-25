/**
 * lib/forge/weekly-plan.ts
 *
 * The weekly plan: once a week, at the hour the person chose, Forge writes
 * the week's drafts from the idea queue, grades them, checks them against
 * the voice, places each at one of the person's best times, and sends one
 * notification. Review takes about ten minutes: approve, edit or skip.
 *
 * Nothing is posted or scheduled until a draft is approved. An approved
 * draft is scheduled at its suggested slot and, for LinkedIn, Threads and
 * Bluesky with automatic publishing on, goes out by itself; X drafts get a
 * reminder and the extension's fill button.
 *
 * COST
 *
 * Each draft is one writing call and one grading call, charged to the
 * person's own allowance like anything else they ask for. When the
 * allowance runs out mid-plan the plan keeps what it has and says why.
 * Plans pause after two in a row go unreviewed, so an abandoned account
 * stops spending.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { gradeOpening } from './grader';
import { createDraft, DRAFT_COLUMNS } from './data/drafts';
import { markStoriesUsed, STORY_COLUMNS } from './data/stories';
import { scopeRows, type WorkspaceRef } from './data/workspace';
import { recordVersion } from './data/collab';
import { suggestSlots, zonedTimeToUtc } from './best-times';
import { track } from './events';
import { armFor, nextArm, runningExperiment, type ExperimentRecord } from './experiments';
import { HttpError } from './http';
import { createIdea, listIdeas, refreshIdeaQueue, storiesForIdea, type IdeaRecord } from './ideas';
import { estimateTokens, metered } from './metered';
import { notifyPlanReady } from './notify';
import { computePlaybook, loadPostedPosts, type ScoredPost } from './playbook';
import { firstLine, truncate } from './text';
import { DRAFT_PLATFORMS, PLATFORM_NAMES, type DraftKind, type DraftPlatform, type DraftRecord, type StoryItem } from './types';
import { estimateWriteTokens, loadBrandContext, writePost, type BrandContext } from './writer';

// ============================================================================
// SETTINGS
// ============================================================================

export interface PlanSettings {
  enabled: boolean;
  weekly_goal: number;
  platforms: DraftPlatform[];
  delivery_weekday: number;
  delivery_hour: number;
}

export const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  enabled: true,
  weekly_goal: 3,
  platforms: ['linkedin'],
  delivery_weekday: 1,
  delivery_hour: 7,
};

const SETTINGS_COLUMNS = 'enabled, weekly_goal, platforms, delivery_weekday, delivery_hour';

function cleanPlatforms(platforms: unknown): DraftPlatform[] {
  const valid = (Array.isArray(platforms) ? platforms : []).filter((p): p is DraftPlatform => (DRAFT_PLATFORMS as readonly string[]).includes(p as string));
  return valid.length > 0 ? Array.from(new Set(valid)) : ['linkedin'];
}

export async function getPlanSettings(db: SupabaseClient, userId: string, workspaceId: string | null): Promise<PlanSettings> {
  const query = db.from('plan_settings').select(SETTINGS_COLUMNS).eq('user_id', userId);
  const { data } = await (workspaceId ? query.eq('workspace_id', workspaceId) : query.is('workspace_id', null)).maybeSingle();
  if (!data) return DEFAULT_PLAN_SETTINGS;
  return { ...(data as PlanSettings), platforms: cleanPlatforms(data.platforms) };
}

export async function savePlanSettings(db: SupabaseClient, userId: string, workspaceId: string | null, patch: Partial<PlanSettings>): Promise<PlanSettings> {
  const next = { ...(await getPlanSettings(db, userId, workspaceId)), ...patch };
  next.platforms = cleanPlatforms(next.platforms);

  // Select then write: the uniqueness is over an expression PostgREST's
  // on_conflict cannot target.
  const query = db.from('plan_settings').select('id').eq('user_id', userId);
  const { data: existing } = await (workspaceId ? query.eq('workspace_id', workspaceId) : query.is('workspace_id', null)).maybeSingle();
  const { error } = existing
    ? await db.from('plan_settings').update(next).eq('id', existing.id)
    : await db.from('plan_settings').insert({ user_id: userId, workspace_id: workspaceId, ...next });
  if (error) throw new Error(`Could not save plan settings: ${error.message}`);
  return next;
}

// ============================================================================
// WHEN
// ============================================================================

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  weekday: number;
}

export function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
  };
}

/** The local calendar date of the most recent delivery day, as YYYY-MM-DD. */
export function weekStartFor(now: Date, timeZone: string, deliveryWeekday: number): string {
  const today = localParts(now, timeZone);
  const back = (today.weekday - deliveryWeekday + 7) % 7;
  const start = new Date(Date.UTC(today.year, today.month - 1, today.day - back));
  return start.toISOString().slice(0, 10);
}

/** The instant this week's plan becomes due: the delivery day at the delivery hour, local time. */
export function dueAt(now: Date, timeZone: string, settings: Pick<PlanSettings, 'delivery_weekday' | 'delivery_hour'>): Date {
  const [year, month, day] = weekStartFor(now, timeZone, settings.delivery_weekday).split('-').map(Number);
  return zonedTimeToUtc(year, month, day, settings.delivery_hour, timeZone);
}

// ============================================================================
// READING A PLAN
// ============================================================================

export interface PlanRecord {
  id: string;
  user_id: string;
  workspace_id: string | null;
  week_start: string;
  status: 'generating' | 'ready' | 'failed';
  error: string | null;
  draft_count: number;
  experiment_id: string | null;
  notified_at: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const PLAN_COLUMNS = 'id, user_id, workspace_id, week_start, status, error, draft_count, experiment_id, notified_at, reviewed_at, created_at';

export async function latestPlan(db: SupabaseClient, userId: string, workspaceId: string | null): Promise<{ plan: PlanRecord | null; drafts: DraftRecord[] }> {
  const query = db.from('weekly_plans').select(PLAN_COLUMNS).eq('user_id', userId);
  const { data: plan } = await (workspaceId ? query.eq('workspace_id', workspaceId) : query.is('workspace_id', null))
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return { plan: null, drafts: [] };

  const { data: drafts } = await db.from('drafts').select(DRAFT_COLUMNS).eq('plan_id', plan.id).neq('status', 'archived').order('suggested_for', { ascending: true });
  return { plan: plan as PlanRecord, drafts: (drafts ?? []) as DraftRecord[] };
}

/** Marks the plan reviewed once every draft in it has been approved or skipped. */
export async function markReviewedIfDone(db: SupabaseClient, planId: string): Promise<void> {
  const { data } = await db.from('drafts').select('review_status').eq('plan_id', planId).neq('status', 'archived');
  const rows = (data ?? []) as Array<{ review_status: string | null }>;
  if (rows.length > 0 && rows.every((row) => row.review_status === 'approved' || row.review_status === 'skipped')) {
    await db.from('weekly_plans').update({ reviewed_at: new Date().toISOString() }).eq('id', planId).is('reviewed_at', null);
  }
}

// ============================================================================
// BUILDING A PLAN
// ============================================================================

const WRITE_CONCURRENCY = 3;

async function pool<T, R>(items: T[], limit: number, run: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Ideas to write this week, topped up from the Story Bank when the queue is short. */
async function chooseIdeas(db: SupabaseClient, userId: string, workspaceId: string | null, count: number): Promise<IdeaRecord[]> {
  const open = await listIdeas(db, userId, workspaceId, 'open', count * 3);

  // Variety: no more than two from one source in a week.
  const chosen: IdeaRecord[] = [];
  const perSource = new Map<string, number>();
  for (const idea of open) {
    if (chosen.length >= count) break;
    const used = perSource.get(idea.source) ?? 0;
    if (used >= 2 && open.length > count) continue;
    chosen.push(idea);
    perSource.set(idea.source, used + 1);
  }
  if (chosen.length >= count) return chosen;

  // The Story Bank: entries written about least, most recent first.
  const query = db.from('story_items').select(STORY_COLUMNS);
  const { data } = await scopeRows(query, userId, workspaceId).order('use_count', { ascending: true }).order('updated_at', { ascending: false }).limit(count * 2);
  for (const story of (data ?? []) as StoryItem[]) {
    if (chosen.length >= count) break;
    const idea = await createIdea(db, userId, workspaceId, {
      source: 'story',
      angle: story.kind === 'opinion' ? `Why I believe this: ${story.title}` : `What happened: ${story.title}, and what it taught me`,
      rationale: 'From your Story Bank, not written about yet.',
      storyIds: [story.id],
    });
    chosen.push(idea);
  }
  return chosen;
}

/** A slot for each draft, spread across the week, at the person's best times. */
function slotFor(options: {
  platform: DraftPlatform;
  index: number;
  total: number;
  timeZone: string;
  scored: ScoredPost[];
  taken: string[];
  start: Date;
  daypart: 'morning' | 'evening' | null;
}): string {
  const spacingDays = 6 / Math.max(options.total, 1);
  const from = new Date(options.start.getTime() + options.index * spacingDays * 86_400_000);
  const suggestions = suggestSlots({ platform: options.platform, timeZone: options.timeZone, scored: options.scored, taken: options.taken, now: from });

  const hourOf = (iso: string) => localParts(new Date(iso), options.timeZone).hour;
  if (options.daypart) {
    const match = suggestions.find((slot) => (options.daypart === 'morning' ? hourOf(slot.at) < 12 : hourOf(slot.at) >= 17));
    if (match) return match.at;
    const day = localParts(new Date(from.getTime() + 86_400_000), options.timeZone);
    return zonedTimeToUtc(day.year, day.month, day.day, options.daypart === 'morning' ? 9 : 19, options.timeZone).toISOString();
  }
  return suggestions[0]?.at ?? new Date(from.getTime() + 86_400_000).toISOString();
}

export interface BuildResult {
  plan: PlanRecord;
  drafts: DraftRecord[];
  note: string | null;
}

export async function buildWeeklyPlan(input: {
  db: SupabaseClient;
  userId: string;
  workspace: WorkspaceRef | null;
  settings: PlanSettings;
  timezone: string;
  trigger: 'cron' | 'manual';
  now?: Date;
}): Promise<BuildResult> {
  const { db, userId, workspace, settings, timezone } = input;
  const workspaceId = workspace?.id ?? null;
  const now = input.now ?? new Date();
  const weekStart = weekStartFor(now, timezone, settings.delivery_weekday);

  // One plan per brand per week. A manual run tops an existing plan up.
  let plan: PlanRecord;
  const inserted = await db.from('weekly_plans').insert({ user_id: userId, workspace_id: workspaceId, week_start: weekStart }).select(PLAN_COLUMNS).single();
  if (inserted.error) {
    if (inserted.error.code !== '23505') throw new Error(`Could not start the plan: ${inserted.error.message}`);
    const query = db.from('weekly_plans').select(PLAN_COLUMNS).eq('user_id', userId).eq('week_start', weekStart);
    const { data } = await (workspaceId ? query.eq('workspace_id', workspaceId) : query.is('workspace_id', null)).single();
    plan = data as PlanRecord;
    if (input.trigger === 'cron') return { plan, drafts: [], note: null };
  } else {
    plan = inserted.data as PlanRecord;
  }

  const { data: existingDrafts } = await db.from('drafts').select('id, review_status').eq('plan_id', plan.id).neq('status', 'archived');
  const live = ((existingDrafts ?? []) as Array<{ review_status: string | null }>).filter((d) => d.review_status !== 'skipped').length;
  const needed = Math.max(0, settings.weekly_goal - live);

  let note: string | null = null;
  const created: DraftRecord[] = [];

  try {
    if (needed > 0) {
      const context = await loadBrandContext(db, userId, workspace);
      await refreshIdeaQueue(db, userId, workspace, timezone).catch((error) => console.warn('[forge/plan] idea refresh failed:', error));
      const ideas = await chooseIdeas(db, userId, workspaceId, needed);

      if (ideas.length === 0) {
        note = 'There was nothing new to write from. Capture a voice note or forward an email, and the next plan writes itself from it.';
      } else {
        const experiment = await runningExperiment(db, userId, workspaceId);
        const posts = await loadPostedPosts(db, userId, workspaceId, 300).catch(() => []);
        const { scored } = computePlaybook(posts, timezone);
        const scheduledQuery = db.from('drafts').select('scheduled_for').eq('status', 'scheduled');
        const { data: scheduled } = await scopeRows(scheduledQuery, userId, workspaceId);
        const taken = ((scheduled ?? []) as Array<{ scheduled_for: string | null }>).map((d) => d.scheduled_for).filter((v): v is string => Boolean(v));

        const firstArm = experiment ? await nextArm(db, experiment) : 'a';
        const platforms = settings.platforms;

        const plans = ideas.map((idea, index) => {
          const arm: 'a' | 'b' | null = experiment ? ((index % 2 === 0 ? firstArm : firstArm === 'a' ? 'b' : 'a') as 'a' | 'b') : null;
          const platform = idea.platform && platforms.includes(idea.platform) ? idea.platform : platforms[index % platforms.length];
          const armDetail = experiment && arm ? armFor(experiment, arm) : null;
          const daypart = experiment?.variable === 'daypart' && armDetail ? (armDetail.key as 'morning' | 'evening') : null;
          const kind: DraftKind = experiment?.variable === 'format' && armDetail?.key === 'carousel' ? 'carousel' : 'post';
          const slot = slotFor({ platform, index, total: ideas.length, timeZone: timezone, scored, taken, start: now, daypart });
          taken.push(slot);
          return { idea, arm, platform, kind, slot, instruction: armDetail?.instruction || null };
        });

        let quotaHit = false;
        const results = await pool(plans, WRITE_CONCURRENCY, async (item) => {
          if (quotaHit) return null;
          try {
            return await writePlannedDraft({ db, context, userId, workspaceId, planId: plan.id, experiment, ...item });
          } catch (error) {
            if (error instanceof HttpError && error.status === 429) {
              quotaHit = true;
              return null;
            }
            console.error('[forge/plan] a draft failed:', error);
            return null;
          }
        });

        created.push(...results.filter((d): d is DraftRecord => d !== null));
        if (quotaHit) note = `Your plan's allowance ran out after ${created.length} of ${ideas.length} drafts. The rest will be written when it resets, or after an upgrade.`;
        else if (created.length < ideas.length) note = `${ideas.length - created.length} draft${ideas.length - created.length === 1 ? '' : 's'} could not be written this time.`;
      }
    }

    const { data: finished } = await db
      .from('weekly_plans')
      .update({ status: 'ready', error: note, draft_count: live + created.length, experiment_id: plan.experiment_id ?? null })
      .eq('id', plan.id)
      .select(PLAN_COLUMNS)
      .single();
    plan = (finished as PlanRecord) ?? plan;
  } catch (error) {
    console.error('[forge/plan] plan failed:', error);
    await db.from('weekly_plans').update({ status: 'failed', error: 'The plan could not be written this time. Try "Plan my week" again.' }).eq('id', plan.id);
    throw error;
  }

  await track(userId, 'plan.generated', { drafts: created.length, trigger: input.trigger, workspace: Boolean(workspaceId) });

  if (input.trigger === 'cron' && !plan.notified_at) {
    await notifyPlanReady({
      userId,
      brandName: workspace?.name ?? null,
      note,
      drafts: created.map((draft) => ({
        platform: PLATFORM_NAMES[draft.platform],
        title: draft.title ?? '',
        opening: truncate(firstLine(draft.body), 180),
        slot: draft.suggested_for
          ? new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(draft.suggested_for))
          : null,
      })),
    });
    await db.from('weekly_plans').update({ notified_at: new Date().toISOString() }).eq('id', plan.id);
  }

  return { plan, drafts: created, note };
}

async function writePlannedDraft(input: {
  db: SupabaseClient;
  context: BrandContext;
  userId: string;
  workspaceId: string | null;
  planId: string;
  experiment: ExperimentRecord | null;
  idea: IdeaRecord;
  arm: 'a' | 'b' | null;
  platform: DraftPlatform;
  kind: DraftKind;
  slot: string;
  instruction: string | null;
}): Promise<DraftRecord> {
  const { db, context, userId, workspaceId, idea } = input;
  const stories = await storiesForIdea(db, userId, workspaceId, idea);
  const request = {
    angle: idea.rationale ? `${idea.angle}\n(Why: ${idea.rationale})` : idea.angle,
    platform: input.platform,
    kind: input.kind,
    stories,
    experiment: input.instruction,
  };

  const written = await metered(
    { userId, route: 'plan:write', maxOutputTokens: 2400, estimatedInputTokens: estimateWriteTokens(context, request) },
    async () => {
      const result = await writePost(context, request);
      return { value: result.draft, usage: result.usage };
    }
  );

  const text = written.segments.length > 0 ? written.segments.join('\n\n') : written.body;
  const grade = await metered({ userId, route: 'plan:grade', maxOutputTokens: 600, estimatedInputTokens: estimateTokens(text) + 900 }, async () => {
    const result = await gradeOpening({ text, platform: input.platform });
    return { value: result.grade, usage: result.usage };
  }).catch(() => null);

  const draft = await createDraft(db, userId, workspaceId, {
    platform: input.platform,
    kind: written.kind,
    body: written.body,
    segments: written.segments,
    title: written.title,
    notes: written.missingFacts.length > 0 ? `Fill in before posting: ${written.missingFacts.join('; ')}.` : null,
    grade,
    planId: input.planId,
    reviewStatus: 'pending',
    ideaId: idea.id,
    captureId: idea.capture_id,
    experimentId: input.experiment?.id ?? null,
    experimentArm: input.arm,
    language: context.language,
    suggestedFor: input.slot,
  });

  await Promise.all([
    db.from('ideas').update({ status: 'planned', draft_id: draft.id }).eq('id', idea.id),
    markStoriesUsed(db, userId, written.storyIdsUsed, workspaceId).catch(() => undefined),
    recordVersion(db, { draft, userId, reason: 'plan' }).catch(() => undefined),
  ]);

  return draft;
}

// ============================================================================
// THE JOB
// ============================================================================

/** True when the last two plans went unreviewed, which pauses automatic plans. */
export async function plansPaused(db: SupabaseClient, userId: string, workspaceId: string | null): Promise<boolean> {
  const query = db.from('weekly_plans').select('reviewed_at, draft_count').eq('user_id', userId);
  const { data } = await (workspaceId ? query.eq('workspace_id', workspaceId) : query.is('workspace_id', null)).order('week_start', { ascending: false }).limit(2);
  const rows = (data ?? []) as Array<{ reviewed_at: string | null; draft_count: number }>;
  return rows.length === 2 && rows.every((row) => !row.reviewed_at && row.draft_count > 0);
}
