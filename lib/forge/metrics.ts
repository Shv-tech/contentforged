/**
 * lib/forge/metrics.ts
 *
 * Pulling a posted draft's results back, and storing them at the 1 hour,
 * 24 hour and 7 day checkpoints the Playbook reads.
 *
 * Where each number comes from:
 *   X         public_metrics through the X API (views included)
 *   Bluesky   the public AppView (no view counts exist on Bluesky)
 *   Threads   the insights edge, with the user's connection
 *   LinkedIn  memberCreatorPostAnalytics, when the app holds
 *             r_member_postAnalytics; otherwise the user adds numbers by
 *             hand or from a screenshot
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getCredential } from './connections';
import type { DraftRecord, MetricCheckpoint, PostMetrics } from './types';
import { blueskyPostStats, blueskyUriFromUrl } from '@/lib/platforms/bluesky';
import { ANALYTICS_SCOPE, linkedInPostStats } from '@/lib/platforms/linkedin';
import { threadsPostStats } from '@/lib/platforms/threads';
import { getPostsByIds, xConfigured } from '@/lib/x/client';

export type MetricValues = Pick<PostMetrics, 'impressions' | 'likes' | 'replies' | 'reposts' | 'quotes' | 'bookmarks' | 'clicks' | 'followers_gained'>;
export type MetricSource = PostMetrics['source'];

export const EMPTY_VALUES: MetricValues = {
  impressions: null,
  likes: null,
  replies: null,
  reposts: null,
  quotes: null,
  bookmarks: null,
  clicks: null,
  followers_gained: null,
};

/** Checkpoints and the window in which each is collected, in hours after posting. */
export const CHECKPOINT_WINDOWS: ReadonlyArray<{ checkpoint: Exclude<MetricCheckpoint, 'manual'>; fromHours: number; toHours: number }> = [
  { checkpoint: '1h', fromHours: 1, toHours: 6 },
  { checkpoint: '24h', fromHours: 24, toHours: 48 },
  { checkpoint: '7d', fromHours: 168, toHours: 240 },
];

export async function recordMetrics(
  db: SupabaseClient,
  userId: string,
  draft: Pick<DraftRecord, 'id' | 'platform'>,
  checkpoint: MetricCheckpoint,
  values: MetricValues,
  source: MetricSource,
  raw: unknown = null
): Promise<PostMetrics> {
  const { data, error } = await db
    .from('post_metrics')
    .upsert(
      {
        user_id: userId,
        draft_id: draft.id,
        platform: draft.platform,
        checkpoint,
        ...values,
        source,
        raw,
        captured_at: new Date().toISOString(),
      },
      { onConflict: 'draft_id,checkpoint' }
    )
    .select('id, draft_id, platform, checkpoint, impressions, likes, replies, reposts, quotes, bookmarks, clicks, followers_gained, source, captured_at')
    .single();
  if (error || !data) throw new Error(`Could not store results: ${error?.message ?? 'no row'}`);
  return data as PostMetrics;
}

export class MetricsUnavailableError extends Error {}

/**
 * Current numbers for one posted draft from its platform's API. Throws
 * MetricsUnavailableError when this platform cannot be read automatically
 * for this user, which callers treat as "ask the user".
 */
export async function fetchLiveMetrics(draft: DraftRecord): Promise<{ values: MetricValues; source: MetricSource; raw: unknown }> {
  if (!draft.external_id && !draft.post_url) throw new MetricsUnavailableError('Link the live post first.');

  switch (draft.platform) {
    case 'x': {
      if (!xConfigured()) throw new MetricsUnavailableError('X results are not available on this server.');
      if (!draft.external_id) throw new MetricsUnavailableError('Link the X post first.');
      const [post] = await getPostsByIds([draft.external_id]);
      if (!post) throw new MetricsUnavailableError('X did not return that post. It may have been deleted.');
      return { values: fromX(post.public_metrics), source: 'x_api', raw: post.public_metrics };
    }
    case 'bluesky': {
      const uri = draft.external_id?.startsWith('at://') ? draft.external_id : draft.post_url ? await blueskyUriFromUrl(draft.post_url) : null;
      if (!uri) throw new MetricsUnavailableError('Link the Bluesky post first.');
      const stats = await blueskyPostStats(uri);
      if (!stats) throw new MetricsUnavailableError('Bluesky did not return that post.');
      return {
        values: { ...EMPTY_VALUES, likes: stats.likes, replies: stats.replies, reposts: stats.reposts, quotes: stats.quotes },
        source: 'bluesky',
        raw: stats,
      };
    }
    case 'threads': {
      const credential = await getCredential(draft.user_id, draft.workspace_id, 'threads');
      if (!credential || !draft.external_id || !/^\d+$/.test(draft.external_id)) {
        throw new MetricsUnavailableError('Connect Threads and publish from Forge to read results automatically.');
      }
      const stats = await threadsPostStats(credential.accessToken, draft.external_id);
      return {
        values: { ...EMPTY_VALUES, impressions: stats.views, likes: stats.likes, replies: stats.replies, reposts: stats.reposts, quotes: stats.quotes },
        source: 'threads',
        raw: stats,
      };
    }
    case 'linkedin': {
      const credential = await getCredential(draft.user_id, draft.workspace_id, 'linkedin');
      if (!credential || !credential.scopes.includes(ANALYTICS_SCOPE) || !draft.external_id?.startsWith('urn:li:')) {
        throw new MetricsUnavailableError('LinkedIn results need to be added by hand or from a screenshot.');
      }
      const stats = await linkedInPostStats(credential.accessToken, draft.external_id);
      return {
        values: { ...EMPTY_VALUES, impressions: stats.impressions, likes: stats.reactions, replies: stats.comments, reposts: stats.reshares },
        source: 'linkedin',
        raw: stats,
      };
    }
    default:
      throw new MetricsUnavailableError('Add results for this post by hand.');
  }
}

export function fromX(m: {
  like_count: number;
  reply_count: number;
  retweet_count: number;
  quote_count: number;
  bookmark_count?: number;
  impression_count?: number;
}): MetricValues {
  return {
    ...EMPTY_VALUES,
    impressions: m.impression_count ?? null,
    likes: m.like_count,
    replies: m.reply_count,
    reposts: m.retweet_count,
    quotes: m.quote_count,
    bookmarks: m.bookmark_count ?? null,
  };
}

/** Which checkpoint, if any, is being collected right now for a post published at `postedAt`. */
export function dueCheckpoint(postedAt: string, now = Date.now()): Exclude<MetricCheckpoint, 'manual'> | null {
  const hours = (now - new Date(postedAt).getTime()) / 3_600_000;
  return CHECKPOINT_WINDOWS.find((w) => hours >= w.fromHours && hours < w.toHours)?.checkpoint ?? null;
}
