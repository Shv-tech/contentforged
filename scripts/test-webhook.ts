/**
 * scripts/test-webhook.ts
 *
 * Sends a correctly signed Razorpay webhook to your own endpoint, so the
 * entitlement chain can be verified without completing a real mandate.
 *
 *   npx tsx scripts/test-webhook.ts charged <user-uuid> [plan] [currency]
 *   npx tsx scripts/test-webhook.ts pending <user-uuid>
 *   npx tsx scripts/test-webhook.ts cancelled <user-uuid>
 *   npx tsx scripts/test-webhook.ts halted <user-uuid>
 *
 * Example:
 *   npx tsx scripts/test-webhook.ts charged 3f9a1c2e-... pro INR
 *
 * WHY THIS EXISTS
 *
 * Completing a mandate in test mode is fiddly and, more importantly, it is
 * Razorpay's code path rather than yours. What actually needs verifying is the
 * chain you own:
 *
 *   signature verification -> idempotency ledger -> subscriptions upsert ->
 *   profiles entitlement -> monthly counter reset -> billing email
 *
 * All of that is driven purely by the webhook payload, so a signed synthetic
 * event exercises it identically to a real one. The only thing this does NOT
 * test is Razorpay's own checkout and mandate authorization.
 *
 * SAFETY
 *
 * Point this at localhost or a staging URL. Running it against production
 * grants a real account a real plan with no payment behind it. It refuses to
 * run against a URL that is not localhost unless ALLOW_REMOTE=1 is set.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

loadEnvFiles();

function loadEnvFiles(): void {
  for (const file of ['.env.local', '.env']) {
    const fullPath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(fullPath)) continue;

    for (const rawLine of fs.readFileSync(fullPath, 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const separator = line.indexOf('=');
      if (separator === -1) continue;

      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value.startsWith('=')) value = value.slice(1).trim();

      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

type Scenario = 'charged' | 'pending' | 'cancelled' | 'halted' | 'activated';

const SCENARIO_EVENT: Record<Scenario, string> = {
  activated: 'subscription.activated',
  charged: 'subscription.charged',
  pending: 'subscription.pending',
  cancelled: 'subscription.cancelled',
  halted: 'subscription.halted',
};

function unix(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

async function main() {
  const [scenarioArg, userId, planArg = 'starter', currencyArg = 'INR', subIdArg] = process.argv.slice(2);

  const scenario = scenarioArg as Scenario;
  if (!scenario || !(scenario in SCENARIO_EVENT)) {
    console.error(`\nUsage: npx tsx scripts/test-webhook.ts <scenario> <user-uuid> [plan] [currency] [subscription-id]`);
    console.error(`Scenarios: ${Object.keys(SCENARIO_EVENT).join(', ')}`);
    console.error(`Plans: starter, pro, agency    Currencies: INR, USD`);
    console.error(``);
    console.error(`The subscription id defaults to a stable value derived from the user id,`);
    console.error(`so charged/pending/cancelled/halted all act on the same row. Pass one`);
    console.error(`explicitly to target a subscription created by a real checkout.\n`);
    process.exit(1);
  }

  if (!userId) {
    console.error('\nA user id is required. Find one with:');
    console.error("  select id, email from auth.users limit 5;\n");
    process.exit(1);
  }

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('\nRAZORPAY_WEBHOOK_SECRET is not set. The webhook will reject the signature.\n');
    process.exit(1);
  }

  const baseUrl = process.env.WEBHOOK_TARGET || 'http://localhost:3000';
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(baseUrl);

  if (!isLocal && process.env.ALLOW_REMOTE !== '1') {
    console.error(`\nRefusing to send a synthetic webhook to ${baseUrl}.`);
    console.error('This grants a plan with no payment behind it.');
    console.error('Set ALLOW_REMOTE=1 only if you are certain this is a staging environment.\n');
    process.exit(1);
  }

  // Resolve the Razorpay plan id the same way the app does, so the webhook's
  // plan lookup exercises the real mapping rather than a hardcoded value.
  const envKey = `RAZORPAY_PLAN_${planArg.toUpperCase()}_${currencyArg.toUpperCase()}`;
  const razorpayPlanId = process.env[envKey];

  if (!razorpayPlanId) {
    console.error(`\n${envKey} is not set, so the webhook cannot resolve this plan.`);
    console.error('Run scripts/setup-razorpay-plans.ts and add the output to your env file.\n');
    process.exit(1);
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  // A synthetic but structurally faithful subscription entity. `notes` is the
  // important part: the webhook reads identity from there, because it is
  // written server-side at creation and never touched by a browser.
  // Derived from the user id rather than the clock.
  //
  // Every handler except `charged` updates an existing row by
  // razorpay_subscription_id. A timestamped id therefore matched nothing, so
  // `cancelled` and `pending` silently updated zero subscription rows while
  // still updating profiles, leaving the two tables disagreeing.
  //
  // A stable id means `charged` creates the row and every later scenario
  // updates that same row, which is how a real subscription behaves.
  const subscriptionId = subIdArg || `sub_TEST${userId.replace(/-/g, '').slice(0, 14)}`;

  const subscriptionEntity = {
    id: subscriptionId,
    entity: 'subscription',
    plan_id: razorpayPlanId,
    customer_id: `cust_TEST${Date.now()}`,
    status: scenario === 'cancelled' ? 'cancelled' : scenario === 'halted' ? 'halted' : 'active',
    current_start: unix(now),
    current_end: unix(periodEnd),
    // 1 means this is the first successful charge, which is what triggers the
    // welcome email rather than a renewal receipt.
    paid_count: 1,
    notes: {
      user_id: userId,
      plan_id: planArg,
      currency: currencyArg.toUpperCase(),
      app: 'forge',
    },
  };

  const payload: Record<string, unknown> = {
    entity: 'event',
    account_id: 'acc_TEST',
    event: SCENARIO_EVENT[scenario],
    contains: ['subscription'],
    payload: {
      subscription: { entity: subscriptionEntity },
    },
    created_at: unix(now),
  };

  // A charged event carries the invoice, which is where the hosted invoice
  // link the billing email sends the customer comes from.
  if (scenario === 'charged') {
    (payload.payload as any).invoice = {
      entity: {
        id: `inv_TEST${Date.now()}`,
        amount: currencyArg.toUpperCase() === 'USD' ? 2000 : 189900,
        currency: currencyArg.toUpperCase(),
        short_url: 'https://rzp.io/i/TESTINVOICE',
      },
    };
    (payload.contains as string[]).push('invoice');
  }

  // The signature must be computed over the exact bytes sent. Serializing once
  // and reusing the string guarantees the hash matches what the server hashes.
  const rawBody = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

  const eventId = `evt_TEST${Date.now()}`;
  const target = `${baseUrl.replace(/\/$/, '')}/api/billing/webhook`;

  console.log(`\nSending ${SCENARIO_EVENT[scenario]}`);
  console.log(`  target      ${target}`);
  console.log(`  user        ${userId}`);
  console.log(`  plan        ${planArg} (${currencyArg.toUpperCase()}) -> ${razorpayPlanId}`);
  console.log(`  subscription ${subscriptionId}${subIdArg ? ' (explicit)' : ' (derived from user id)'}`);
  console.log(`  event id    ${eventId}\n`);

  if (scenario !== 'charged' && scenario !== 'activated' && !subIdArg) {
    console.log('Note: this scenario UPDATES an existing subscription row. If no row');
    console.log('exists with the id above, run the `charged` scenario first, or pass the');
    console.log('real subscription id as the fifth argument.\n');
  }

  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature,
        'x-razorpay-event-id': eventId,
      },
      body: rawBody,
    });

    const text = await response.text();
    console.log(`HTTP ${response.status}`);
    console.log(text);
    console.log('');

    if (response.ok) {
      console.log('Now verify in the database:');
      console.log(`  select event_type, status, error_message from billing_events order by received_at desc limit 3;`);
      console.log(`  select plan_id, status, current_period_end from subscriptions where user_id = '${userId}';`);
      console.log(`  select plan_id, plan_status, monthly_cost_micros_used from profiles where id = '${userId}';\n`);
      console.log('Re-running this exact command sends the SAME event id, which should');
      console.log('return duplicate_ignored. That is the idempotency guard working.\n');
    } else {
      console.log('The webhook rejected this event. Common causes:');
      console.log('  400 Invalid signature   RAZORPAY_WEBHOOK_SECRET differs from the server process');
      console.log('  500 Ledger unavailable  billing_events table missing, run the migration');
      console.log('  500 Processing failed   check billing_events.error_message for the reason\n');
    }
  } catch (error) {
    console.error('\nCould not reach the webhook.');
    console.error(error instanceof Error ? error.message : error);
    console.error('\nIs the dev server running, and is WEBHOOK_TARGET correct?\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});