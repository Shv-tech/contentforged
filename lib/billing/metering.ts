/**
 * lib/billing/metering.ts
 *
 * Wraps the quota lifecycle for a metered request.
 *
 * THE RESERVATION PROBLEM
 *
 * A request's true cost is unknowable until it completes, but the allow/deny
 * decision has to happen before it starts. Three approaches were considered:
 *
 *   check-then-deduct   Two concurrent requests both pass the check. Overshoot
 *                       is unbounded. Rejected.
 *   hard reserve        Reserve max_tokens entirely as output. Correct, but so
 *                       pessimistic it blocks users with plenty of real budget
 *                       left, because responses rarely approach the ceiling.
 *   soft reserve        Reserve a conservative estimate atomically, run, then
 *                       reconcile to actual. Bounded overshoot, no false
 *                       rejections, survives concurrency. Chosen.
 *
 * The atomicity lives in Postgres (reserve_quota locks the window row), not
 * here. This module is the calling convention around it.
 *
 * FAILING CLOSED VS OPEN
 *
 * If the reservation itself errors (database unreachable), the request is
 * ALLOWED and logged. Rationale: a metering outage should degrade to
 * unmetered service rather than a total product outage. The exposure is
 * bounded by how long the database is down, and losing a few dollars of API
 * spend is cheaper than every user seeing a broken product.
 *
 * If settlement fails, the reservation stands. That over-counts the user
 * slightly, which self-corrects at the next window roll. The opposite bias
 * (releasing on failure) would mean free unlimited usage whenever the
 * settlement write is flaky.
 */

import { createServiceClient } from '@/lib/supabase/service';
import {
  PRICING_VERSION,
  computeCostMicros,
  estimateCostMicros,
  type TokenUsage,
} from './plans';

export type QuotaDenialReason =
  | 'window_exceeded'
  | 'monthly_exceeded'
  | 'no_profile';

export interface QuotaGrant {
  allowed: true;
  reservationId: string | null;
  estimateMicros: number;
  windowUsed: number;
  windowBudget: number;
  windowResetsAt: string;
  monthlyUsed: number;
  monthlyBudget: number;
}

export interface QuotaDenial {
  allowed: false;
  reason: QuotaDenialReason;
  windowUsed: number;
  windowBudget: number;
  windowResetsAt: string | null;
  monthlyUsed: number;
  monthlyBudget: number;
}

export type QuotaDecision = QuotaGrant | QuotaDenial;

export interface ReserveArgs {
  userId: string;
  model: string;
  maxTokens: number;
  /** Rough input size, used only to make the estimate less pessimistic. */
  estimatedInputTokens: number;
}

export async function reserveQuota(args: ReserveArgs): Promise<QuotaDecision> {
  const estimateMicros = estimateCostMicros(
    args.model,
    args.maxTokens,
    args.estimatedInputTokens
  );

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .rpc('reserve_quota', {
        p_user_id: args.userId,
        p_estimate_micros: estimateMicros,
      })
      .single();

    if (error || !data) {
      console.error('[metering] reserve_quota failed, allowing request:', error);
      return openGrant(estimateMicros);
    }

    const row = data as any;

    if (!row.allowed) {
      return {
        allowed: false,
        reason: (row.reason ?? 'window_exceeded') as QuotaDenialReason,
        windowUsed: Number(row.window_used ?? 0),
        windowBudget: Number(row.window_budget ?? 0),
        windowResetsAt: row.window_resets_at ?? null,
        monthlyUsed: Number(row.monthly_used ?? 0),
        monthlyBudget: Number(row.monthly_budget ?? 0),
      };
    }

    return {
      allowed: true,
      reservationId: row.reservation_id ?? null,
      estimateMicros,
      windowUsed: Number(row.window_used ?? 0),
      windowBudget: Number(row.window_budget ?? 0),
      windowResetsAt: row.window_resets_at,
      monthlyUsed: Number(row.monthly_used ?? 0),
      monthlyBudget: Number(row.monthly_budget ?? 0),
    };
  } catch (error) {
    console.error('[metering] reserve_quota threw, allowing request:', error);
    return openGrant(estimateMicros);
  }
}

/** Permissive grant used when metering is unavailable. See header note. */
function openGrant(estimateMicros: number): QuotaGrant {
  return {
    allowed: true,
    reservationId: null,
    estimateMicros,
    windowUsed: 0,
    windowBudget: 0,
    windowResetsAt: new Date().toISOString(),
    monthlyUsed: 0,
    monthlyBudget: 0,
  };
}

export interface SettleArgs {
  userId: string;
  grant: QuotaGrant;
  model: string;
  usage: TokenUsage;
  route: string;
  sessionId?: string | null;
  provider?: string;
}

/**
 * Reconciles a reservation against measured cost and appends the audit row.
 *
 * MUST be called on every path out of a metered request, including failures
 * and aborts, with zero usage where nothing was generated. A reservation that
 * is never settled stays held against the user's window until it rolls, which
 * silently eats quota they never spent.
 */
export async function settleQuota(args: SettleArgs): Promise<number> {
  const costMicros = computeCostMicros(args.model, args.usage);

  try {
    const supabase = createServiceClient();

    await supabase.rpc('settle_quota', {
      p_user_id: args.userId,
      p_window_id: args.grant.reservationId,
      p_estimate_micros: args.grant.estimateMicros,
      p_actual_micros: costMicros,
    });

    // Audit row is written even when cost is zero: a failed generation is
    // exactly the thing you want visible when debugging a user's complaint
    // that their quota vanished.
    await supabase.from('usage_events').insert({
      user_id: args.userId,
      session_id: args.sessionId ?? null,
      route: args.route,
      provider: args.provider ?? 'anthropic',
      model: args.model,
      input_tokens: args.usage.inputTokens,
      output_tokens: args.usage.outputTokens,
      cache_read_tokens: args.usage.cacheReadTokens,
      cache_write_tokens: args.usage.cacheWriteTokens,
      cost_micros: costMicros,
      pricing_version: PRICING_VERSION,
    });
  } catch (error) {
    // Never propagate. A billing bookkeeping failure must not turn a
    // successful generation into an error the user sees.
    console.error('[metering] settle_quota failed:', error);
  }

  return costMicros;
}

/** Shape returned to the client so the UI can render a live meter. */
export interface QuotaSnapshot {
  windowUsed: number;
  windowBudget: number;
  windowResetsAt: string | null;
  monthlyUsed: number;
  monthlyBudget: number;
}

export function snapshotFrom(decision: QuotaDecision, spentMicros = 0): QuotaSnapshot {
  return {
    windowUsed: decision.windowUsed + spentMicros,
    windowBudget: decision.windowBudget,
    windowResetsAt: decision.windowResetsAt,
    monthlyUsed: decision.monthlyUsed + spentMicros,
    monthlyBudget: decision.monthlyBudget,
  };
}

/**
 * Human-readable denial copy.
 *
 * A bare "limit reached" is what makes users churn instead of upgrade, so the
 * message always names which limit was hit and when it clears.
 */
export function denialMessage(denial: QuotaDenial): string {
  if (denial.reason === 'no_profile') {
    return 'Your workspace could not be verified. Please sign in again.';
  }

  if (denial.reason === 'monthly_exceeded') {
    return 'You have used your full monthly allowance. Upgrade your plan to keep generating, or wait for your next billing period.';
  }

  if (denial.windowResetsAt) {
    const resetsAt = new Date(denial.windowResetsAt);
    const minutes = Math.max(1, Math.ceil((resetsAt.getTime() - Date.now()) / 60000));
    const readable =
      minutes < 60
        ? `${minutes} minute${minutes === 1 ? '' : 's'}`
        : `${Math.ceil(minutes / 60)} hour${Math.ceil(minutes / 60) === 1 ? '' : 's'}`;
    return `You have hit your current usage window. It resets in ${readable}. Upgrade for a larger allowance.`;
  }

  return 'You have hit your current usage window. Upgrade for a larger allowance.';
}

export interface EbookCreditDecision {
  allowed: boolean;
  used: number;
  allowance: number;
}

export async function consumeEbookCredit(userId: string): Promise<EbookCreditDecision> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .rpc('consume_ebook_credit', { p_user_id: userId })
      .single();

    if (error || !data) {
      console.error('[metering] consume_ebook_credit failed, allowing:', error);
      return { allowed: true, used: 0, allowance: 0 };
    }

    const row = data as any;
    return {
      allowed: Boolean(row.allowed),
      used: Number(row.used ?? 0),
      allowance: Number(row.allowance ?? 0),
    };
  } catch (error) {
    console.error('[metering] consume_ebook_credit threw, allowing:', error);
    return { allowed: true, used: 0, allowance: 0 };
  }
}