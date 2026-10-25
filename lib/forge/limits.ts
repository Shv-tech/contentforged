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
 */

import { Redis } from '@upstash/redis';

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : null;

const memory = new Map<string, { count: number; expiresAt: number }>();
let warned = false;

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

export async function consumeLimit(key: string, max: number, windowSeconds: number): Promise<LimitResult> {
  if (redis) {
    const namespaced = `forge:limit:${key}`;
    const count = await redis.incr(namespaced);
    if (count === 1) await redis.expire(namespaced, windowSeconds);
    const ttl = count === 1 ? windowSeconds : Math.max(await redis.ttl(namespaced), 0);
    return { allowed: count <= max, remaining: Math.max(max - count, 0), resetSeconds: ttl };
  }

  if (process.env.NODE_ENV === 'production' && !warned) {
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
