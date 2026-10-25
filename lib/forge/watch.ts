/**
 * lib/forge/watch.ts
 *
 * Competitor watch: a handful of accounts the user follows closely, and a
 * digest of what worked for them this week.
 *
 * The digest is computed from the accounts' own public posts: their best
 * posts by engagement relative to their own median, how often they post, and
 * which opening types worked for them. No model call is needed, so it can be
 * recomputed for every user every week at the cost of the X reads alone.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { cached } from './cache';
import { classifyHook, HOOK_TYPE_LABELS, type HookType } from './hooks';
import { getUserPosts, postEngagement, postUrl, type XPost } from '@/lib/x/client';

export const MAX_WATCHED = 10;
const WINDOW_DAYS = 7;

export interface WatchedAccount {
  id: string;
  handle: string;
  external_user_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface DigestPost {
  id: string;
  url: string;
  handle: string;
  name: string;
  text: string;
  createdAt: string;
  likes: number;
  replies: number;
  reposts: number;
  /** Engagement divided by the account's own median. */
  lift: number;
  hook: HookType;
}

export interface AccountSummary {
  handle: string;
  name: string;
  avatar: string | null;
  postsThisWeek: number;
  medianEngagement: number;
}

export interface WatchDigest {
  generatedAt: string;
  windowDays: number;
  accounts: AccountSummary[];
  top: DigestPost[];
  hooks: Array<{ type: HookType; label: string; posts: number; medianLift: number }>;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function listWatched(db: SupabaseClient, userId: string): Promise<WatchedAccount[]> {
  const { data, error } = await db
    .from('watch_accounts')
    .select('id, handle, external_user_id, display_name, avatar_url, created_at')
    .eq('user_id', userId)
    .order('created_at');
  if (error) throw new Error(`Could not load watched accounts: ${error.message}`);
  return (data ?? []) as WatchedAccount[];
}

export async function buildDigest(accounts: WatchedAccount[]): Promise<WatchDigest> {
  const since = Date.now() - WINDOW_DAYS * 86_400_000;
  const perAccount = await Promise.all(
    accounts
      .filter((a) => a.external_user_id)
      .map(async (account) => {
        const posts = await getUserPosts(account.external_user_id!, { max: 40 }).catch((): XPost[] => []);
        return { account, posts };
      })
  );

  const summaries: AccountSummary[] = [];
  const candidates: DigestPost[] = [];

  for (const { account, posts } of perAccount) {
    const baseline = median(posts.map(postEngagement));
    const recent = posts.filter((p) => new Date(p.created_at).getTime() >= since);
    summaries.push({
      handle: account.handle,
      name: account.display_name ?? account.handle,
      avatar: account.avatar_url,
      postsThisWeek: recent.length,
      medianEngagement: Math.round(median(recent.map(postEngagement))),
    });
    for (const post of recent) {
      candidates.push({
        id: post.id,
        url: postUrl(account.handle, post.id),
        handle: account.handle,
        name: account.display_name ?? account.handle,
        text: post.text,
        createdAt: post.created_at,
        likes: post.public_metrics.like_count,
        replies: post.public_metrics.reply_count,
        reposts: post.public_metrics.retweet_count + post.public_metrics.quote_count,
        lift: baseline > 0 ? Math.round((postEngagement(post) / baseline) * 10) / 10 : 0,
        hook: classifyHook(post.text),
      });
    }
  }

  // Ranked by lift over each account's own median, so a small account's
  // breakout is not drowned out by a large account's ordinary post.
  const top = [...candidates].sort((a, b) => b.lift - a.lift).slice(0, 8);

  const byHook = new Map<HookType, number[]>();
  for (const post of candidates) {
    const list = byHook.get(post.hook) ?? [];
    list.push(post.lift);
    byHook.set(post.hook, list);
  }
  const hooks = Array.from(byHook.entries())
    .filter(([, lifts]) => lifts.length >= 2)
    .map(([type, lifts]) => ({ type, label: HOOK_TYPE_LABELS[type], posts: lifts.length, medianLift: Math.round(median(lifts) * 10) / 10 }))
    .sort((a, b) => b.medianLift - a.medianLift);

  return { generatedAt: new Date().toISOString(), windowDays: WINDOW_DAYS, accounts: summaries, top, hooks };
}

/** Cached per set of accounts for six hours, so reopening the view is free. */
export async function cachedDigest(accounts: WatchedAccount[]): Promise<WatchDigest> {
  const key = `watch:digest:${accounts
    .map((a) => a.external_user_id ?? a.handle)
    .sort()
    .join(',')}`;
  const { value } = await cached(key, 6 * 3600, () => buildDigest(accounts));
  return value;
}
