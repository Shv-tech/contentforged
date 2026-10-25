/**
 * lib/forge/metered.ts
 *
 * Runs a model call inside the existing quota lifecycle (reserve, run,
 * settle). Every model call made on a user's behalf goes through here or
 * through the chat route's own reservation, so grading a hook or rewriting a
 * line spends from the same allowance as chatting and shows on the same
 * usage page.
 */

import { FORGE_MODEL } from '@/lib/ai/anthropic';
import { reserveQuota, settleQuota, snapshotFrom, denialMessage } from '@/lib/billing/metering';
import { EMPTY_USAGE, type TokenUsage } from '@/lib/billing/plans';
import { HttpError } from './http';

export interface MeteredOptions {
  userId: string;
  route: string;
  maxOutputTokens: number;
  estimatedInputTokens: number;
}

/**
 * `run` returns its result plus the usage it measured. If `run` throws, the
 * reservation is still settled (at whatever was measured before the failure,
 * usually zero) so a failed call never holds quota.
 */
export async function metered<T>(options: MeteredOptions, run: () => Promise<{ value: T; usage: TokenUsage }>): Promise<T> {
  const decision = await reserveQuota({
    userId: options.userId,
    model: FORGE_MODEL,
    maxTokens: options.maxOutputTokens,
    estimatedInputTokens: options.estimatedInputTokens,
  });

  if (!decision.allowed) {
    throw new HttpError(429, denialMessage(decision), {
      reason: decision.reason,
      quota: snapshotFrom(decision),
      upgradeRequired: decision.reason === 'monthly_exceeded',
    });
  }

  let usage: TokenUsage = EMPTY_USAGE;
  try {
    const result = await run();
    usage = result.usage;
    return result.value;
  } finally {
    await settleQuota({
      userId: options.userId,
      grant: decision,
      model: FORGE_MODEL,
      usage,
      route: options.route,
    });
  }
}

/** Rough token estimate from characters, matching the chat route's 4:1. */
export function estimateTokens(...parts: string[]): number {
  return Math.ceil(parts.reduce((total, part) => total + part.length, 0) / 4);
}
