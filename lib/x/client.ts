/**
 * lib/x/client.ts
 *
 * Read-only client for the X API v2, authenticated with an app bearer token.
 *
 * COST MODEL
 *
 * X bills reads per call on pay-per-use (roughly $0.005 per post read and
 * $0.01 per user lookup at the time of writing; check X's developer pricing
 * before budgeting). Every read here therefore goes through the shared
 * Postgres cache with a TTL that matches how fast the data changes: profiles
 * for a day, a user's timeline for an hour, searches for fifteen minutes.
 * Metric checkpoints (lib/forge/metrics.ts) deliberately bypass the cache,
 * because the point of a checkpoint is a fresh number.
 *
 * Posting is not done through the API. The UI opens X's own compose window
 * with the text filled in (see lib/x/intent.ts): free, and the user stays in
 * control of what goes out under their name.
 */

import { cached } from '@/lib/forge/cache';
import { sha256Hex } from '@/lib/forge/crypto';

const BASE_URL = 'https://api.x.com/2';
const TIMEOUT_MS = 15_000;

export class XApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly resetAt: string | null = null
  ) {
    super(message);
  }
}

export function xConfigured(): boolean {
  return Boolean(process.env.X_BEARER_TOKEN);
}

export interface XPublicMetrics {
  retweet_count: number;
  reply_count: number;
  like_count: number;
  quote_count: number;
  bookmark_count?: number;
  impression_count?: number;
}

export interface XUser {
  id: string;
  username: string;
  name: string;
  description: string;
  profile_image_url: string | null;
  verified: boolean;
  created_at: string | null;
  public_metrics: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
    listed_count: number;
  };
}

export interface XPost {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  conversation_id: string | null;
  public_metrics: XPublicMetrics;
  is_reply: boolean;
  has_link: boolean;
  has_media: boolean;
}

const USER_FIELDS = 'created_at,description,profile_image_url,public_metrics,verified';
const POST_FIELDS = 'created_at,public_metrics,author_id,conversation_id,entities,attachments,in_reply_to_user_id,note_tweet,referenced_tweets';

function token(): string {
  const value = process.env.X_BEARER_TOKEN;
  if (!value) throw new XApiError('X is not connected on this server (X_BEARER_TOKEN).', 503);
  return value;
}

async function xGet(path: string, params: Record<string, string | number | undefined>): Promise<any> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token()}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });

  if (response.status === 429) {
    const reset = response.headers.get('x-rate-limit-reset');
    throw new XApiError(
      'X is rate limiting requests right now. Try again in a few minutes.',
      429,
      reset ? new Date(Number(reset) * 1000).toISOString() : null
    );
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body?.detail || body?.title || body?.errors?.[0]?.message || `X API error (${response.status})`;
    throw new XApiError(detail, response.status);
  }

  // X returns 200 with an `errors` array for lookups that partially fail,
  // such as a suspended or nonexistent username.
  if (!body?.data && Array.isArray(body?.errors) && body.errors.length > 0) {
    const first = body.errors[0];
    const notFound = first?.title === 'Not Found Error' || /could not find/i.test(first?.detail ?? '');
    throw new XApiError(notFound ? 'That X account does not exist or is not public.' : first?.detail ?? 'X returned an error.', notFound ? 404 : 502);
  }

  return body;
}

function toUser(raw: any): XUser {
  return {
    id: raw.id,
    username: raw.username,
    name: raw.name,
    description: raw.description ?? '',
    profile_image_url: raw.profile_image_url ?? null,
    verified: Boolean(raw.verified),
    created_at: raw.created_at ?? null,
    public_metrics: {
      followers_count: raw.public_metrics?.followers_count ?? 0,
      following_count: raw.public_metrics?.following_count ?? 0,
      tweet_count: raw.public_metrics?.tweet_count ?? 0,
      listed_count: raw.public_metrics?.listed_count ?? 0,
    },
  };
}

function toPost(raw: any): XPost {
  const text: string = raw.note_tweet?.text ?? raw.text ?? '';
  const urls: any[] = raw.entities?.urls ?? [];
  // Media attachments also appear as t.co URLs in entities; only count links
  // that point off X as "has a link".
  const externalLinks = urls.filter((u) => u.expanded_url && !/^https?:\/\/(?:x|twitter)\.com\//.test(u.expanded_url));
  return {
    id: raw.id,
    text,
    created_at: raw.created_at,
    author_id: raw.author_id,
    conversation_id: raw.conversation_id ?? null,
    public_metrics: {
      retweet_count: raw.public_metrics?.retweet_count ?? 0,
      reply_count: raw.public_metrics?.reply_count ?? 0,
      like_count: raw.public_metrics?.like_count ?? 0,
      quote_count: raw.public_metrics?.quote_count ?? 0,
      bookmark_count: raw.public_metrics?.bookmark_count ?? 0,
      impression_count: raw.public_metrics?.impression_count ?? 0,
    },
    is_reply: Boolean(raw.in_reply_to_user_id) || (raw.referenced_tweets ?? []).some((r: any) => r.type === 'replied_to'),
    has_link: externalLinks.length > 0,
    has_media: Boolean(raw.attachments?.media_keys?.length),
  };
}

export function normaliseHandle(handle: string): string {
  return handle
    .trim()
    .replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0];
}

export function isValidHandle(handle: string): boolean {
  return /^[A-Za-z0-9_]{1,15}$/.test(handle);
}

// ============================================================================
// READS
// ============================================================================

export async function getUserByUsername(username: string): Promise<XUser> {
  const handle = normaliseHandle(username);
  if (!isValidHandle(handle)) throw new XApiError('That does not look like an X handle.', 400);

  const { value } = await cached(`x:user:${handle.toLowerCase()}`, 86_400, async () => {
    const body = await xGet(`/users/by/username/${encodeURIComponent(handle)}`, { 'user.fields': USER_FIELDS });
    return toUser(body.data);
  });
  return value;
}

/** A user's recent original posts (no retweets; replies optional). */
export async function getUserPosts(userId: string, options: { max?: number; includeReplies?: boolean; fresh?: boolean } = {}): Promise<XPost[]> {
  const max = Math.min(Math.max(options.max ?? 20, 5), 100);
  const exclude = options.includeReplies ? 'retweets' : 'retweets,replies';

  const load = async () => {
    const body = await xGet(`/users/${userId}/tweets`, {
      max_results: max,
      exclude,
      'tweet.fields': POST_FIELDS,
    });
    return ((body.data ?? []) as any[]).map(toPost);
  };

  if (options.fresh) return load();
  const { value } = await cached(`x:posts:${userId}:${max}:${exclude}`, 3600, load);
  return value;
}

export interface SearchResult {
  posts: XPost[];
  authors: Map<string, XUser>;
}

/**
 * Recent search (last seven days). Results are cached briefly and shared
 * across users: the query, not the user, is the cache key.
 */
export async function searchRecent(query: string, options: { max?: number; sort?: 'relevancy' | 'recency' } = {}): Promise<SearchResult> {
  const max = Math.min(Math.max(options.max ?? 50, 10), 100);
  const sort = options.sort ?? 'relevancy';
  const key = `x:search:${sha256Hex(`${query}|${max}|${sort}`)}`;

  const { value } = await cached(key, 900, async () => {
    const body = await xGet('/tweets/search/recent', {
      query,
      max_results: max,
      sort_order: sort,
      'tweet.fields': POST_FIELDS,
      expansions: 'author_id',
      'user.fields': USER_FIELDS,
    });
    return {
      posts: ((body.data ?? []) as any[]).map(toPost),
      users: ((body.includes?.users ?? []) as any[]).map(toUser),
    };
  });

  return { posts: value.posts, authors: new Map(value.users.map((user) => [user.id, user])) };
}

/** Current metrics for specific posts, uncached. Up to 100 ids per call. */
export async function getPostsByIds(ids: string[]): Promise<XPost[]> {
  const unique = Array.from(new Set(ids.filter((id) => /^\d{1,25}$/.test(id))));
  const results: XPost[] = [];
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const body = await xGet('/tweets', { ids: batch.join(','), 'tweet.fields': POST_FIELDS });
    results.push(...((body.data ?? []) as any[]).map(toPost));
  }
  return results;
}

export function postUrl(username: string, postId: string): string {
  return `https://x.com/${username}/status/${postId}`;
}

/** Extracts the numeric post id from an x.com or twitter.com status URL. */
export function postIdFromUrl(url: string): string | null {
  const match = url.match(/(?:x|twitter)\.com\/[^/]+\/status(?:es)?\/(\d+)/i);
  return match ? match[1] : null;
}

/** Weighted engagement of a post, consistent with the Playbook. */
export function postEngagement(post: XPost): number {
  const m = post.public_metrics;
  return m.like_count + 2 * m.reply_count + 3 * (m.retweet_count + m.quote_count) + (m.bookmark_count ?? 0);
}
