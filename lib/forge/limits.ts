/**
 * lib/forge/limits.ts
 *
 * Fixed-window rate limiting for public, unauthenticated endpoints that spend
 * money upstream: the hook grader on the landing page and the X profile audit.
 *
 * Backed by Upstash Redis (INCR + EXPIRE, atomic per key). Without Redis it
 * falls back to process memory, which limits per serverless instance rather
 * than globally; that is acceptable in development and logged loudly in
 * production so the misconfiguration is visible.
 *
 * If Redis is configured but unreachable (wrong URL, deleted database, an
 * Upstash outage), it falls back to memory too, instead of failing the
 * request. A rate limiter must never be the reason the free grader or the
 * audit returns a 500. The failure still shows on /admin/ops.
 */

import { Redis } from '@upstash/redis';

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL.trim(),
        token: process.env.UPSTASH_REDIS_REST_TOKEN.trim(),
        // One quick retry, not the default five with backoff: a dead Redis
        // must not add seconds to every request before the fallback kicks in.
        retry: { retries: 1, backoff: () => 100 },
      })
    : null;

const memory = new Map<string, { count: number; expiresAt: number }>();
let warned = false;
let redisFailedAt = 0;
const REDIS_RETRY_AFTER_MS = 30_000;

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

export async function consumeLimit(key: string, max: number, windowSeconds: number): Promise<LimitResult> {
  // After a failure, skip Redis for 30 seconds rather than paying the
  // connection timeout on every request.
  if (redis && Date.now() - redisFailedAt > REDIS_RETRY_AFTER_MS) {
    try {
      const namespaced = `forge:limit:${key}`;
      const count = await redis.incr(namespaced);
      if (count === 1) await redis.expire(namespaced, windowSeconds);
      const ttl = count === 1 ? windowSeconds : Math.max(await redis.ttl(namespaced), 0);
      return { allowed: count <= max, remaining: Math.max(max - count, 0), resetSeconds: ttl };
    } catch (error) {
      redisFailedAt = Date.now();
      console.error('[forge/limits] Upstash Redis failed; using per-instance limits for 30 seconds.', error instanceof Error ? error.message : error);
    }
  }

  if (!redis && process.env.NODE_ENV === 'production' && !warned) {
    warned = true;
    console.warn('[forge/limits] Upstash is not configured; public rate limits are per instance only.');
  }

  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.expiresAt <= now) {
    memory.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    return { allowed: max >= 1, remaining: max - 1, resetSeconds: windowSeconds };
  }
  entry.count += 1;
  return {
    allowed: entry.count <= max,
    remaining: Math.max(max - entry.count, 0),
    resetSeconds: Math.ceil((entry.expiresAt - now) / 1000),
  };
}
