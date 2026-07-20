import { Redis } from "@upstash/redis";

const isProduction = process.env.NODE_ENV === "production";

// Strict environment check: fail loud if missing in production
if (isProduction && (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN)) {
  throw new Error("FATAL: Missing Upstash Redis environment variables in production.");
}

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// Local dev fallback only
const memoryStore = new Map<string, { count: number; expiresAt: number }>();

const FREE_GENERATIONS_BEFORE_EMAIL = 1;
const DAILY_CAP_PER_IP = 15;
const DAY_SECONDS = 60 * 60 * 24;

export interface RateLimitResult {
  allowed: boolean;
  requiresEmail: boolean;
  remaining: number;
  reason?: string;
}

export async function consumeRateLimit(
  ip: string,
  toolSlug: string,
  hasEmail: boolean
): Promise<RateLimitResult> {
  const key = `tool-gen:${toolSlug}:${ip}`;
  let currentCount: number;

  if (redis) {
    // Atomic operation: Increment happens first, preventing time-of-check race conditions
    currentCount = await redis.incr(key);
    if (currentCount === 1) {
      // Only set expiration on the very first request
      await redis.expire(key, DAY_SECONDS);
    }
  } else {
    // Dev fallback guardrail
    if (isProduction) {
      throw new Error("Cannot use memory store in production environment.");
    }
    const now = Date.now();
    const existing = memoryStore.get(key);
    if (existing && existing.expiresAt > now) {
      existing.count += 1;
      currentCount = existing.count;
    } else {
      memoryStore.set(key, { count: 1, expiresAt: now + DAY_SECONDS * 1000 });
      currentCount = 1;
    }
  }

  // Hard cap check
  if (currentCount > DAILY_CAP_PER_IP) {
    return {
      allowed: false,
      requiresEmail: true,
      remaining: 0,
      reason: "Daily limit reached for this tool. Try again tomorrow, or sign in to ContentForge for unlimited access.",
    };
  }

  // Soft email gate check
  if (currentCount > FREE_GENERATIONS_BEFORE_EMAIL && !hasEmail) {
    return {
      allowed: false,
      requiresEmail: true,
      remaining: DAILY_CAP_PER_IP - currentCount, // Still burns down their hard cap behind the scenes
      reason: "Enter your email to keep generating.",
    };
  }

  return {
    allowed: true,
    requiresEmail: false,
    remaining: DAILY_CAP_PER_IP - currentCount,
  };
}

export function truncateToWordLimit(text: string, maxWords: number): string {
  // Fixed: Splitting strictly by a literal space " " instead of /\s+/
  // This preserves \n line breaks so the LLM output doesn't lose formatting if truncated.
  const words = text.trim().split(" ");
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "…";
}