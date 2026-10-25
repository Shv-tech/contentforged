/**
 * lib/forge/playbook.ts
 *
 * The outcome loop's analysis: what works for this person, measured from
 * their own posted drafts and the results pulled back for them.
 *
 * STATISTICAL HONESTY
 *
 * A creator has tens of posts, not thousands, so every comparison here is
 * small-sample. Three rules keep the findings from lying:
 *
 *   1. Minimum support. A bucket needs MIN_SUPPORT posts on each side of the
 *      comparison before it can produce a finding at all.
 *   2. Medians, not means. One viral post must not make "posts on Tuesdays"
 *      look like a strategy.
 *   3. Normalised within platform. A LinkedIn post and an X post are never
 *      compared on raw numbers; each post is scored against the median of
 *      the user's own posts on the same platform.
 *
 * Findings report the sample sizes they rest on, so the user can weigh them.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyHook, HOOK_TYPE_LABELS, type HookType } from './hooks';
import type { DraftPlatform, DraftRecord, PostMetrics } from './types';
import { scopeRows } from './data/workspace';
import { DRAFT_COLUMNS, draftText } from './data/drafts';

export const MIN_SUPPORT = 3;
const MEANINGFUL_LIFT = 1.5;

export interface PostedPost {
  draft: DraftRecord;
  metrics: PostMetrics | null;
}

export interface ScoredPost {
  draft: DraftRecord;
  metrics: PostMetrics;
  engagement: number;
  /** engagement divided by the median engagement on the same platform. */
  relative: number;
  /** 0 to 1 rank within the same platform. */
  percentile: number;
}

export interface Finding {
  id: string;
  dimension: string;
  bucket: string;
  lift: number;
  inCount: number;
  outCount: number;
  text: string;
  direction: 'better' | 'worse';
}

export interface Calibration {
  pairs: number;
  /** Spearman rank correlation between grade score and actual percentile. */
  correlation: number | null;
  note: string | null;
}

export interface Playbook {
  postedCount: number;
  measuredCount: number;
  totals: { impressions: number; likes: number; replies: number; reposts: number };
  findings: Finding[];
  calibration: Calibration;
  scored: ScoredPost[];
}

// ============================================================================
// LOADING
// ============================================================================

const CHECKPOINT_PRIORITY: Record<string, number> = { '7d': 4, '24h': 3, manual: 2, '1h': 1 };

export async function loadPostedPosts(db: SupabaseClient, userId: string, workspaceId: string | null, limit = 400): Promise<PostedPost[]> {
  const draftsQuery = db.from('drafts').select(DRAFT_COLUMNS).eq('status', 'posted');
  const { data: drafts, error } = await scopeRows(draftsQuery, userId, workspaceId).order('posted_at', { ascending: false }).limit(limit);
  if (error) throw new Error(`Could not load posted drafts: ${error.message}`);
  if (!drafts || drafts.length === 0) return [];

  const ids = drafts.map((d: { id: string }) => d.id);
  const { data: metrics } = await db
    .from('post_metrics')
    .select('id, draft_id, platform, checkpoint, impressions, likes, replies, reposts, quotes, bookmarks, clicks, followers_gained, source, captured_at')
    .in('draft_id', ids);

  const best = new Map<string, PostMetrics>();
  for (const row of (metrics ?? []) as PostMetrics[]) {
    const current = best.get(row.draft_id);
    if (!current || (CHECKPOINT_PRIORITY[row.checkpoint] ?? 0) > (CHECKPOINT_PRIORITY[current.checkpoint] ?? 0)) {
      best.set(row.draft_id, row);
    }
  }

  return (drafts as DraftRecord[]).map((draft) => ({ draft, metrics: best.get(draft.id) ?? null }));
}

// ============================================================================
// SCORING
// ============================================================================

/**
 * Weighted engagement. Replies and reposts are weighted above likes because
 * they cost the reader more effort and carry the post further.
 */
export function engagementOf(m: PostMetrics): number {
  return (m.likes ?? 0) + 2 * (m.replies ?? 0) + 3 * ((m.reposts ?? 0) + (m.quotes ?? 0)) + (m.bookmarks ?? 0);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function scorePosts(posts: PostedPost[]): ScoredPost[] {
  const measured = posts.filter((p): p is { draft: DraftRecord; metrics: PostMetrics } => p.metrics !== null);
  const byPlatform = new Map<DraftPlatform, typeof measured>();
  for (const post of measured) {
    const list = byPlatform.get(post.draft.platform) ?? [];
    list.push(post);
    byPlatform.set(post.draft.platform, list);
  }

  const scored: ScoredPost[] = [];
  for (const list of byPlatform.values()) {
    const values = list.map((p) => engagementOf(p.metrics));
    const mid = Math.max(median(values), 1);
    const sorted = [...values].sort((a, b) => a - b);
    for (const post of list) {
      const engagement = engagementOf(post.metrics);
      const rank = sorted.filter((v) => v < engagement).length + sorted.filter((v) => v === engagement).length / 2;
      scored.push({
        draft: post.draft,
        metrics: post.metrics,
        engagement,
        relative: engagement / mid,
        percentile: list.length > 1 ? rank / list.length : 0.5,
      });
    }
  }
  return scored;
}

// ============================================================================
// FEATURES
// ============================================================================

export interface Dimension {
  id: string;
  label: string;
  bucketOf: (post: ScoredPost) => string | null;
  describe: (bucket: string) => string;
}

function localHour(iso: string | null, timeZone: string): number | null {
  if (!iso) return null;
  try {
    const hour = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(new Date(iso));
    return Number(hour);
  } catch {
    return new Date(iso).getUTCHours();
  }
}

export function dimensionsFor(timeZone: string): Dimension[] {
  return [
    {
      id: 'hook',
      label: 'Opening',
      bucketOf: (post) => classifyHook(draftText(post.draft)),
      describe: (bucket) => `${HOOK_TYPE_LABELS[bucket as HookType]} openings`,
    },
    {
      id: 'length',
      label: 'Length',
      bucketOf: (post) => {
        const n = draftText(post.draft).length;
        if (n < 280) return 'short';
        if (n < 700) return 'medium';
        if (n < 1300) return 'long';
        return 'very_long';
      },
      describe: (bucket) =>
        ({
          short: 'Posts under 280 characters',
          medium: 'Posts of 280 to 700 characters',
          long: 'Posts of 700 to 1,300 characters',
          very_long: 'Posts over 1,300 characters',
        })[bucket] ?? bucket,
    },
    {
      id: 'format',
      label: 'Format',
      bucketOf: (post) => post.draft.kind,
      describe: (bucket) => ({ post: 'Single posts', thread: 'Threads', carousel: 'Carousels' })[bucket] ?? bucket,
    },
    {
      id: 'ending',
      label: 'Ending',
      bucketOf: (post) => (/\?\s*$/.test(draftText(post.draft).trim()) ? 'question' : 'statement'),
      describe: (bucket) => (bucket === 'question' ? 'Posts that end with a question' : 'Posts that end on a statement'),
    },
    {
      id: 'link',
      label: 'Links',
      bucketOf: (post) => (/https?:\/\//.test(draftText(post.draft)) ? 'link' : 'no_link'),
      describe: (bucket) => (bucket === 'link' ? 'Posts with a link in them' : 'Posts without a link'),
    },
    {
      id: 'daypart',
      label: 'Time of day',
      bucketOf: (post) => {
        const hour = localHour(post.draft.posted_at, timeZone);
        if (hour === null) return null;
        if (hour < 6) return 'night';
        if (hour < 12) return 'morning';
        if (hour < 18) return 'afternoon';
        return 'evening';
      },
      describe: (bucket) => (bucket === 'night' ? 'Posts published at night' : `Posts published in the ${bucket}`),
    },
  ];
}

function formatLift(lift: number): string {
  return lift >= 10 ? `${Math.round(lift)}x` : `${lift.toFixed(1)}x`;
}

export function findPatterns(scored: ScoredPost[], timeZone = 'UTC'): Finding[] {
  const findings: Finding[] = [];

  for (const dimension of dimensionsFor(timeZone)) {
    const buckets = new Map<string, ScoredPost[]>();
    for (const post of scored) {
      const bucket = dimension.bucketOf(post);
      if (!bucket) continue;
      const list = buckets.get(bucket) ?? [];
      list.push(post);
      buckets.set(bucket, list);
    }

    for (const [bucket, inside] of buckets) {
      const outside = scored.filter((post) => dimension.bucketOf(post) !== bucket && dimension.bucketOf(post) !== null);
      if (inside.length < MIN_SUPPORT || outside.length < MIN_SUPPORT) continue;

      const insideMedian = median(inside.map((p) => p.relative));
      const outsideMedian = Math.max(median(outside.map((p) => p.relative)), 0.01);
      const lift = insideMedian / outsideMedian;

      if (lift >= MEANINGFUL_LIFT || lift <= 1 / MEANINGFUL_LIFT) {
        const better = lift >= 1;
        const shown = better ? lift : 1 / lift;
        const subject = dimension.describe(bucket);
        findings.push({
          id: `${dimension.id}:${bucket}`,
          dimension: dimension.label,
          bucket,
          lift,
          inCount: inside.length,
          outCount: outside.length,
          direction: better ? 'better' : 'worse',
          text: better
            ? `${subject} get ${formatLift(shown)} the engagement of your other posts (${inside.length} vs ${outside.length} posts).`
            : `${subject} get ${formatLift(shown)} less engagement than your other posts (${inside.length} vs ${outside.length} posts).`,
        });
      }
    }
  }

  return findings.sort((a, b) => Math.abs(Math.log(b.lift)) - Math.abs(Math.log(a.lift))).slice(0, 8);
}

// ============================================================================
// GRADER CALIBRATION
// ============================================================================

function ranks(values: number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].value === indexed[i].value) j++;
    const averageRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) result[indexed[k].index] = averageRank;
    i = j + 1;
  }
  return result;
}

function spearman(x: number[], y: number[]): number | null {
  if (x.length < 3) return null;
  const rx = ranks(x);
  const ry = ranks(y);
  const n = x.length;
  const mean = (n + 1) / 2;
  let numerator = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    numerator += (rx[i] - mean) * (ry[i] - mean);
    dx += (rx[i] - mean) ** 2;
    dy += (ry[i] - mean) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return numerator / Math.sqrt(dx * dy);
}

export function calibrate(scored: ScoredPost[]): Calibration {
  const pairs = scored.filter((p) => p.draft.grade !== null);
  if (pairs.length < 6) {
    return { pairs: pairs.length, correlation: null, note: null };
  }

  const correlation = spearman(
    pairs.map((p) => p.draft.grade!.score),
    pairs.map((p) => p.percentile)
  );

  const highGraded = pairs.filter((p) => p.draft.grade!.score >= 40);
  const topHalf = highGraded.filter((p) => p.percentile >= 0.5).length;

  let note: string | null = null;
  if (correlation !== null) {
    if (correlation >= 0.4) {
      note = `For this author the grade has tracked results well (rank correlation ${correlation.toFixed(2)} over ${pairs.length} posts). Trust high scores.`;
    } else if (correlation <= 0.1) {
      note = `For this author the grade has not predicted results (rank correlation ${correlation.toFixed(2)} over ${pairs.length} posts). Weight specificity and what their Playbook says above general hook theory.`;
    } else {
      note = `For this author the grade tracks results loosely (rank correlation ${correlation.toFixed(2)} over ${pairs.length} posts).`;
    }
  }
  if (highGraded.length >= 3 && note) {
    note += ` ${topHalf} of ${highGraded.length} posts graded 40+ landed in their top half.`;
  }

  return { pairs: pairs.length, correlation, note };
}

/** Where a grade of `score` would place among this author's past posts. */
export function predictedPercentile(scored: ScoredPost[], score: number): number | null {
  const graded = scored.filter((p) => p.draft.grade !== null);
  if (graded.length < 6) return null;
  const below = graded.filter((p) => p.draft.grade!.score < score).length;
  return below / graded.length;
}

// ============================================================================
// ASSEMBLY
// ============================================================================

export function computePlaybook(posts: PostedPost[], timeZone = 'UTC'): Playbook {
  const scored = scorePosts(posts);
  const totals = scored.reduce(
    (acc, p) => ({
      impressions: acc.impressions + (p.metrics.impressions ?? 0),
      likes: acc.likes + (p.metrics.likes ?? 0),
      replies: acc.replies + (p.metrics.replies ?? 0),
      reposts: acc.reposts + (p.metrics.reposts ?? 0) + (p.metrics.quotes ?? 0),
    }),
    { impressions: 0, likes: 0, replies: 0, reposts: 0 }
  );

  return {
    postedCount: posts.length,
    measuredCount: scored.length,
    totals,
    findings: findPatterns(scored, timeZone),
    calibration: calibrate(scored),
    scored,
  };
}

/** Findings phrased for the system prompt. Only "better" findings steer. */
export function playbookPromptLines(playbook: Playbook): string[] {
  const lines = playbook.findings.slice(0, 5).map((finding) => finding.text);
  if (playbook.calibration.note) lines.push(playbook.calibration.note);
  return lines;
}
