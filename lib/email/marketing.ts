/**
 * lib/email/marketing.ts
 *
 * The only path through which marketing email leaves this application.
 *
 * WHY EVERYTHING FUNNELS THROUGH ONE FUNCTION
 *
 * Consent is not a thing you remember to check. It is a thing the send
 * function refuses to proceed without. Any design where a caller can reach
 * Resend directly will eventually have a caller that forgets, and the cost of
 * that mistake is a spam complaint that damages the domain your payment
 * receipts are sent from.
 *
 * TRANSACTIONAL EMAIL DOES NOT BELONG HERE
 *
 * Receipts, password resets and payment-failure notices are sent under the
 * contract with the customer. They have no unsubscribe and must not consult
 * consent flags: a user cannot opt out of being told their card was declined.
 * Those live in lib/mail-service.ts and send from the root domain.
 */

import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase/service';
import { renderEmail, escapeHtml } from './design';

export type EmailCategory = 'product' | 'newsletter' | 'promotional';

/**
 * SENDING IDENTITY
 *
 * Ideally marketing sends from a separate SUBDOMAIN to transactional, because
 * sender reputation is tracked at the domain level. Complaints against a
 * campaign accrue to the domain, so sharing one with billing means a badly
 * received newsletter can push receipts and password resets into spam folders
 * with no signal that it is happening.
 *
 * A different local part on the same domain (news@ versus billing@) does NOT
 * provide that isolation. It only helps recipients recognise what an email is.
 *
 * Configured via env so upgrading to a plan with multiple domains is a config
 * change rather than a code change. When mail.theutopianspace.com is verified
 * in Resend, set:
 *
 *   EMAIL_FROM_MARKETING="ContentForge <news@mail.theutopianspace.com>"
 *
 * Until then, sharing the domain is workable at low volume PROVIDED every
 * recipient explicitly opted in and complaint rate stays near zero. The
 * schema's opt-out-by-default is what makes that true; backfilling existing
 * users to opted-in is what would break it.
 */
const FROM_MARKETING =
  process.env.EMAIL_FROM_MARKETING ?? 'ContentForge <news@theutopianspace.com>';

/** Replies should reach a human, not an address nobody monitors. */
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? 'hello@theutopianspace.com';

function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) {
    console.error('[email] NEXT_PUBLIC_APP_URL is not set. Links will be broken.');
    return path;
  }
  return `${base.replace(/\/$/, '')}${path}`;
}

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[email] RESEND_API_KEY is not set. Marketing email is disabled.');
    return null;
  }
  return new Resend(apiKey);
}

// ============================================================================
// RECIPIENTS
// ============================================================================

export interface Recipient {
  userId: string;
  email: string;
  firstName: string;
  unsubscribeToken: string;
}

/**
 * Everyone who may legally and technically receive this category.
 *
 * Filtering happens in SQL rather than in application code so a campaign
 * cannot accidentally iterate over an unfiltered list. The partial index on
 * email_preferences covers exactly this query.
 */
export async function getAudience(category: EmailCategory): Promise<Recipient[]> {
  const supabase = createServiceClient();

  const column =
    category === 'product' ? 'product_opt_in'
    : category === 'newsletter' ? 'newsletter_opt_in'
    : 'promotional_opt_in';

  const { data, error } = await supabase
    .from('email_preferences')
    .select('user_id, email, unsubscribe_token')
    .eq('unsubscribed_all', false)
    .eq('suppressed', false)
    .eq(column, true);

  if (error) {
    console.error('[email] Could not load audience:', error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    userId: row.user_id,
    email: row.email,
    firstName: (row.email?.split('@')[0] ?? 'there').replace(/^\w/, (c: string) => c.toUpperCase()),
    unsubscribeToken: row.unsubscribe_token,
  }));
}

/** Consent check for a single user, mirroring the SQL function. */
export async function canSend(userId: string, category: EmailCategory): Promise<boolean> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc('can_send_marketing', {
      p_user_id: userId,
      p_category: category,
    });
    if (error) {
      // Fail CLOSED. An error checking consent must never be treated as
      // consent: the downside of a missed email is negligible next to the
      // downside of emailing someone who opted out.
      console.error('[email] Consent check failed, refusing to send:', error);
      return false;
    }
    return data === true;
  } catch (error) {
    console.error('[email] Consent check threw, refusing to send:', error);
    return false;
  }
}

// ============================================================================
// SEND
// ============================================================================

export interface SendMarketingArgs {
  recipient: Recipient;
  category: EmailCategory;
  /** Stable id, e.g. 'welcome'. Used for once-per-user enforcement. */
  campaignKey: string;
  subject: string;
  /** Inbox preview text. Always supply one. */
  preheader: string;
  /** Body HTML, composed from lib/email/design primitives. */
  body: string;
  /** True for lifecycle emails that must never be sent twice. */
  once?: boolean;
  footerReason?: string;
}

export interface SendResult {
  sent: boolean;
  reason?: 'no_consent' | 'already_sent' | 'provider_error' | 'not_configured';
}

export async function sendMarketingEmail(args: SendMarketingArgs): Promise<SendResult> {
  const { recipient, category, campaignKey, subject, preheader, body, once, footerReason } = args;

  if (!(await canSend(recipient.userId, category))) {
    return { sent: false, reason: 'no_consent' };
  }

  const resend = getResend();
  if (!resend) return { sent: false, reason: 'not_configured' };

  const supabase = createServiceClient();

  // Claim the send BEFORE dispatching. The unique index on
  // (user_id, campaign_key) makes this atomic, so two concurrent triggers
  // cannot both pass a "have we sent this?" check and both send. Reserving
  // first risks a row for an email that then fails to send; sending first
  // risks sending twice. For a welcome email, the second is worse.
  if (once) {
    const { error: claimError } = await supabase.from('email_sends').insert({
      user_id: recipient.userId,
      email: recipient.email,
      category,
      campaign_key: campaignKey,
      subject,
      status: 'sending',
    });

    if (claimError) {
      if ((claimError as any).code === '23505') {
        return { sent: false, reason: 'already_sent' };
      }
      console.error('[email] Could not claim send:', claimError);
      return { sent: false, reason: 'provider_error' };
    }
  }

  const unsubscribeUrl = appUrl(`/unsubscribe?token=${recipient.unsubscribeToken}`);
  const html = renderEmail({ preheader, body, unsubscribeUrl, footerReason });

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_MARKETING,
      to: recipient.email,
      replyTo: REPLY_TO,
      subject,
      html,
      headers: {
        // One-click unsubscribe. Gmail and Yahoo require this for bulk
        // senders, and mailbox providers weight its presence when deciding
        // inbox placement. Without it, recipients use the spam button
        // instead, which is far more damaging than an unsubscribe.
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    } as any);

    if (error) {
      console.error('[email] Send failed:', error);
      if (once) {
        await supabase
          .from('email_sends')
          .update({ status: 'failed', error_message: String((error as any).message ?? error) })
          .eq('user_id', recipient.userId)
          .eq('campaign_key', campaignKey);
      }
      return { sent: false, reason: 'provider_error' };
    }

    if (once) {
      await supabase
        .from('email_sends')
        .update({ status: 'sent', provider_id: data?.id ?? null })
        .eq('user_id', recipient.userId)
        .eq('campaign_key', campaignKey);
    } else {
      await supabase.from('email_sends').insert({
        user_id: recipient.userId,
        email: recipient.email,
        category,
        campaign_key: campaignKey,
        subject,
        provider_id: data?.id ?? null,
        status: 'sent',
      });
    }

    return { sent: true };
  } catch (error) {
    console.error('[email] Send threw:', error);
    return { sent: false, reason: 'provider_error' };
  }
}

/**
 * Sends a campaign to an entire audience.
 *
 * Batched and paced deliberately. Dispatching thousands of sends at once trips
 * provider rate limits and, more importantly, a sudden volume spike from a
 * domain with no sending history is itself a spam signal. Ramping volume
 * gradually is how a new sending domain builds reputation.
 */
export async function sendCampaign(args: {
  category: EmailCategory;
  campaignKey: string;
  subject: string;
  preheader: string;
  /** Rendered per recipient so copy can be personalised. */
  buildBody: (recipient: Recipient) => string;
  footerReason?: string;
  batchSize?: number;
  delayMs?: number;
  /** Ceiling per invocation. Defaults to 100 to protect a young domain. */
  maxPerRun?: number;
}): Promise<{ sent: number; skipped: number; failed: number; remaining: number }> {
  const audience = await getAudience(args.category);
  const batchSize = args.batchSize ?? 20;
  const delayMs = args.delayMs ?? 1000;

  // Hard ceiling per run, defaulting low.
  //
  // Two reasons. Provider plans cap daily sends, and exceeding the cap means
  // the tail of a campaign silently fails. More importantly, a domain with no
  // bulk-sending history that suddenly emits thousands of messages looks like
  // a compromised account to mailbox providers, and the resulting reputation
  // damage affects transactional mail on the same domain too.
  //
  // Raise deliberately as the domain establishes a track record, rather than
  // sending to the whole list on day one.
  const maxPerRun = args.maxPerRun ?? 100;
  const targets = audience.slice(0, maxPerRun);

  if (audience.length > targets.length) {
    console.warn(
      `[email] Audience is ${audience.length} but this run is capped at ${maxPerRun}. ` +
      `Remaining recipients are untouched; re-run to continue, or raise maxPerRun once ` +
      `the sending domain has a delivery history.`
    );
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);

    const results = await Promise.all(
      batch.map((recipient) =>
        sendMarketingEmail({
          recipient,
          category: args.category,
          campaignKey: args.campaignKey,
          subject: args.subject,
          preheader: args.preheader,
          body: args.buildBody(recipient),
          once: true,
          footerReason: args.footerReason,
        })
      )
    );

    for (const result of results) {
      if (result.sent) sent++;
      else if (result.reason === 'provider_error') failed++;
      else skipped++;
    }

    if (i + batchSize < targets.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const remaining = Math.max(0, audience.length - targets.length);
  console.log(
    `[email] Campaign ${args.campaignKey}: ${sent} sent, ${skipped} skipped, ` +
    `${failed} failed, ${remaining} not attempted this run`
  );
  return { sent, skipped, failed, remaining };
}

// ============================================================================
// SUPPRESSION
// ============================================================================

/**
 * Marks an address as undeliverable.
 *
 * Call from Resend's bounce and complaint webhooks. Continuing to send to an
 * address that hard-bounced, or to someone who pressed "report spam", is the
 * fastest way to lose inbox placement for every other recipient.
 */
export async function suppressAddress(email: string, reason: string): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase
      .from('email_preferences')
      .update({
        suppressed: true,
        suppressed_reason: reason,
        suppressed_at: new Date().toISOString(),
      })
      .eq('email', email);
  } catch (error) {
    console.error('[email] Could not suppress address:', error);
  }
}

export { escapeHtml };