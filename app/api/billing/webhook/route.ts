// app/api/billing/webhook/route.ts

export const dynamic = 'force-dynamic';
// Node runtime required: this route uses `crypto` for HMAC verification, which
// is unavailable on the Edge runtime.
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyWebhookSignature, unixToDate } from '@/lib/billing/razorpay';
import {
  planIdFromRazorpayPlan,
  isPlanId,
  statusGrantsAccess,
  PLANS,
  type PlanId,
  type SubscriptionStatus,
} from '@/lib/billing/plans';
import { sendBillingEmail, type BillingEmailData } from '@/lib/mail-service';
import { observed } from '@/lib/ops/observe';

/**
 * THE ENTITLEMENT RULE
 *
 * A user's plan is granted ONLY by a signature-verified webhook from Razorpay.
 * Never by a client-side success handler, never by a redirect parameter, never
 * by anything the browser can influence.
 *
 * The previous implementation granted plans from `/api/razorpay/verify`, which
 * accepted `tier_id` and `user_id` straight from the request body. That allowed
 * anyone to pay for the cheapest tier (or nothing at all) and claim any plan on
 * any account. This route replaces that path entirely.
 *
 * Everything below therefore reads identity from the Razorpay payload's
 * `notes`, which our own server wrote at subscription-creation time and which
 * the browser never touches.
 */

/** Grace period after a failed renewal before access is revoked. */
const GRACE_PERIOD_DAYS = 7;

async function handlePOST(req: Request) {
  // The raw body must be read as text and hashed exactly as received.
  // Parsing and re-serializing changes key order and whitespace, producing a
  // different HMAC and rejecting every legitimate webhook.
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature');

  if (!verifyWebhookSignature(rawBody, signature)) {
    // Deliberately terse. A descriptive error here helps an attacker probe.
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
  }

  // Razorpay sends the event id in a header; some older integrations only see
  // it in the body. Fall back to a deterministic composite so that the
  // idempotency guarantee never silently degrades to "no guarantee".
  const eventId =
    req.headers.get('x-razorpay-event-id') ??
    event.id ??
    `${event.event}:${event.created_at}:${event.payload?.subscription?.entity?.id ?? 'na'}`;

  const supabase = createServiceClient();

  // ==========================================================================
  // IDEMPOTENCY
  //
  // Razorpay retries on any non-2xx response and on timeouts. Without this
  // insert-first check, a retried `subscription.charged` grants a second
  // billing period for a single payment. The unique constraint on
  // razorpay_event_id is what actually enforces it; the race between two
  // concurrent deliveries is resolved by the database, not by application
  // logic.
  // ==========================================================================

  const { error: insertError } = await supabase.from('billing_events').insert({
    razorpay_event_id: eventId,
    event_type: event.event,
    payload: event,
    status: 'processing',
  });

  if (insertError) {
    // 23505 = unique_violation: we have seen this exact event before.
    if (insertError.code === '23505') {
      // A retry of an event whose processing failed is claimed for another
      // attempt. The conditional update is atomic, so of two concurrent
      // retries only one gets the row back and reprocesses it; without this,
      // one transient failure would leave a paid plan ungranted forever.
      const { data: reclaimed } = await supabase
        .from('billing_events')
        .update({ status: 'processing', error_message: null })
        .eq('razorpay_event_id', eventId)
        .eq('status', 'failed')
        .select('razorpay_event_id');
      if (!reclaimed || reclaimed.length === 0) {
        // Already processed, or being processed right now: stop the retries.
        return NextResponse.json({ status: 'duplicate_ignored' });
      }
      return processEvent(supabase, event, eventId);
    }
    console.error('[billing/webhook] Ledger insert failed:', insertError);
    // Return 500 so Razorpay retries: failing to record an event is worse
    // than processing it twice, because the second attempt will dedupe.
    return NextResponse.json({ error: 'Ledger unavailable' }, { status: 500 });
  }

  return processEvent(supabase, event, eventId);
}

/** Handles a claimed event and records the outcome in the ledger. */
async function processEvent(supabase: ReturnType<typeof createServiceClient>, event: any, eventId: string): Promise<NextResponse> {
  try {
    const result = await handleEvent(supabase, event);

    await supabase
      .from('billing_events')
      .update({
        status: 'processed',
        processed_at: new Date().toISOString(),
        user_id: result.userId ?? null,
      })
      .eq('razorpay_event_id', eventId);

    return NextResponse.json({ status: 'ok', handled: result.handled });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[billing/webhook] ${event.event} failed:`, message);

    await supabase
      .from('billing_events')
      .update({ status: 'failed', error_message: message })
      .eq('razorpay_event_id', eventId);

    // 500 asks Razorpay to retry. The ledger row is marked failed, so the
    // retry reclaims it in the duplicate branch above and processes it again.
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

// ============================================================================
// NOTIFICATIONS
//
// Deliberately fire-and-forget. The previous webhook awaited every email
// before returning 2xx, which meant a slow mail provider caused Razorpay to
// time out and retry a delivery that had already been processed — producing
// duplicate emails and, without an idempotency ledger, duplicate grants.
//
// Email is a side effect of billing, never a precondition for it. A failed
// send is logged and dropped; it must never fail the webhook.
// ============================================================================

function notify(
  kind: 'welcome' | 'invoice' | 'due' | 'paused' | 'canceled',
  email: string | null | undefined,
  name: string,
  data?: BillingEmailData
): void {
  if (!email) return;

  void Promise.resolve()
    .then(() => sendBillingEmail(kind, email, name, data))
    .catch((error) => {
      console.error(`[billing/webhook] ${kind} email to ${email} failed:`, error);
    });
}

/** Best-effort display name for email copy. */
function recipientName(entity: any): string {
  return (
    entity?.notes?.customer_name ||
    entity?.customer_details?.name ||
    'there'
  );
}

function recipientEmail(event: any, entity: any): string | null {
  return (
    entity?.notes?.email ||
    entity?.customer_details?.email ||
    event?.payload?.payment?.entity?.email ||
    null
  );
}

// ============================================================================
// EVENT DISPATCH
// ============================================================================

interface HandleResult {
  handled: boolean;
  userId: string | null;
}

async function handleEvent(supabase: any, event: any): Promise<HandleResult> {
  const type: string = event.event;
  const subscriptionEntity = event.payload?.subscription?.entity;

  switch (type) {
    case 'subscription.authenticated':
      // Mandate approved. No money has moved yet, so no entitlement is granted.
      return syncSubscription(supabase, subscriptionEntity, 'authenticated', false);

    case 'subscription.activated':
      return syncSubscription(supabase, subscriptionEntity, 'active', false);

    case 'subscription.charged':
      // The only event that grants or extends paid access.
      return syncSubscription(supabase, subscriptionEntity, 'active', true, event);

    case 'subscription.pending':
      // A renewal charge failed and Razorpay is retrying. Enter grace rather
      // than cutting access: the usual cause is an expired card, and instant
      // lockout turns a payment problem into a churn event.
      return enterGrace(supabase, subscriptionEntity, event);

    case 'subscription.halted':
      // Retries exhausted. Access ends now.
      return revokeAccess(supabase, subscriptionEntity, 'halted');

    case 'subscription.cancelled':
      return markCancelled(supabase, subscriptionEntity, event);

    case 'subscription.completed':
      return revokeAccess(supabase, subscriptionEntity, 'completed');

    case 'subscription.paused':
      notify('paused', recipientEmail(event, subscriptionEntity), recipientName(subscriptionEntity));
      return revokeAccess(supabase, subscriptionEntity, 'paused');

    default:
      // Unrecognized events are acknowledged, not errored. Razorpay sends many
      // event types; returning non-2xx for an event we simply do not care
      // about would put it into a permanent retry loop.
      return { handled: false, userId: null };
  }
}

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * Resolves the owning user from the subscription's `notes`.
 *
 * `notes` is written by our own server in createSubscription() and round-trips
 * through Razorpay untouched by the browser. This is why entitlement can be
 * trusted from it, and why the user id must never be read from a request body.
 */
function resolveIdentity(entity: any): {
  userId: string | null;
  planId: PlanId | null;
  currency: string | null;
} {
  const notes = entity?.notes ?? {};
  const userId = typeof notes.user_id === 'string' ? notes.user_id : null;

  // Prefer resolving from the Razorpay plan id, which Razorpay itself controls
  // and which encodes both tier and currency. Fall back to notes only if that
  // lookup fails (for example a plan created before this mapping existed).
  const fromPlan = entity?.plan_id ? planIdFromRazorpayPlan(entity.plan_id) : null;
  const fromNotes = isPlanId(notes.plan_id) ? notes.plan_id : null;

  return {
    userId,
    planId: fromPlan?.planId ?? fromNotes,
    currency: fromPlan?.currency ?? (typeof notes.currency === 'string' ? notes.currency : null),
  };
}

async function syncSubscription(
  supabase: any,
  entity: any,
  status: SubscriptionStatus,
  grantsPeriod: boolean,
  event?: any
): Promise<HandleResult> {
  const { userId, planId, currency } = resolveIdentity(entity);

  if (!userId || !planId) {
    throw new Error(
      `Cannot resolve identity for subscription ${entity?.id}. ` +
      `user_id=${userId} plan_id=${planId}`
    );
  }

  const periodStart = unixToDate(entity.current_start);
  const periodEnd = unixToDate(entity.current_end);

  await supabase.from('subscriptions').upsert(
    {
      user_id: userId,
      razorpay_subscription_id: entity.id,
      razorpay_customer_id: entity.customer_id ?? null,
      razorpay_plan_id: entity.plan_id,
      plan_id: planId,
      status,
      currency: currency ?? undefined,
      current_period_start: periodStart?.toISOString() ?? null,
      current_period_end: periodEnd?.toISOString() ?? null,
      grace_until: null,
    },
    { onConflict: 'razorpay_subscription_id' }
  );

  if (grantsPeriod) {
    // A successful charge resets the monthly usage counters and anchors the
    // new period. Anchoring to the subscription's own billing date rather than
    // the calendar month is deliberate: a user who subscribes on the 20th must
    // get a full period, not a stub that expires on the 1st.
    await supabase
      .from('profiles')
      .update({
        plan_id: planId,
        plan_status: status,
        current_period_end: periodEnd?.toISOString() ?? null,
        monthly_cost_micros_used: 0,
        monthly_ebooks_used: 0,
        monthly_period_start: (periodStart ?? new Date()).toISOString(),
      })
      .eq('id', userId);

    if (event) {
      const email = recipientEmail(event, entity);
      const name = recipientName(entity);

      // paid_count is 1 on the very first successful charge. Using it rather
      // than comparing timestamps avoids sending a "welcome" on every renewal.
      const isFirstCharge = Number(entity?.paid_count ?? 0) <= 1;

      if (isFirstCharge) {
        notify('welcome', email, name, { planName: PLANS[planId].name });
      }

      const invoiceEntity = event?.payload?.invoice?.entity;
      if (invoiceEntity) {
        notify('invoice', email, name, {
          amount: formatInvoiceAmount(invoiceEntity),
          pdfUrl: invoiceEntity.short_url ?? null,
          planName: PLANS[planId].name,
        });
      }
    }
  } else {
    await supabase
      .from('profiles')
      .update({
        plan_status: status,
        current_period_end: periodEnd?.toISOString() ?? null,
      })
      .eq('id', userId);
  }

  return { handled: true, userId };
}

/**
 * Formats an invoice amount in its own currency.
 *
 * The previous webhook hardcoded INR formatting, which would have displayed a
 * USD invoice with a rupee symbol now that both currencies are live.
 */
function formatInvoiceAmount(invoice: any): string {
  const currency = invoice?.currency === 'USD' ? 'USD' : 'INR';
  const locale = currency === 'USD' ? 'en-US' : 'en-IN';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(invoice?.amount ?? 0) / 100);
}

async function enterGrace(supabase: any, entity: any, event?: any): Promise<HandleResult> {
  const { userId } = resolveIdentity(entity);
  if (!userId) throw new Error(`Cannot resolve user for subscription ${entity?.id}`);

  const graceUntil = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  await supabase
    .from('subscriptions')
    .update({ status: 'pending', grace_until: graceUntil.toISOString() })
    .eq('razorpay_subscription_id', entity.id);

  // The plan itself is intentionally left intact. `pending` still grants
  // access per statusGrantsAccess(), and current_period_end is extended to the
  // grace deadline so the quota functions keep serving the paid tier until it
  // lapses.
  await supabase
    .from('profiles')
    .update({ plan_status: 'pending', current_period_end: graceUntil.toISOString() })
    .eq('id', userId);

  if (event) {
    notify('due', recipientEmail(event, entity), recipientName(entity), {
      graceUntil: graceUntil.toISOString(),
      graceDays: GRACE_PERIOD_DAYS,
    });
  }

  return { handled: true, userId };
}

async function revokeAccess(
  supabase: any,
  entity: any,
  status: SubscriptionStatus
): Promise<HandleResult> {
  const { userId } = resolveIdentity(entity);
  if (!userId) throw new Error(`Cannot resolve user for subscription ${entity?.id}`);

  await supabase
    .from('subscriptions')
    .update({ status, grace_until: null })
    .eq('razorpay_subscription_id', entity.id);

  await supabase
    .from('profiles')
    .update({
      plan_id: 'free',
      plan_status: status,
      current_period_end: null,
    })
    .eq('id', userId);

  return { handled: true, userId };
}

async function markCancelled(supabase: any, entity: any, event?: any): Promise<HandleResult> {
  const { userId } = resolveIdentity(entity);
  if (!userId) throw new Error(`Cannot resolve user for subscription ${entity?.id}`);

  const periodEnd = unixToDate(entity.current_end ?? entity.end_at);

  await supabase
    .from('subscriptions')
    .update({
      status: 'cancelled',
      cancel_at_period_end: true,
      cancelled_at: new Date().toISOString(),
      current_period_end: periodEnd?.toISOString() ?? null,
    })
    .eq('razorpay_subscription_id', entity.id);

  // Access is NOT revoked here. The user paid through current_period_end, and
  // the quota functions downgrade automatically once that timestamp passes.
  // Cutting access at cancellation time is both unfair and a chargeback risk.
  await supabase
    .from('profiles')
    .update({
      plan_status: 'cancelled',
      current_period_end: periodEnd?.toISOString() ?? null,
    })
    .eq('id', userId);

  if (event) {
    notify('canceled', recipientEmail(event, entity), recipientName(entity), {
      accessUntil: periodEnd?.toISOString() ?? null,
    });
  }

  return { handled: true, userId };
}

// `statusGrantsAccess` is imported for use by callers reading this module's
// entitlement semantics; referenced here so the import is not stripped and the
// intent stays discoverable from this file.
void statusGrantsAccess;

export const POST = observed('api/billing/webhook', handlePOST);
