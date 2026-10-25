/**
 * lib/forge/niche-insights.ts
 *
 * What works across a niche, built only from creators who opted in, and only
 * shown where enough of them contribute that no one can be singled out.
 *
 * PRIVACY MODEL
 *
 * - Opt-in per user (profiles.share_anonymous_insights), off by default.
 * - Nothing textual leaves a user's own rows: only which bucket a post falls
 *   in (hook type, length band, format, ending, link, time of day) and how
 *   it performed relative to that user's own median.
 * - Each contributor contributes one number per bucket (their median), so a
 *   prolific account cannot outweigh the rest.
 * - A bucket is published only when at least K_ANONYMITY distinct creators
 *   contribute to it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { dimensionsFor, loadPostedPosts, scorePosts } from './playbook';
import { normaliseNiche } from '@/lib/x/pulse';

export const K_ANONYMITY = 5;
const WINDOW_DAYS = 90;
/** A contributor needs this many posts in a bucket for their median to count. */
const MIN_POSTS_PER_BUCKET = 2;

export interface NicheSignal {
  niche: string;
  dimension: string;
  bucket: string;
  contributor_count: number;
  post_count: number;
  median_engagement: number;
  lift: number;
  window_start: string;
  window_end: string;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface Contribution {
  posts: number;
  medianRelative: number;
}

/** Recomputes every niche's signals from opted-in contributors. */
export async function computeNicheSignals(db: SupabaseClient): Promise<{ niches: number; signals: number }> {
  const { data: contributors, error } = await db.from('profiles').select('id, niche, timezone').eq('share_anonymous_insights', true).not('niche', 'is', null);
  if (error) throw new Error(error.message);

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 86_400_000);
  // niche -> "dimension|bucket" -> one contribution per user
  const byNiche = new Map<string, Map<string, Contribution[]>>();

  for (const profile of contributors ?? []) {
    const niche = normaliseNiche(String(profile.niche ?? ''));
    if (niche.length < 2) continue;

    // Personal brand only: client workspaces are never pooled.
    const posts = (await loadPostedPosts(db, profile.id, null, 300)).filter(
      (p) => p.draft.posted_at && new Date(p.draft.posted_at).getTime() >= windowStart.getTime()
    );
    const scored = scorePosts(posts);
    if (scored.length < MIN_POSTS_PER_BUCKET * 2) continue;

    const buckets = byNiche.get(niche) ?? new Map<string, Contribution[]>();
    for (const dimension of dimensionsFor(profile.timezone ?? 'UTC')) {
      const grouped = new Map<string, number[]>();
      for (const post of scored) {
        const bucket = dimension.bucketOf(post);
        if (!bucket) continue;
        grouped.set(bucket, [...(grouped.get(bucket) ?? []), post.relative]);
      }
      for (const [bucket, values] of grouped) {
        if (values.length < MIN_POSTS_PER_BUCKET) continue;
        const key = `${dimension.id}|${bucket}`;
        buckets.set(key, [...(buckets.get(key) ?? []), { posts: values.length, medianRelative: median(values) }]);
      }
    }
    byNiche.set(niche, buckets);
  }

  const rows: NicheSignal[] = [];
  for (const [niche, buckets] of byNiche) {
    for (const [key, contributions] of buckets) {
      if (contributions.length < K_ANONYMITY) continue;
      const [dimension, bucket] = key.split('|');
      const lift = median(contributions.map((c) => c.medianRelative));
      rows.push({
        niche,
        dimension,
        bucket,
        contributor_count: contributions.length,
        post_count: contributions.reduce((sum, c) => sum + c.posts, 0),
        median_engagement: Math.round(lift * 1000) / 1000,
        lift: Math.round(lift * 100) / 100,
        window_start: windowStart.toISOString().slice(0, 10),
        window_end: windowEnd.toISOString().slice(0, 10),
      });
    }
  }

  if (rows.length > 0) {
    const { error: upsertError } = await db.from('niche_signals').upsert(rows, { onConflict: 'niche,dimension,bucket,window_end' });
    if (upsertError) throw new Error(upsertError.message);
  }
  return { niches: byNiche.size, signals: rows.length };
}

/** The latest published signals for a niche, strongest effects first. */
export async function latestNicheSignals(db: SupabaseClient, nicheInput: string): Promise<NicheSignal[]> {
  const niche = normaliseNiche(nicheInput);
  if (niche.length < 2) return [];
  const { data: latest } = await db
    .from('niche_signals')
    .select('window_end')
    .eq('niche', niche)
    .order('window_end', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return [];
  const { data } = await db
    .from('niche_signals')
    .select('niche, dimension, bucket, contributor_count, post_count, median_engagement, lift, window_start, window_end')
    .eq('niche', niche)
    .eq('window_end', latest.window_end)
    .gte('contributor_count', K_ANONYMITY);
  return ((data ?? []) as NicheSignal[]).sort((a, b) => Math.abs(Math.log(b.lift || 1)) - Math.abs(Math.log(a.lift || 1)));
}
