// lib/mail-service.ts
//
// Every email Forge sends, in one file with one design system.
//
// WHY ONE FILE
//
// This replaces a version that had been patched piecemeal until the shared
// pieces went missing: functions referenced a FROM_CALENDAR constant that no
// longer existed and a Resend client that was only ever declared inside
// another function. Imports compiled against names that were not there, and
// calendar mail silently never sent.
//
// One client, one set of sender identities, one template shell. Adding an
// email means writing a body and calling send() with it.

import { Resend } from 'resend';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Sender identities.
 *
 * Split by purpose so a recipient can tell at a glance whether something is a
 * receipt, a reminder, or an announcement, and so mailbox filters can too.
 *
 * All four sit on forgeyourway.dev, which must be verified in Resend with its
 * SPF and DKIM records. An unverified domain fails every send with no
 * user-visible symptom.
 *
 * A note for later: marketing mail ideally moves to a separate SUBDOMAIN, for
 * example news@mail.forgeyourway.dev. Sender reputation is tracked per
 * domain, so a campaign that draws spam complaints degrades deliverability
 * for receipts and password resets sent from the same domain. A different
 * local part on the same domain does not isolate that.
 */
const FROM = {
  billing: 'Forge <billing@forgeyourway.dev>',
  calendar: 'Forge <calendar@forgeyourway.dev>',
  system: 'Forge <hello@forgeyourway.dev>',
} as const;

const REPLY_TO = 'hello@forgeyourway.dev';

/** Postal address. Legally required in marketing mail, harmless elsewhere. */
const POSTAL_ADDRESS = 'SHV Groups Pvt Ltd, New Delhi, India';

/**
 * Lazily constructed, then reused.
 *
 * Constructing at module scope throws during `next build` when secrets are
 * absent from the build environment, which fails the whole build for a route
 * that may never run.
 */
let cachedClient: Resend | null = null;

function getClient(): Resend | null {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Logged rather than thrown. Email is a side effect of the operations
    // that trigger it, and a missing key must not fail a payment webhook or a
    // calendar write. The log is the signal that mail is disabled.
    console.error('[mail] RESEND_API_KEY is not set. No email will be sent.');
    return null;
  }

  cachedClient = new Resend(apiKey);
  return cachedClient;
}

function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) {
    console.error('[mail] NEXT_PUBLIC_APP_URL is not set. Email links will be broken.');
    return path;
  }
  return `${base.replace(/\/$/, '')}${path}`;
}

// ============================================================================
// DESIGN TOKENS
//
// Dark, typographic, one accent colour. What makes an email feel considered is
// whitespace and restraint, not decoration: gradients, shadows and multiple
// accents read as cheaper, not richer.
// ============================================================================

const C = {
  accent: '#d18a5e',
  ink: '#f5f5f5',
  body: '#a8a8a8',
  muted: '#8f8f8f',
  faint: '#555555',
  bg: '#000000',
  panel: '#0d0d0d',
  hairline: '#1c1c1c',
  border: '#2a2a2a',
  green: '#4ade80',
  amber: '#fbbf24',
  red: '#f87171',
} as const;

/**
 * System stack after Inter.
 *
 * Inter is linked in the shell, but Gmail strips webfonts entirely and
 * Outlook on Windows ignores them, so a large share of recipients never see
 * it. The fallbacks are ordered to land on the nearest available grotesque
 * rather than defaulting to a serif.
 */
const FONT = `'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

// ============================================================================
// PRIMITIVES
// ============================================================================

/**
 * Escapes text before it enters the HTML.
 *
 * Everything variable in these emails is either user input or model output:
 * names, post drafts, campaign titles. An unescaped angle bracket breaks the
 * markup of a message already on its way to a customer.
 */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function heading(text: string, size = 26): string {
  return `<h1 style="margin:0 0 14px 0;font-family:${FONT};font-size:${size}px;line-height:1.25;font-weight:600;letter-spacing:-0.02em;color:${C.ink};">${text}</h1>`;
}

function subheading(text: string): string {
  return `<h2 style="margin:0 0 10px 0;font-family:${FONT};font-size:18px;line-height:1.35;font-weight:600;letter-spacing:-0.01em;color:${C.ink};">${text}</h2>`;
}

function para(html: string, color: string = C.body): string {
  return `<p style="margin:0 0 20px 0;font-family:${FONT};font-size:15px;line-height:1.7;color:${color};">${html}</p>`;
}

function small(html: string): string {
  return `<p style="margin:0 0 12px 0;font-family:${FONT};font-size:13px;line-height:1.7;color:${C.muted};">${html}</p>`;
}

/**
 * Quiet pill, matching the app's own buttons.
 *
 * A table rather than a styled anchor because Outlook drops padding on inline
 * elements, collapsing a padded link into unclickable text.
 */
function button(label: string, href: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
      <tr>
        <td align="center" bgcolor="#181818" style="border-radius:100px;border:1px solid ${C.border};">
          <a href="${href}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:14px;font-weight:500;line-height:1;color:${C.ink};text-decoration:none;border-radius:100px;">${label} &nbsp;&rarr;</a>
        </td>
      </tr>
    </table>`;
}

/** Table row rather than <hr>, which several clients restyle with own borders. */
function rule(margin = '28px 0'): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:${margin};"><tr><td style="height:1px;line-height:1px;font-size:0;background-color:${C.hairline};">&nbsp;</td></tr></table>`;
}

/** Small uppercase label, for status and section markers. */
function badge(text: string, color: string = C.accent): string {
  return `<div style="margin:0 0 14px 0;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${color};">${text}</div>`;
}

function panel(inner: string, dashed = false): string {
  return `<div style="margin:0 0 20px 0;padding:18px 20px;background-color:${C.panel};border:1px ${dashed ? 'dashed' : 'solid'} ${dashed ? C.border : '#1f1f1f'};border-radius:12px;font-family:${FONT};font-size:15px;line-height:1.7;color:#e8e8e8;white-space:pre-wrap;">${inner}</div>`;
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Renders a time in the recipient's own zone.
 *
 * Delivery timing never depends on this: calendar_events.start_date is an
 * absolute instant, so a reminder fires at the right moment regardless. This
 * is so the time PRINTED in the email matches the time shown in the app. A
 * user told their 2:30 PM post is at 9:00 AM stops trusting the feature even
 * though nothing is actually wrong with it.
 *
 * Falls back to UTC rather than throwing: Intl raises on an unknown zone, and
 * a slightly wrong time is better than no email.
 */
function fmtTime(iso: string, timezone = 'UTC'): string {
  const opts: Intl.DateTimeFormatOptions = {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone,
  };
  try {
    return new Date(iso).toLocaleTimeString('en-US', opts);
  } catch {
    return new Date(iso).toLocaleTimeString('en-US', { ...opts, timeZone: 'UTC' });
  }
}

function fmtDate(iso: string | null | undefined, timezone = 'UTC'): string {
  if (!iso) return 'the end of your billing period';
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: timezone,
  };
  try {
    return new Date(iso).toLocaleDateString('en-US', opts);
  } catch {
    return new Date(iso).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
  }
}

function fmtLongDate(iso: string | null | undefined, timezone = 'UTC'): string {
  if (!iso) return 'the end of your billing period';
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: timezone,
  };
  try {
    return new Date(iso).toLocaleDateString('en-US', opts);
  } catch {
    return new Date(iso).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
  }
}

/** Bands match the Hook Grader's own thresholds, so the two never disagree. */
function scoreColor(score: number): string {
  if (score >= 45) return C.green;
  if (score >= 38) return C.amber;
  return C.red;
}

// ============================================================================
// SHELL
// ============================================================================

interface ShellOptions {
  /** Inbox preview text. Always supply one, or clients scrape the body. */
  preheader: string;
  body: string;
  /** Present only on marketing mail. Transactional email has no unsubscribe. */
  unsubscribeUrl?: string;
  footerNote?: string;
}

function shell({ preheader, body, unsubscribeUrl, footerNote }: ShellOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<!-- Declared dark so Apple Mail and Outlook do not invert the palette, which
     on a dark email produces grey text on a light grey background. -->
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
  img{border:0;height:auto;line-height:100%;outline:none;text-decoration:none;display:block}
  body{margin:0;padding:0;width:100%!important;background-color:${C.bg}}
  a{text-decoration:none}
  a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
  @media only screen and (max-width:620px){
    .shell{width:100%!important}
    .pad{padding-left:24px!important;padding-right:24px!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.bg};">

<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.bg};">
  ${esc(preheader)}${'&#847;&zwnj;&nbsp;'.repeat(40)}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background-color:${C.bg};">
  <tr><td align="center" style="padding:44px 16px;">
    <table role="presentation" class="shell" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;">

      <tr><td class="pad" style="padding:0 8px 30px 8px;">
        <span style="font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${C.accent};">Forge</span>
      </td></tr>

      <tr><td class="pad" style="padding:0 8px;">${body}</td></tr>

      <tr><td class="pad" style="padding:36px 8px 0 8px;">
        ${rule('0 0 18px 0')}
        <p style="margin:0 0 6px 0;font-family:${FONT};font-size:11px;line-height:1.7;color:${C.faint};">${esc(footerNote ?? 'Sent because you have a Forge account.')}</p>
        <p style="margin:0${unsubscribeUrl ? ' 0 6px 0' : ''};font-family:${FONT};font-size:11px;line-height:1.7;color:${C.faint};">${POSTAL_ADDRESS}</p>
        ${unsubscribeUrl ? `<p style="margin:0;font-family:${FONT};font-size:11px;line-height:1.7;"><a href="${unsubscribeUrl}" style="color:${C.faint};text-decoration:underline;">Unsubscribe</a></p>` : ''}
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ============================================================================
// SEND
// ============================================================================

interface SendArgs {
  to: string;
  from: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
}

/**
 * The single exit point for outbound mail.
 *
 * Never throws. Email is always a side effect of some more important
 * operation, and a provider outage must not fail a payment webhook, a
 * calendar write, or a cron run. Failures are logged and swallowed.
 */
async function send({ to, from, subject, html, headers }: SendArgs): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  try {
    const { error } = await client.emails.send({
      from,
      to,
      replyTo: REPLY_TO,
      subject,
      html,
      ...(headers ? { headers } : {}),
    } as any);

    if (error) {
      console.error(`[mail] Send failed to ${to}:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[mail] Send threw for ${to}:`, err);
    return false;
  }
}

// ============================================================================
// BILLING
//
// Transactional: sent under the contract with the customer. No unsubscribe,
// and no consent check. Someone cannot opt out of being told their payment
// failed.
// ============================================================================

export interface BillingEmailData {
  amount?: string;
  planName?: string;
  /** Razorpay-hosted invoice, downloadable as PDF. */
  pdfUrl?: string;
  /** ISO date access continues to while a failed renewal is retried. */
  graceUntil?: string | null;
  graceDays?: number;
  /** ISO date a cancelled subscription's access ends. */
  accessUntil?: string | null;
}

export type BillingEmailType = 'welcome' | 'invoice' | 'due' | 'paused' | 'canceled';

export const sendBillingEmail = async (
  type: BillingEmailType,
  email: string,
  name: string,
  data?: BillingEmailData
): Promise<boolean> => {
  const safeName = esc(name || 'there');
  const plan = esc(data?.planName ?? 'paid');

  let subject = '';
  let preheader = '';
  let body = '';

  switch (type) {
    case 'welcome':
      // Subject carries the plan. A previous version hardcoded "Pro", so a
      // Starter subscriber was told they had bought a plan they had not.
      subject = data?.planName ? `Welcome to Forge ${data.planName}` : 'Welcome to Forge';
      preheader = 'Your workspace is unlocked. Here is where to start.';
      body =
        badge('Subscription active', C.green) +
        heading(`You're on ${plan}, ${safeName}.`) +
        para('Every tool and your full generation allowance are unlocked. Nothing else to set up.') +
        para('If you have not added your Brand DNA yet, do that first. It is what stops the output sounding like everyone else in your niche.') +
        button('Open workspace', appUrl('/dashboard')) +
        rule() +
        small('Manage your plan or cancel any time from your account. Reply to this email if anything is unclear, it reaches a person.');
      break;

    case 'invoice':
      subject = `Receipt: ${data?.amount ?? 'your payment'}`;
      preheader = `Payment received${data?.amount ? ` for ${data.amount}` : ''}.`;
      body =
        badge('Paid', C.green) +
        heading('Payment received') +
        para(`We have processed <strong style="color:${C.ink};">${esc(data?.amount ?? '')}</strong>. Your workspace stays active, nothing to do.`) +
        // Razorpay generates the invoice with GST breakdown and compliant
        // numbering. Linking theirs avoids reimplementing Indian tax
        // invoicing, which has requirements no hand-rolled PDF will meet.
        (data?.pdfUrl ? button('View invoice', data.pdfUrl) : '') +
        rule() +
        small('Your full billing history is in your account.');
      break;

    case 'due':
      subject = 'Your Forge payment did not go through';
      preheader = 'We are retrying. Your workspace stays active in the meantime.';
      body =
        badge('Action needed', C.amber) +
        heading('We could not process your renewal') +
        para('We are retrying automatically. The usual cause is a card that expired or was replaced.') +
        para(`Your workspace stays fully active until <strong style="color:${C.ink};">${esc(fmtLongDate(data?.graceUntil))}</strong>. Updating your payment method before then keeps everything running without a gap.`) +
        // Points at /account, which is where billing actually lives. An
        // earlier version linked /settings/billing, a route that does not
        // exist, on the one email where the link matters most.
        button('Update payment method', appUrl('/account')) +
        rule() +
        small('If you meant to cancel, you can ignore this and access will end on the date above.');
      break;

    case 'paused':
      subject = 'Your Forge workspace is paused';
      preheader = 'Your data is intact. Access returns as soon as payment clears.';
      body =
        badge('Paused', C.amber) +
        heading('Your workspace is paused') +
        para('There is an outstanding balance on your account. Your Brand DNA, chat history and calendar are all intact and untouched.') +
        para('Access is restored immediately once payment clears.') +
        button('Settle balance', appUrl('/account'));
      break;

    case 'canceled':
      subject = 'Your Forge subscription is cancelled';
      preheader = 'You keep access until the end of the period you paid for.';
      body =
        badge('Cancelled') +
        heading('Subscription cancelled') +
        para('Your plan will not renew.') +
        para(`You keep full access until <strong style="color:${C.ink};">${esc(fmtLongDate(data?.accessUntil))}</strong>. After that your workspace moves to the free tier. Nothing is deleted, and you can resubscribe whenever you like.`) +
        para(`If you cancelled because something was not working, I would like to hear about it. Replying to this email reaches a person.`, C.muted) +
        button('Manage subscription', appUrl('/account'));
      break;
  }

  return send({ to: email, from: FROM.billing, subject, html: shell({ preheader, body }) });
};

// ============================================================================
// CALENDAR: SINGLE EVENT CONFIRMATION
//
// Confirms that something was scheduled, at the moment it is scheduled. That
// is a different job from sendScheduledPostEmail, which delivers the draft at
// reminder time.
// ============================================================================

export interface CalendarEventPayload {
  title: string;
  start_date: string;
  type?: string | null;
  platform?: string | null;
  description?: string | null;
}

export const sendCalendarEmail = async (
  email: string,
  name: string,
  event: CalendarEventPayload,
  timezone = 'UTC'
): Promise<boolean> => {
  const when = `${fmtDate(event.start_date, timezone)} at ${fmtTime(event.start_date, timezone)}`;

  const body =
    badge(esc(event.type ?? 'event')) +
    heading('Scheduled') +
    subheading(esc(event.title)) +
    para(`${esc(when)}${event.platform ? ` &middot; ${esc(event.platform)}` : ''}`, C.muted) +
    (event.description ? panel(esc(event.description)) : '') +
    para('You will get the draft by email before it is due.') +
    button('View calendar', appUrl('/dashboard'));

  return send({
    to: email,
    from: FROM.calendar,
    subject: `Scheduled: ${event.title}`,
    html: shell({
      preheader: `${event.title} — ${when}`,
      body,
      footerNote: 'Sent because you scheduled this in Forge.',
    }),
  });
};

// ============================================================================
// CALENDAR: CAMPAIGN DIGEST
//
// One email for a whole batch. Scheduling a twelve post campaign must not
// produce twelve confirmations, which is why createCalendarEventsBulk sets
// notify_individually to false and calls this instead.
// ============================================================================

export interface CalendarDigestPayload {
  campaignName: string;
  events: Array<{ title: string; start_date: string; type?: string | null }>;
}

export const sendCalendarDigestEmail = async (
  email: string,
  name: string,
  payload: CalendarDigestPayload,
  timezone = 'UTC'
): Promise<boolean> => {
  const rows = payload.events
    .map(
      (e) => `
      <tr>
        <td valign="top" style="padding:0 16px 12px 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.accent};white-space:nowrap;">${esc(fmtDate(e.start_date, timezone))}</td>
        <td valign="top" style="padding:0 0 12px 0;font-family:${FONT};font-size:14px;line-height:1.6;color:#e0e0e0;">${esc(e.title)}</td>
      </tr>`
    )
    .join('');

  const count = payload.events.length;

  const body =
    badge(`${count} ${count === 1 ? 'entry' : 'entries'} added`) +
    heading(esc(payload.campaignName)) +
    para(`Here is the full schedule. Each draft arrives by email before it is due, so you do not need to come back and find it.`) +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">${rows}</table>` +
    button('Open calendar', appUrl('/dashboard')) +
    rule() +
    small('Anything here can be edited, moved or removed from your calendar.');

  return send({
    to: email,
    from: FROM.calendar,
    subject: `${payload.campaignName} — ${count} scheduled`,
    html: shell({
      preheader: `${count} entries scheduled. Drafts arrive before each one is due.`,
      body,
      footerNote: 'Sent because you scheduled these in Forge.',
    }),
  });
};

// ============================================================================
// CALENDAR: SCHEDULED POST DELIVERY
//
// The reminder that actually carries the work. Sent by
// /api/cron/calendar-reminders at each event's reminder offset.
// ============================================================================

export interface ScheduledPostEvent {
  id: string;
  title: string;
  description: string | null;
  post_content: string | null;
  hook_score: number | null;
  hook_verdict: string | null;
  hook_notes: string | null;
  start_date: string;
  platform: string | null;
  type: string | null;
}

function renderPost(event: ScheduledPostEvent, timezone: string): string {
  const time = fmtTime(event.start_date, timezone);

  // A missing draft is stated plainly rather than papered over. An email that
  // looks like it should contain a post but contains a title is worse than
  // one that admits the draft is not ready and links to where it can be
  // written.
  const draft = event.post_content
    ? panel(esc(event.post_content))
    : panel(
        `No draft was generated for this one. ${event.description ? esc(event.description) : 'Open the workspace to write it.'}`,
        true
      );

  const hook =
    event.hook_score != null
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;">
           <tr>
             <td style="padding-right:12px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C.faint};">Hook</td>
             <td style="padding-right:12px;font-family:${FONT};font-size:15px;font-weight:600;color:${scoreColor(event.hook_score)};">${event.hook_score}/50</td>
             ${event.hook_verdict ? `<td style="font-family:${FONT};font-size:13px;color:${C.muted};">${esc(event.hook_verdict)}</td>` : ''}
           </tr>
         </table>
         ${event.hook_notes ? `<p style="margin:0 0 18px 0;font-family:${FONT};font-size:13px;line-height:1.7;color:#7a7a7a;">${esc(event.hook_notes)}</p>` : ''}`
      : '';

  return `
    <div style="margin:0 0 36px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px 0;">
        <tr>
          <td style="padding-right:12px;font-family:${FONT};font-size:12px;font-weight:600;color:${C.accent};">${esc(time)}</td>
          ${event.platform ? `<td style="font-family:${FONT};font-size:12px;color:${C.faint};">${esc(event.platform)}</td>` : ''}
        </tr>
      </table>
      ${subheading(esc(event.title))}
      ${hook}
      ${draft}
    </div>`;
}

export const sendScheduledPostEmail = async (
  email: string,
  name: string,
  events: ScheduledPostEvent[],
  timezone = 'UTC'
): Promise<boolean> => {
  if (events.length === 0) return false;

  const count = events.length;
  const safeName = esc(name || 'there');

  const blocks = events.map((e) => renderPost(e, timezone)).join(rule('0 0 36px 0'));

  const body =
    heading(count === 1 ? 'One post due' : `${count} posts due`) +
    para(`Morning ${safeName}. Ready to copy and publish.`) +
    blocks +
    button('Edit in Forge', appUrl('/dashboard'));

  return send({
    to: email,
    from: FROM.calendar,
    subject: count === 1 ? `Ready to post: ${events[0].title}` : `${count} posts due today`,
    html: shell({
      preheader:
        count === 1
          ? 'Your draft is ready to publish.'
          : `${count} drafts ready to publish.`,
      body,
      footerNote: 'Sent because you scheduled these in Forge. Change or cancel them in your calendar.',
    }),
  });
};