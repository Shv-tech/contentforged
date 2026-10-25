/**
 * lib/forge/cache.ts
 *
 * A small durable cache over the forge_cache table, for anything that costs
 * money to fetch: X API reads, web searches, and model summaries of them.
 *
 * Postgres rather than Redis because the cached payloads are large JSON
 * documents that are read a handful of times per hour, and because a shared
 * cache keyed by niche (not user) is the whole point: two people in the same
 * niche asking for the same pulse should cost one upstream call. Redis is
 * still used for per-request rate limiting, where latency matters.
 */

import { createServiceClient } from '@/lib/supabase/service';

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const { data, error } = await createServiceClient().from('forge_cache').select('payload, expires_at').eq('key', key).maybeSingle();

    if (error || !data) return null;
    if (new Date(data.expires_at).getTime() <= Date.now()) return null;
    return data.payload as T;
  } catch (error) {
    console.error('[forge/cache] read failed:', key, error);
    return null;
  }
}

export async function cacheSet<T>(key: string, payload: T, ttlSeconds: number): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const { error } = await createServiceClient().from('forge_cache').upsert({ key, payload, expires_at: expiresAt }, { onConflict: 'key' });
    if (error) console.error('[forge/cache] write failed:', key, error.message);
  } catch (error) {
    // A cache write failure only costs a future cache miss.
    console.error('[forge/cache] write threw:', key, error);
  }
}

/**
 * Returns the cached value for `key`, or computes, stores and returns it.
 * Concurrent misses may both compute; for these workloads a rare duplicate
 * upstream call is cheaper than a distributed lock.
 */
export async function cached<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return { value: hit, hit: true };
  const value = await compute();
  await cacheSet(key, value, ttlSeconds);
  return { value, hit: false };
}
