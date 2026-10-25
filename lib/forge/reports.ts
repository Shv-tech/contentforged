/**
 * lib/forge/reports.ts
 *
 * The monthly client report: what went out for a client, what it did, what
 * it led to, and what is planned next, as a page the client opens without
 * an account. Built from the same results the Playbook uses, so the numbers
 * in front of a client are the numbers the agency sees.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { DRAFT_COLUMNS } from './data/drafts';
import { draftText } from './draft-text';
import { goalSummary } from './goals';
import { computePlaybook, engagementOf, loadPostedPosts } from './playbook';
import { firstLine, truncate } from './text';
import { PLATFORM_NAMES, type DraftRecord } from './types';

export interface ReportPost {
  opening: string;
  platform: string;
  url: string | null;
  postedAt: string | null;
  impressions: number | null;
  engagement: number;
  relative: number;
}

export interface ReportData {
  workspaceName: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  posted: number;
  previousPosted: number;
  byPlatform: Array<{ platform: string; count: number }>;
  totals: { impressions: number; likes: number; replies: number; reposts: number; engagement: number };
  previousEngagement: number;
  topPosts: ReportPost[];
  goals: { bookings: number; signups: number; purchases: number; clicks: number };
  findings: string[];
  upcoming: Array<{ opening: string; platform: string; at: string }>;
  headline: string;
}

export interface ClientReport {
  id: string;
  token: string;
  workspace_id: string;
  period_start: string;
  period_end: string;
  data: ReportData;
  note: string | null;
  created_at: string;
  expires_at: string;
}

export const REPORT_COLUMNS = 'id, token, workspace_id, period_start, period_end, data, note, created_at, expires_at';

/** First and last day of the month containing `date`, as YYYY-MM-DD. */
export function monthBounds(date: Date): { start: string; end: string; label: string } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  };
}

function inPeriod(iso: string | null, start: string, end: string): boolean {
  if (!iso) return false;
  const day = iso.slice(0, 10);
  return day >= start && day <= end;
}

export async function buildReport(db: SupabaseClient, workspace: { id: string; name: string; owner_id: string }, month: Date, timezone: string): Promise<ReportData> {
  const period = monthBounds(month);
  const previous = monthBounds(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 15)));

  const posts = await loadPostedPosts(db, workspace.owner_id, workspace.id, 600);
  const playbook = computePlaybook(posts, timezone);
  const scoredById = new Map(playbook.scored.map((p) => [p.draft.id, p]));

  const thisMonth = posts.filter((p) => inPeriod(p.draft.posted_at, period.start, period.end));
  const lastMonth = posts.filter((p) => inPeriod(p.draft.posted_at, previous.start, previous.end));

  const totals = { impressions: 0, likes: 0, replies: 0, reposts: 0, engagement: 0 };
  for (const post of thisMonth) {
    if (!post.metrics) continue;
    totals.impressions += post.metrics.impressions ?? 0;
    totals.likes += post.metrics.likes ?? 0;
    totals.replies += post.metrics.replies ?? 0;
    totals.reposts += (post.metrics.reposts ?? 0) + (post.metrics.quotes ?? 0);
    totals.engagement += engagementOf(post.metrics);
  }
  const previousEngagement = lastMonth.reduce((sum, p) => sum + (p.metrics ? engagementOf(p.metrics) : 0), 0);

  const byPlatform = Object.entries(
    thisMonth.reduce<Record<string, number>>((acc, p) => {
      acc[p.draft.platform] = (acc[p.draft.platform] ?? 0) + 1;
      return acc;
    }, {})
  )
    .map(([platform, count]) => ({ platform: PLATFORM_NAMES[platform as keyof typeof PLATFORM_NAMES] ?? platform, count }))
    .sort((a, b) => b.count - a.count);

  const topPosts: ReportPost[] = thisMonth
    .filter((p) => p.metrics)
    .map((p) => ({ post: p, scored: scoredById.get(p.draft.id) }))
    .sort((a, b) => (b.scored?.relative ?? 0) - (a.scored?.relative ?? 0))
    .slice(0, 5)
    .map(({ post, scored }) => ({
      opening: truncate(firstLine(draftText(post.draft)), 200),
      platform: PLATFORM_NAMES[post.draft.platform],
      url: post.draft.post_url,
      postedAt: post.draft.posted_at,
      impressions: post.metrics?.impressions ?? null,
      engagement: post.metrics ? engagementOf(post.metrics) : 0,
      relative: Math.round((scored?.relative ?? 1) * 100) / 100,
    }));

  const goals = await goalSummary(db, workspace.owner_id, workspace.id, 400);
  const goalsInPeriod = goals.recent.filter((g) => inPeriod(g.occurred_at, period.start, period.end));
  const draftIdsThisMonth = new Set(thisMonth.map((p) => p.draft.id));
  const clicks = goals.byDraft.filter((d) => draftIdsThisMonth.has(d.draftId)).reduce((sum, d) => sum + d.clicks, 0);

  const nextStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)).toISOString();
  const nextEnd = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 2, 1)).toISOString();
  const { data: scheduled } = await db
    .from('drafts')
    .select(DRAFT_COLUMNS)
    .eq('workspace_id', workspace.id)
    .eq('status', 'scheduled')
    .gte('scheduled_for', nextStart)
    .lt('scheduled_for', nextEnd)
    .order('scheduled_for')
    .limit(12);

  const findings = playbook.findings.filter((f) => f.direction === 'better').slice(0, 3).map((f) => f.text);
  const change = previousEngagement > 0 ? totals.engagement / previousEngagement : null;
  const headline =
    thisMonth.length === 0
      ? `Nothing was published for ${workspace.name} in ${period.label}.`
      : [
          `${thisMonth.length} post${thisMonth.length === 1 ? '' : 's'} went out in ${period.label}`,
          totals.impressions > 0 ? `, seen ${totals.impressions.toLocaleString('en-US')} times` : '',
          change !== null ? `, with engagement ${change >= 1 ? 'up' : 'down'} ${Math.round(Math.abs(change - 1) * 100)}% on the month before` : '',
          goalsInPeriod.length > 0 ? `, and ${goalsInPeriod.length} booking${goalsInPeriod.length === 1 ? '' : 's'} or signup${goalsInPeriod.length === 1 ? '' : 's'} traced to them` : '',
          '.',
        ].join('');

  return {
    workspaceName: workspace.name,
    periodLabel: period.label,
    periodStart: period.start,
    periodEnd: period.end,
    posted: thisMonth.length,
    previousPosted: lastMonth.length,
    byPlatform,
    totals,
    previousEngagement,
    topPosts,
    goals: {
      bookings: goalsInPeriod.filter((g) => g.kind === 'booking').length,
      signups: goalsInPeriod.filter((g) => g.kind === 'signup').length,
      purchases: goalsInPeriod.filter((g) => g.kind === 'purchase').length,
      clicks,
    },
    findings,
    upcoming: ((scheduled ?? []) as DraftRecord[]).map((d) => ({ opening: truncate(firstLine(draftText(d)), 160), platform: PLATFORM_NAMES[d.platform], at: d.scheduled_for! })),
    headline,
  };
}

/** Builds and stores the report for a month, replacing an earlier version of the same month. */
export async function saveReport(workspace: { id: string; name: string; owner_id: string }, actorId: string, month: Date, timezone: string, note: string | null): Promise<ClientReport> {
  const service = createServiceClient();
  const data = await buildReport(service, workspace, month, timezone);
  const { data: row, error } = await service
    .from('client_reports')
    .upsert(
      {
        user_id: actorId,
        workspace_id: workspace.id,
        period_start: data.periodStart,
        period_end: data.periodEnd,
        data,
        note,
        expires_at: new Date(Date.now() + 120 * 86_400_000).toISOString(),
      },
      { onConflict: 'workspace_id,period_start' }
    )
    .select(REPORT_COLUMNS)
    .single();
  if (error || !row) throw new Error(`Could not save the report: ${error?.message ?? 'unknown error'}`);
  return row as ClientReport;
}

export async function reportByToken(token: string): Promise<ClientReport | null> {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const { data } = await createServiceClient().from('client_reports').select(REPORT_COLUMNS).eq('token', token).maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) return null;
  return data as ClientReport;
}
