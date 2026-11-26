// app/api/billing/status/route.ts

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { PLANS, isPlanId, type PlanId } from '@/lib/billing/plans';
import { resolveBillingCurrency, formatMinor, availableMethods } from '@/lib/billing/currency';
import { observed } from '@/lib/ops/observe';

/**
 * Single read endpoint for everything the billing UI needs: current plan,
 * subscription state, live quota, and correctly localized pricing for the
 * upgrade options.
 *
 * Also serves as the entitlement poll target after checkout, which is why it
 * must never be cached — a stale response there would leave a paying customer
 * looking at the free plan.
 */
async function handleGET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();

  // Quota comes from the SECURITY DEFINER function rather than a direct table
  // read, so the window-rollover and lapsed-plan fallback logic lives in
  // exactly one place instead of being reimplemented per caller.
  const { data: quotaRows } = await supabase.rpc('get_quota_status', {
    p_user_id: user.id,
  });

  const quota = Array.isArray(quotaRows) ? quotaRows[0] : quotaRows;

  // Subscription selection is by PRECEDENCE, not recency.
  //
  // Ordering purely by created_at is wrong: an abandoned checkout writes a
  // 'created' row that is newer than the customer's real 'active' one, so the
  // billing page would report their state from a payment that never happened.
  // Abandoned checkouts are common, so this would misreport plan state for a
  // meaningful share of paying users.
  //
  // Live states are therefore queried first, and only if none exists do we
  // fall back to the most recent terminal row (so a cancelled subscription
  // still shows its access-until date).
  const { data: liveSubscription } = await service
    .from('subscriptions')
    .select(
      'plan_id, status, currency, amount_minor, current_period_end, cancel_at_period_end, grace_until'
    )
    .eq('user_id', user.id)
    .in('status', ['active', 'authenticated', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let subscription = liveSubscription;

  if (!subscription) {
    const { data: recentSubscription } = await service
      .from('subscriptions')
      .select(
        'plan_id, status, currency, amount_minor, current_period_end, cancel_at_period_end, grace_until'
      )
      .eq('user_id', user.id)
      // 'created' is excluded deliberately: it means checkout was started and
      // never completed, which is not a subscription and must not be shown as
      // one.
      .in('status', ['cancelled', 'halted', 'completed', 'expired'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    subscription = recentSubscription;
  }

  const planId: PlanId = isPlanId(quota?.plan_id) ? quota.plan_id : 'free';

  // Pricing shown for upgrade options uses the viewer's geography, not the
  // currency of any existing subscription: someone on a lapsed INR plan
  // browsing from abroad should see the prices they can actually pay.
  const displayCurrency = resolveBillingCurrency(req.headers);

  return NextResponse.json({
    planId,
    planName: PLANS[planId].name,

    subscription: subscription
      ? {
          status: subscription.status,
          currency: subscription.currency,
          currentPeriodEnd: subscription.current_period_end,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          // Present only while a renewal is being retried. The UI should use
          // this to explain why access continues despite a failed payment.
          graceUntil: subscription.grace_until,
        }
      : null,

    quota: quota
      ? {
          windowUsed: Number(quota.window_used ?? 0),
          windowBudget: Number(quota.window_budget ?? 0),
          windowResetsAt: quota.window_resets_at,
          monthlyUsed: Number(quota.monthly_used ?? 0),
          monthlyBudget: Number(quota.monthly_budget ?? 0),
          monthlyResetsAt: quota.monthly_resets_at,
          ebooksUsed: Number(quota.ebooks_used ?? 0),
          ebooksAllowed: Number(quota.ebooks_allowed ?? 0),
        }
      : null,

    availableUpgrades: (['starter', 'pro', 'agency'] as PlanId[])
      .filter((id) => id !== planId)
      .map((id) => {
        const amountMinor = PLANS[id].pricing[displayCurrency].amountMinor;
        return {
          planId: id,
          name: PLANS[id].name,
          tagline: PLANS[id].tagline,
          features: PLANS[id].features,
          currency: displayCurrency,
          amountMinor,
          displayPrice: formatMinor(amountMinor, displayCurrency),
          paymentMethods: availableMethods(displayCurrency),
        };
      }),
  });
}

export const GET = observed('api/billing/status', handleGET);
