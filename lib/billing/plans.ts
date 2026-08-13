/**
 * lib/billing/plans.ts
 *
 * Single source of truth for plan identity, pricing, and provider cost rates.
 *
 * The codebase previously carried three competing plan vocabularies:
 *   - store.ts:        'free' | 'basic' | 'tier1' | 'tier2' | 'tier3'
 *   - account/page.tsx: compares against 'Pro Plus' and 'enterprise'
 *   - PRICING_TIERS:    its own ids
 *
 * Everything now standardizes on PlanId below, which matches the `plan_id`
 * enum in the database exactly. If you add a plan, it must be added in three
 * places and they must agree: this file, the plan_limits table, and Razorpay.
 */

// ============================================================================
// PLAN IDENTITY
// ============================================================================

export const PLAN_IDS = ['free', 'starter', 'pro', 'agency'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value);
}

/** Mirrors Razorpay's subscription status vocabulary and the DB enum. */
export type SubscriptionStatus =
  | 'created' | 'authenticated' | 'active' | 'pending'
  | 'halted' | 'cancelled' | 'completed' | 'expired' | 'paused';

/** Statuses under which a user retains paid access. */
const ENTITLING_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'active',
  'authenticated',
  // 'pending' means a renewal charge failed and Razorpay is retrying. Access
  // continues through the grace window rather than being cut on first failure:
  // the usual cause is an expired card, and instant lockout converts a payment
  // problem into a churn event.
  'pending',
]);

export function statusGrantsAccess(status: SubscriptionStatus | null | undefined): boolean {
  return status != null && ENTITLING_STATUSES.has(status);
}

// ============================================================================
// CURRENCY
//
// Both INR and USD are live on this Razorpay account, with an important
// asymmetry in payment methods:
//
//   INR   cards + UPI Autopay + eMandate
//   USD   cards only
//
// A Razorpay Plan's amount AND currency are immutable, and a subscription
// cannot change currency after creation. Each tier therefore needs a separate
// Razorpay Plan per currency, and the chosen currency is stored on the
// subscription row rather than re-derived on later requests.
//
// See lib/billing/currency.ts for how a customer's currency is resolved.
// ============================================================================

export type BillingCurrency = 'INR' | 'USD';

/** Fallback when no request context is available (background jobs, scripts). */
export const DEFAULT_CURRENCY: BillingCurrency = 'USD';

/**
 * Amounts in the smallest currency sub-unit (paise for INR, cents for USD).
 * Razorpay always expects minor units; passing major units silently charges
 * 1/100th of the intended amount.
 */
export interface PlanPricing {
  /** Minor units, tax-exclusive. Paise for INR, cents for USD. */
  amountMinor: number;
  /** For display only. */
  displayPrice: string;
}

/**
 * INR prices are FIXED, not converted at runtime.
 *
 * They were set against roughly 95.4 INR/USD and are intentionally left alone
 * as the rate moves. Two reasons: a Razorpay Plan's amount is immutable, so a
 * live conversion could not be applied to existing subscribers anyway; and a
 * price that changes with the exchange rate is impossible to advertise and
 * erodes trust when a customer sees a different number than last month.
 *
 * Revisit these manually if the rate drifts far enough to matter (a 10%+ move
 * sustained over a quarter is a reasonable trigger), by creating new plans.
 * Existing subscribers remain on the plan they signed up for.
 */

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  pricing: Record<'INR' | 'USD', PlanPricing>;
  /**
   * Razorpay Plan id per currency, created via scripts/setup-razorpay-plans.ts
   * and supplied by env var. Null for free, which has no Razorpay plan.
   * A separate plan object is required per currency because amount and
   * currency are both immutable on a Razorpay Plan.
   */
  razorpayPlanIds: Record<BillingCurrency, string | null>;
  /** Must mirror plan_limits in the database. */
  limits: {
    windowSeconds: number;
    windowBudgetMicros: number;
    monthlyBudgetMicros: number;
    maxBrandDnaChars: number;
    ebooksPerMonth: number;
  };
  features: string[];
}

/**
 * Razorpay plan ids come from the environment so that test and live modes can
 * differ without a code change. Hardcoding a test-mode plan id and shipping it
 * to production is a very common and very expensive mistake.
 */
const RZP_PLANS: Record<string, Record<BillingCurrency, string | null>> = {
  starter: {
    INR: process.env.RAZORPAY_PLAN_STARTER_INR ?? null,
    USD: process.env.RAZORPAY_PLAN_STARTER_USD ?? null,
  },
  pro: {
    INR: process.env.RAZORPAY_PLAN_PRO_INR ?? null,
    USD: process.env.RAZORPAY_PLAN_PRO_USD ?? null,
  },
  agency: {
    INR: process.env.RAZORPAY_PLAN_AGENCY_INR ?? null,
    USD: process.env.RAZORPAY_PLAN_AGENCY_USD ?? null,
  },
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Try the engine.',
    pricing: {
      INR: { amountMinor: 0, displayPrice: '₹0' },
      USD: { amountMinor: 0, displayPrice: '$0' },
    },
    razorpayPlanIds: { INR: null, USD: null },
    limits: {
      windowSeconds: 86_400,
      windowBudgetMicros: 50_000,
      monthlyBudgetMicros: 150_000,
      maxBrandDnaChars: 5_000,
      ebooksPerMonth: 0,
    },
    features: [
      'Roughly 15 generations per month',
      'Core content tools',
      'Brand DNA up to 5,000 characters',
    ],
  },

  starter: {
    id: 'starter',
    name: 'Starter',
    tagline: 'For the solo operator.',
    pricing: {
      INR: { amountMinor: 84_900, displayPrice: '₹849' },
      USD: { amountMinor: 900, displayPrice: '$9' },
    },
    razorpayPlanIds: RZP_PLANS.starter,
    limits: {
      windowSeconds: 14_400,
      windowBudgetMicros: 200_000,
      monthlyBudgetMicros: 2_000_000,
      maxBrandDnaChars: 20_000,
      ebooksPerMonth: 2,
    },
    features: [
      'Roughly 210 generations per month',
      'Resets every 4 hours',
      '2 ebooks per month',
      'Brand DNA up to 20,000 characters',
    ],
  },

  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'For the working creator.',
    pricing: {
      INR: { amountMinor: 189_900, displayPrice: '₹1,899' },
      USD: { amountMinor: 2_000, displayPrice: '$20' },
    },
    razorpayPlanIds: RZP_PLANS.pro,
    limits: {
      windowSeconds: 18_000,
      windowBudgetMicros: 600_000,
      monthlyBudgetMicros: 10_000_000,
      maxBrandDnaChars: 60_000,
      ebooksPerMonth: 12,
    },
    features: [
      'Roughly 1,050 generations per month',
      'Resets every 5 hours',
      '12 ebooks per month',
      'Full Brand DNA and social sync',
      'War Room multi-agent mode',
    ],
  },

  agency: {
    id: 'agency',
    name: 'Agency',
    tagline: 'For teams shipping daily.',
    pricing: {
      INR: { amountMinor: 379_900, displayPrice: '₹3,799' },
      USD: { amountMinor: 3_900, displayPrice: '$39' },
    },
    razorpayPlanIds: RZP_PLANS.agency,
    limits: {
      windowSeconds: 18_000,
      windowBudgetMicros: 1_200_000,
      monthlyBudgetMicros: 18_000_000,
      maxBrandDnaChars: 60_000,
      ebooksPerMonth: 25,
    },
    features: [
      'Roughly 1,890 generations per month',
      'Resets every 5 hours',
      '25 ebooks per month',
      'Everything in Pro',
      'Priority generation queue',
    ],
  },
};

export const PAID_PLANS: PlanId[] = ['starter', 'pro', 'agency'];

export function getPlan(id: PlanId): PlanDefinition {
  return PLANS[id];
}

export function planAmountMinor(id: PlanId, currency: BillingCurrency): number {
  return PLANS[id].pricing[currency].amountMinor;
}

export function razorpayPlanIdFor(id: PlanId, currency: BillingCurrency): string | null {
  return PLANS[id].razorpayPlanIds[currency];
}

/**
 * Resolves a Razorpay plan id back to our PlanId and currency.
 * Used by the webhook, which receives only Razorpay's own identifiers.
 */
export function planIdFromRazorpayPlan(
  razorpayPlanId: string
): { planId: PlanId; currency: BillingCurrency } | null {
  for (const id of PAID_PLANS) {
    const ids = PLANS[id].razorpayPlanIds;
    if (ids.INR && ids.INR === razorpayPlanId) return { planId: id, currency: 'INR' };
    if (ids.USD && ids.USD === razorpayPlanId) return { planId: id, currency: 'USD' };
  }
  return null;
}

// ============================================================================
// PROVIDER COST RATES
//
// Quota is denominated in cost, not tokens, because the four token streams
// differ in price by up to 50x. A budget in raw tokens cannot control spend.
//
// PRICING_VERSION is written onto every usage_events row. When rates change or
// the model changes, bump it — historical rows must remain interpretable and
// are never retroactively recomputed.
// ============================================================================

export const PRICING_VERSION = 'haiku-4.5@2025-10';

/** USD per million tokens, per stream. */
export interface ModelRates {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  /** 1h TTL write rate. 5m writes are 1.25x base input instead of 2x. */
  cacheWritePerMTok: number;
}

export const MODEL_RATES: Record<string, ModelRates> = {
  'claude-haiku-4-5-20251001': {
    inputPerMTok: 1.0,
    outputPerMTok: 5.0,
    cacheReadPerMTok: 0.1,
    cacheWritePerMTok: 2.0,
  },
};

/** Rates applied when an unknown model appears, deliberately pessimistic. */
const FALLBACK_RATES: ModelRates = {
  inputPerMTok: 3.0,
  outputPerMTok: 15.0,
  cacheReadPerMTok: 0.3,
  cacheWritePerMTok: 6.0,
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const EMPTY_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/**
 * Converts measured token usage into integer micros of USD.
 *
 * Micros (millionths of a dollar) keep the entire billing path in integer
 * arithmetic. Floating point accumulates drift across millions of rows and
 * makes reconciliation impossible to verify.
 */
export function computeCostMicros(model: string, usage: TokenUsage): number {
  const rates = MODEL_RATES[model] ?? FALLBACK_RATES;

  const dollars =
    (usage.inputTokens / 1_000_000) * rates.inputPerMTok +
    (usage.outputTokens / 1_000_000) * rates.outputPerMTok +
    (usage.cacheReadTokens / 1_000_000) * rates.cacheReadPerMTok +
    (usage.cacheWriteTokens / 1_000_000) * rates.cacheWritePerMTok;

  // Ceiling, not round: never under-bill due to truncation. The bias is
  // sub-cent per request and always in the platform's favour.
  return Math.ceil(dollars * 1_000_000);
}

/** Extracts the four streams from an Anthropic Messages API `usage` object. */
export function usageFromAnthropic(raw: any): TokenUsage {
  return {
    inputTokens: raw?.input_tokens ?? 0,
    outputTokens: raw?.output_tokens ?? 0,
    cacheReadTokens: raw?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: raw?.cache_creation_input_tokens ?? 0,
  };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

/**
 * Pre-flight cost estimate for the soft reservation.
 *
 * Reserving the true worst case (max_tokens entirely as output) would block
 * users who have plenty of real budget, since responses rarely approach the
 * ceiling. Reserving too little lets concurrent requests overshoot. The 0.45
 * factor reflects observed output lengths landing well under max_tokens while
 * still covering a typical long generation.
 */
export function estimateCostMicros(
  model: string,
  maxTokens: number,
  estimatedInputTokens: number
): number {
  const rates = MODEL_RATES[model] ?? FALLBACK_RATES;
  const projectedOutput = maxTokens * 0.45;

  const dollars =
    (estimatedInputTokens / 1_000_000) * rates.cacheReadPerMTok +
    (projectedOutput / 1_000_000) * rates.outputPerMTok;

  return Math.ceil(dollars * 1_000_000);
}

/** Formats micros for display, e.g. 9500 -> "$0.0095". */
export function formatMicros(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}