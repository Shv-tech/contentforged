// app/api/billing/subscription/route.ts

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createSubscription, cancelSubscription } from '@/lib/billing/razorpay';
import { isPlanId, PLANS, planAmountMinor } from '@/lib/billing/plans';
import { resolveBillingCurrency, reconcileCurrencyPreference, availableMethods, formatMinor } from '@/lib/billing/currency';

/**
 * Creates a Razorpay Subscription and returns its id for checkout.
 *
 * SECURITY MODEL
 *
 * The user is derived from the verified server session, never from the request
 * body. The client sends only which plan it wants; it cannot say who it is,
 * and it cannot influence the amount (which comes from PLANS, server-side).
 *
 * Creating a subscription grants nothing. The row is written with status
 * 'created' and the user stays on their current plan until a verified
 * `subscription.charged` webhook arrives.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { planId?: unknown; currency?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
  }

  if (!isPlanId(body.planId) || body.planId === 'free') {
    return NextResponse.json({ error: 'Invalid plan selected.' }, { status: 400 });
  }

  const planId = body.planId;

  // Currency is decided server-side from platform geo headers. A client
  // preference is honoured only where geography permits it: a customer outside
  // India cannot select INR, because UPI and eMandate are domestic rails and
  // an INR mandate would be rejected at authorization.
  const detectedCurrency = resolveBillingCurrency(req.headers);
  const currency = reconcileCurrencyPreference(detectedCurrency, body.currency);

  const service = createServiceClient();

  // Refuse to stack LIVE subscriptions. Without this a user who clicks upgrade
  // twice ends up with two mandates and is debited twice every month.
  //
  // Only states where a mandate exists count as live. 'created' means the row
  // was written before checkout and no mandate was ever approved; 'halted'
  // means Razorpay exhausted its retries and access is already revoked.
  // Treating either as live meant a declined card permanently locked the
  // customer out of subscribing, which is the most common first-attempt
  // outcome and therefore a large share of lost signups.
  const { data: existing } = await service
    .from('subscriptions')
    .select('razorpay_subscription_id, plan_id, status')
    .eq('user_id', user.id)
    .in('status', ['authenticated', 'active', 'pending'])
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        error:
          existing.plan_id === planId
            ? 'You already have this subscription.'
            : 'You already have an active subscription. Cancel it before switching plans.',
        currentPlan: existing.plan_id,
      },
      { status: 409 }
    );
  }

  // Discard rows from abandoned or declined checkouts before creating a new
  // one. They carry no mandate and never charged, so nothing is lost, and
  // clearing them keeps a retry from tripping the uniqueness index if its
  // definition is ever widened again.
  await service
    .from('subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('status', 'created');

  try {
    const created = await createSubscription({
      planId,
      currency,
      userId: user.id,
      email: user.email ?? '',
    });

    // Recorded immediately so that a webhook arriving before the browser
    // finishes checkout has a row to update rather than racing to create one.
    const { error: writeError } = await service.from('subscriptions').insert({
      user_id: user.id,
      razorpay_subscription_id: created.subscriptionId,
      razorpay_plan_id: created.razorpayPlanId,
      plan_id: planId,
      status: 'created',
      currency,
      amount_minor: planAmountMinor(planId, currency),
    });

    if (writeError) {
      console.error('[billing/subscription] Failed to persist subscription:', writeError);
      return NextResponse.json(
        { error: 'Could not start the subscription. Please try again.' },
        { status: 500 }
      );
    }

    const amountMinor = planAmountMinor(planId, currency);

    return NextResponse.json({
      subscriptionId: created.subscriptionId,
      planId,
      planName: PLANS[planId].name,
      currency,
      amountMinor,
      displayAmount: formatMinor(amountMinor, currency),
      availableMethods: availableMethods(currency),
      razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[billing/subscription] Creation failed:', message);
    return NextResponse.json(
      { error: 'Could not start the subscription. Please try again.' },
      { status: 500 }
    );
  }
}

/**
 * Cancels at period end. Access continues until current_period_end, at which
 * point the quota functions fall back to free limits automatically.
 */
export async function DELETE() {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: subscription } = await service
    .from('subscriptions')
    .select('razorpay_subscription_id, current_period_end')
    .eq('user_id', user.id)
    .in('status', ['created', 'authenticated', 'active', 'pending'])
    .maybeSingle();

  if (!subscription) {
    return NextResponse.json({ error: 'No active subscription found.' }, { status: 404 });
  }

  try {
    await cancelSubscription(subscription.razorpay_subscription_id, true);

    // The database is updated by the resulting `subscription.cancelled`
    // webhook, not here. Writing entitlement state from two places is how the
    // two copies drift apart.
    return NextResponse.json({
      status: 'cancelling',
      accessUntil: subscription.current_period_end,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[billing/subscription] Cancel failed:', message);
    return NextResponse.json({ error: 'Could not cancel. Please contact support.' }, { status: 500 });
  }
}