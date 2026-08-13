/**
 * scripts/setup-razorpay-plans.ts
 *
 * Creates one Razorpay Plan per paid tier and prints the environment variables
 * to set. Run once per Razorpay mode (test and live have entirely separate
 * plan ids).
 *
 *   npx tsx scripts/setup-razorpay-plans.ts
 *
 * Requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the environment. Use the
 * test-mode keys first, verify a full checkout, then re-run with live keys.
 *
 * WHY A SCRIPT RATHER THAN THE DASHBOARD
 *
 * Plan amount and interval are immutable once created. Creating four plans by
 * hand and transcribing their ids invites a transposition error that surfaces
 * as a customer being charged the wrong amount. This script derives every
 * value from lib/billing/plans.ts, so the plans and the application cannot
 * disagree.
 *
 * Running twice creates duplicate plans on the Razorpay side. That is
 * harmless (nothing references them) but confusing, so the script lists any
 * existing plans first and refuses to create one whose name already exists.
 */

import fs from 'node:fs';
import path from 'node:path';
import Razorpay from 'razorpay';

// Environment files are loaded BEFORE importing anything that reads
// process.env at module scope. lib/billing/plans.ts captures the
// RAZORPAY_PLAN_* vars when it is first imported, so a later load would be
// too late for them to be seen.
loadEnvFiles();

type BillingCurrency = import('../lib/billing/plans').BillingCurrency;

/**
 * Minimal .env loader.
 *
 * Next.js loads .env.local automatically at runtime, but a standalone script
 * run through tsx or node does not: process.env contains only what the shell
 * exported. Rather than require a dotenv dependency or make the operator
 * export variables by hand (easy to get wrong, and the failure mode is a
 * confusing "credentials not set"), the files are read directly.
 *
 * Order matches Next.js: .env.local wins over .env. Existing process.env
 * values always win over both, so an explicit shell export can still override.
 */
function loadEnvFiles(): void {
  const files = ['.env.local', '.env'];

  for (const file of files) {
    const fullPath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(fullPath)) continue;

    const contents = fs.readFileSync(fullPath, 'utf8');

    for (const rawLine of contents.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const separator = line.indexOf('=');
      if (separator === -1) continue;

      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();

      // Strip matching surrounding quotes, which are optional in .env files
      // but must not end up as part of the secret.
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // A leading '=' means the line was written as KEY==value. Every dotenv
      // parser, including the one Next.js uses, splits on the FIRST '=', so
      // the extra one silently becomes part of the value. The credential then
      // fails authentication with no indication that the file is at fault.
      // Warn loudly rather than repairing it, because the same typo is
      // corrupting the value everywhere else in the app too.
      if (value.startsWith('=')) {
        console.warn(
          `[env] "${key}" in ${file} looks like "${key}==..." with a double equals.\n` +
          `      The extra '=' becomes part of the value and will fail authentication.\n` +
          `      Next.js parses this file the same way, so the app is affected too.\n` +
          `      Using the value with the leading '=' stripped for this run only.\n`
        );
        value = value.slice(1).trim();
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

const ENV_PREFIX_BY_PLAN: Record<string, string> = {
  starter: 'RAZORPAY_PLAN_STARTER',
  pro: 'RAZORPAY_PLAN_PRO',
  agency: 'RAZORPAY_PLAN_AGENCY',
};

/**
 * Both currencies are created. A Razorpay Plan's amount and currency are both
 * immutable, so each tier needs one plan object per currency it is sold in.
 *
 *   INR  cards + UPI Autopay + eMandate
 *   USD  cards only
 */
const CURRENCIES: BillingCurrency[] = ['INR', 'USD'];

async function main() {
  // NEXT_PUBLIC_RAZORPAY_KEY_ID is accepted because the key id is not a
  // secret: it is sent to the browser to open Checkout, so most projects
  // already store it with the public prefix. The SECRET must never carry that
  // prefix, and is only ever read under its bare name.
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    console.error('\nRazorpay credentials were not found.\n');
    console.error('Looked for, in this order:');
    console.error('  key id      RAZORPAY_KEY_ID, then NEXT_PUBLIC_RAZORPAY_KEY_ID');
    console.error('  key secret  RAZORPAY_KEY_SECRET');
    console.error('');
    console.error(`  key id      ${keyId ? 'found' : 'MISSING'}`);
    console.error(`  key secret  ${keySecret ? 'found' : 'MISSING'}`);
    console.error('');
    console.error('Checked .env.local and .env in:');
    console.error(`  ${process.cwd()}`);
    console.error('');
    console.error('If your env file lives elsewhere, run this from the project root.');
    console.error('Values must be unquoted or quoted consistently, one per line.\n');
    process.exit(1);
  }

  if (process.env.NEXT_PUBLIC_RAZORPAY_KEY_SECRET) {
    console.error('\nRAZORPAY_KEY_SECRET is exposed with a NEXT_PUBLIC_ prefix.');
    console.error('That prefix ships the value to the browser, where it can be used');
    console.error('to forge payments. Remove it before going further.\n');
    process.exit(1);
  }

  const mode = keyId.startsWith('rzp_live') ? 'LIVE' : 'TEST';
  console.log(`\nRazorpay mode: ${mode}`);
  console.log(`Creating plans in: ${CURRENCIES.join(', ')}\n`);

  if (mode === 'LIVE') {
    console.log('These plans will be created in LIVE mode and can charge real money.');
    console.log('Plan amounts are immutable once created.\n');
  }

  // Imported dynamically, and only after loadEnvFiles() has run.
  // lib/billing/plans.ts reads the RAZORPAY_PLAN_* variables at module scope,
  // so a static import at the top of this file would evaluate it before the
  // env files were parsed.
  const { PAID_PLANS, PLANS } = await import('../lib/billing/plans');

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

  // Existing plans are indexed by name so a re-run can both avoid duplicates
  // AND report the id of a plan that already exists. Printing "look it up in
  // the dashboard" would be needless manual transcription when the id is
  // already in this response, and hand-copying plan ids is exactly how a
  // wrong-priced plan ends up wired to the wrong tier.
  const existingByName = new Map<string, string>();
  try {
    const existing: any = await razorpay.plans.all({ count: 100 });
    for (const plan of existing.items ?? []) {
      const name = plan?.item?.name;
      if (name && plan?.id) existingByName.set(name, plan.id);
    }
    if (existingByName.size > 0) {
      console.log(`Plans already on this account: ${existingByName.size}`);
      console.log('');
    }
  } catch (error) {
    // A 400 here usually means Subscriptions is not enabled on the account.
    console.error('Could not list existing plans. Is the Subscriptions product enabled?');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const results: { envVar: string; razorpayPlanId: string }[] = [];

  for (const planId of PAID_PLANS) {
    const plan = PLANS[planId];

    for (const currency of CURRENCIES) {
      const pricing = plan.pricing[currency];

      // The name carries currency AND amount for two reasons.
      //
      // Dashboard legibility: two plans differing only by currency are
      // impossible to tell apart when debugging a live subscription.
      //
      // Re-runnability: Razorpay plans cannot be deleted or edited, and this
      // script skips names that already exist. If the amount were not in the
      // name, changing a price and re-running would silently skip every plan
      // and create nothing, leaving the operator convinced the new price was
      // applied when it was not.
      const itemName = `ContentForge ${plan.name} (${currency} ${pricing.amountMinor / 100})`;

      const existingId = existingByName.get(itemName);
      if (existingId) {
        console.log(`EXISTS ${itemName} — ${pricing.displayPrice}/month`);
        console.log(`       ${existingId}\n`);

        // Reported alongside newly created plans so the operator always ends
        // up with a complete set of six env vars, whether this run created
        // them or a previous one did.
        results.push({
          envVar: `${ENV_PREFIX_BY_PLAN[planId]}_${currency}`,
          razorpayPlanId: existingId,
        });
        continue;
      }

      try {
        const created: any = await razorpay.plans.create({
          period: 'monthly',
          interval: 1,
          item: {
            name: itemName,
            description: plan.tagline,
            amount: pricing.amountMinor,
            currency,
          },
          notes: { app: 'contentforge', plan_id: planId, currency },
        });

        console.log(`OK    ${itemName} — ${pricing.displayPrice}/month`);
        console.log(`      ${created.id}\n`);

        results.push({
          envVar: `${ENV_PREFIX_BY_PLAN[planId]}_${currency}`,
          razorpayPlanId: created.id,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`FAIL  ${itemName}`);
        console.error(`      ${message}`);
        // A currency failure is not fatal to the whole run: USD plans can fail
        // on an account without international payments enabled while INR
        // plans succeed, and the INR ids are still worth keeping.
        console.error(`      Continuing with remaining plans.\n`);
      }
    }
  }

  if (results.length === 0) {
    console.log('No plans were created or found. Check the errors above.\n');
    return;
  }

  console.log('Add these to your environment:\n');
  for (const r of results) {
    console.log(`${r.envVar}=${r.razorpayPlanId}`);
  }
  console.log('');
  console.log('Notes:');
  console.log('  - Replace ALL of the RAZORPAY_PLAN_* values above. A stale id points');
  console.log('    at a plan with the old price and will charge that amount.');
  console.log('  - Test and live modes have entirely separate plan ids.');
  console.log('  - Plan amount and currency are immutable once created. To change');
  console.log('    a price, create a new plan; existing subscribers stay on the old one.');
  console.log('  - If only the INR plans were created, international payments may not');
  console.log('    be enabled on this account. INR-only is a valid configuration.\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});