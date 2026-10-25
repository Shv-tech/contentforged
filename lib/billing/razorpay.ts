/**
 * lib/billing/razorpay.ts
 *
 * Server-only Razorpay wrapper. Never import this into a client component:
 * it reads RAZORPAY_KEY_SECRET, and bundling that into browser JavaScript
 * would hand every visitor the ability to forge payments.
 *
 * WHY SUBSCRIPTIONS AND NOT ORDERS
 *
 * The previous implementation created one-time Orders. Orders cannot auto-
 * renew: there is no mandate, so every month the customer must manually pay
 * again. Recurring billing requires the Subscriptions API, which carries the
 * customer mandate (UPI Autopay / e-NACH / card-on-file) and triggers the
 * RBI-mandated pre-debit notification 24 hours before each charge. Razorpay
 * only sends that notification for Subscriptions.
 */

import crypto from 'crypto';
import Razorpay from 'razorpay';
import { type BillingCurrency, type PlanId, razorpayPlanIdFor } from './plans';

// ============================================================================
// CLIENT
// ============================================================================

let cachedClient: Razorpay | null = null;

/**
 * Instantiated lazily rather than at module scope. Constructing at import time
 * throws during `next build` when secrets are absent from the build
 * environment, which fails the whole build for a route that may never run.
 */
export function getRazorpayClient(): Razorpay {
  if (cachedClient) return cachedClient;

  const keyId = process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials are not configured.');
  }

  cachedClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return cachedClient;
}

// ============================================================================
// SIGNATURE VERIFICATION
//
// Both functions use timingSafeEqual rather than `===`. String comparison
// short-circuits on the first differing byte, which leaks the position of the
// mismatch through response timing and allows an attacker to reconstruct a
// valid signature byte by byte. This is a practical attack, not a theoretical
// one, against an endpoint that can be called repeatedly.
// ============================================================================

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies a webhook payload against the webhook secret.
 *
 * `rawBody` must be the exact bytes received. Re-serializing the parsed JSON
 * changes key order and whitespace, producing a different HMAC and rejecting
 * every legitimate webhook.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeCompare(expected, signature);
}

/**
 * Verifies the client-side checkout callback for a subscription payment.
 *
 * Note the payload order differs from the one-time Order flow: subscriptions
 * sign `payment_id|subscription_id`, orders sign `order_id|payment_id`. Using
 * the order formula on a subscription callback fails every time.
 *
 * This only proves a payment occurred. It does NOT establish entitlement —
 * that comes exclusively from the verified `subscription.charged` webhook.
 */
export function verifySubscriptionPaymentSignature(params: {
  razorpayPaymentId: string;
  razorpaySubscriptionId: string;
  razorpaySignature: string;
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${params.razorpayPaymentId}|${params.razorpaySubscriptionId}`)
    .digest('hex');

  return safeCompare(expected, params.razorpaySignature);
}

// ============================================================================
// SUBSCRIPTION OPERATIONS
// ============================================================================

export interface CreateSubscriptionArgs {
  planId: PlanId;
  currency: BillingCurrency;
  userId: string;
  email: string;
  /** Total billing cycles. 120 months is effectively "until cancelled". */
  totalCount?: number;
}

export interface CreatedSubscription {
  subscriptionId: string;
  razorpayPlanId: string;
  currency: BillingCurrency;
  status: string;
  shortUrl: string | null;
}

export async function createSubscription(
  args: CreateSubscriptionArgs
): Promise<CreatedSubscription> {
  const razorpayPlanId = razorpayPlanIdFor(args.planId, args.currency);

  if (!razorpayPlanId) {
    throw new Error(
      `Plan "${args.planId}" has no Razorpay plan id for ${args.currency}. ` +
      `Run scripts/setup-razorpay-plans.ts and set the RAZORPAY_PLAN_*_${args.currency} env vars.`
    );
  }

  const client = getRazorpayClient();

  const subscription = await client.subscriptions.create({
    plan_id: razorpayPlanId,
    total_count: args.totalCount ?? 120,
    quantity: 1,
    // customer_notify lets Razorpay send the mandate and pre-debit
    // notifications required for recurring debits in India.
    customer_notify: 1,
    // `notes` is the only channel that survives the full Razorpay round trip
    // back into the webhook. The webhook must be able to identify the user
    // WITHOUT trusting anything the browser sends, so the user id is written
    // here server-side at creation time and read back from the webhook payload.
    notes: {
      user_id: args.userId,
      plan_id: args.planId,
      currency: args.currency,
      app: 'forge',
    },
  } as any);

  return {
    subscriptionId: subscription.id,
    razorpayPlanId,
    currency: args.currency,
    status: subscription.status,
    shortUrl: (subscription as any).short_url ?? null,
  };
}

export async function fetchSubscription(subscriptionId: string) {
  return getRazorpayClient().subscriptions.fetch(subscriptionId);
}

/**
 * Cancels a subscription.
 *
 * `atCycleEnd: true` is the default and the correct behaviour for a user
 * clicking "cancel": they have already paid through the end of the current
 * period, and revoking access immediately is both unfair and a reliable
 * chargeback trigger.
 */
export async function cancelSubscription(subscriptionId: string, atCycleEnd = true) {
  return getRazorpayClient().subscriptions.cancel(subscriptionId, atCycleEnd);
}

/** Razorpay reports subscription period bounds as UNIX seconds. */
export function unixToDate(seconds: number | null | undefined): Date | null {
  if (!seconds || typeof seconds !== 'number') return null;
  return new Date(seconds * 1000);
}
// ============================================================================
// INVOICES
// ============================================================================

export interface InvoiceSummary {
  id: string;
  number: string | null;
  status: string;
  /** In the smallest currency unit (paise, cents). */
  amount: number;
  amountPaid: number;
  currency: string;
  issuedAt: string | null;
  paidAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  /** Razorpay's hosted invoice page, which has the PDF. */
  url: string | null;
}

/**
 * Every invoice Razorpay raised for these subscriptions, newest first.
 * Razorpay generates one per successful charge, with tax details, so this
 * is the record customers need for expenses rather than anything we draw up.
 */
export async function listInvoices(subscriptionIds: string[]): Promise<InvoiceSummary[]> {
  const client = getRazorpayClient();
  const pages = await Promise.all(subscriptionIds.slice(0, 10).map((id) => client.invoices.all({ subscription_id: id, count: 100 })));
  const iso = (seconds: number | null | undefined) => unixToDate(seconds ?? null)?.toISOString() ?? null;
  return pages
    .flatMap((page) => page.items)
    .map((invoice) => {
      const value = invoice as typeof invoice & { amount?: number; currency?: string; status?: string };
      return {
        id: invoice.id,
        number: invoice.invoice_number || null,
        status: value.status ?? 'issued',
        amount: Number(value.amount ?? invoice.gross_amount ?? 0),
        amountPaid: Number(invoice.amount_paid ?? 0),
        currency: value.currency ?? 'INR',
        issuedAt: iso(invoice.issued_at),
        paidAt: iso(invoice.paid_at),
        periodStart: iso(invoice.billing_start),
        periodEnd: iso(invoice.billing_end),
        url: invoice.short_url ?? null,
      };
    })
    .sort((a, b) => (b.issuedAt ?? '').localeCompare(a.issuedAt ?? ''));
}
