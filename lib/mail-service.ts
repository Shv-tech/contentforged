import { Resend } from 'resend';

const FROM_EMAIL = 'ContentForge <billing@theutopianspace.com>';
const FROM_CALENDAR = 'ContentForge <schedule@theutopianspace.com>';

const getBaseTemplate = (name: string, body: string, actionText: string, actionUrl: string, badge?: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { background-color: #f9fafb; font-family: -apple-system, sans-serif; margin: 0; padding: 0; }
    @media (prefers-color-scheme: dark) {
      body { background-color: #0f172a !important; color: #f8fafc !important; }
      .card { background-color: #1e293b !important; border-color: #334155 !important; }
      .text-main { color: #cbd5e1 !important; }
      .btn { background-color: #f8fafc !important; color: #0f172a !important; }
      .badge { background: #334155 !important; color: #f8fafc !important; }
    }
  </style>
</head>
<body>
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table class="card" width="100%" style="max-width: 500px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 40px; text-align: left; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <div style="display: flex; justify-content: center; align-items: center; gap: 10px;">
                <h1 style="font-size: 14px; font-weight: 800; letter-spacing: 0.1em; color: #0f172a; margin: 0; text-transform: uppercase;">CONTENTFORGE</h1>
                ${badge ? `<span class="badge" style="font-size: 10px; background: #f1f5f9; color: #475569; padding: 4px 8px; border-radius: 4px; font-weight: 700; margin-left: 10px;">${badge}</span>` : ''}
              </div>
            </td>
          </tr>
          <tr>
            <td>
              <p style="font-size: 15px; color: #475569; font-weight: 600;">Hi ${name},</p>
              <div class="text-main" style="font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 32px;">${body}</div>
              <div align="center">
                <a href="${actionUrl}" class="btn" style="display: inline-block; padding: 12px 28px; background: #0f172a; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">${actionText}</a>
              </div>
            </td>
          </tr>
        </table>
        <p style="margin-top: 24px; font-size: 11px; color: #94a3b8; text-align: center;">
          © 2026 SHV Groups Pvt Ltd. <br> 
          You are receiving this because of your active subscription to ContentForge.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`;

export const sendBillingEmail = async (
  type: 'invoice' | 'welcome' | 'due' | 'paused' | 'canceled',
  email: string,
  name: string,
  data?: { amount?: string; planName?: string; pdfUrl?: string }
) => {
  // THE FIX: The "Dummy Key Hack" bypasses Vercel's static compiler crash.
  // In production, it will use your actual environment variable.
  const resend = new Resend(process.env.RESEND_API_KEY || "re_dummy_key_to_bypass_vercel_build");

  let subject = '';
  let body = '';
  let badge = 'OFFICIAL';
  let actionText = 'Access Dashboard';
  let actionUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`;

  switch (type) {
    case 'invoice':
      subject = `Receipt: ${data?.amount} for ContentForge`;
      body = `Your payment of <strong>${data?.amount}</strong> has been processed successfully. Your workspace is fully active.`;
      badge = 'PAID';
      actionText = 'View Invoice PDF';
      actionUrl = data?.pdfUrl || actionUrl;
      break;
    case 'welcome':
      subject = 'Welcome to ContentForge Pro';
      body = `Your workspace has been successfully upgraded to the <strong>${data?.planName}</strong> tier. You now have unrestricted access to all strategic agents and deep-intelligence models.`;
      actionText = 'Enter Command Center';
      break;
    case 'due':
      subject = 'Action Required: Payment Overdue';
      body = `Our attempt to process your subscription payment failed. Please update your payment method to keep your strategic tools active and avoid service pause.`;
      badge = 'IMPORTANT';
      actionText = 'Update Payment Method';
      actionUrl = `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`;
      break;
    case 'paused':
      subject = 'Strategic Access Paused';
      body = `Your ContentForge workspace has been paused due to an outstanding balance. Once the payment is cleared, your data and access will be instantly restored.`;
      badge = 'PAUSED';
      actionText = 'Settle Balance';
      break;
    case 'canceled':
      subject = 'Subscription Canceled';
      body = `Your subscription has been canceled. Your workspace will remain active until the end of your current billing cycle, after which it will revert to the free tier.`;
      break;
  }

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: subject,
    html: getBaseTemplate(name, body, actionText, actionUrl, badge),
  });
};

// ============================================================
// CALENDAR EVENT EMAIL
// ============================================================

const TYPE_META: Record<string, { color: string; label: string }> = {
  post: { color: '#D18A5E', label: 'Content Post' },
  deadline: { color: '#E05555', label: 'Deadline' },
  meeting: { color: '#5588E0', label: 'Meeting' },
  task: { color: '#55AA77', label: 'Task' },
};

function buildGoogleCalendarLink(event: {
  title: string;
  start_date: string;
  description?: string | null;
}) {
  const start = new Date(event.start_date);
  const end = new Date(start.getTime() + 60 * 60 * 1000); // default 1hr block
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: event.description || `Scheduled via ContentForge`,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const getCalendarEmailTemplate = (
  name: string,
  event: {
    title: string;
    start_date: string;
    type: string;
    platform?: string | null;
    description?: string | null;
  },
  dashboardUrl: string,
  gcalUrl: string
) => {
  const meta = TYPE_META[event.type] || TYPE_META.task;
  const dateObj = new Date(event.start_date);

  const day = dateObj.getDate();
  const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const month = dateObj.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const time = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const fullDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${event.title}</title>
<style>
  body, table, td { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
  body { margin: 0; padding: 0; width: 100% !important; background-color: #050505; }
  a { text-decoration: none; }
  @media only screen and (max-width: 600px) {
    .container { width: 100% !important; }
    .px-pad { padding-left: 24px !important; padding-right: 24px !important; }
    .stack { display: block !important; width: 100% !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#050505; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#050505;">
<tr>
<td align="center" style="padding: 48px 16px;">

  <table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" style="width:560px; max-width:560px; background-color:#0c0c0c; border:1px solid #1f1f1f; border-radius:20px; overflow:hidden;">

    <!-- Brand bar -->
    <tr>
      <td class="px-pad" style="padding: 32px 40px 0 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="left">
              <span style="font-family: 'DM Sans', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 800; letter-spacing: 0.16em; color: #f5f5f5; text-transform: uppercase;">CONTENTFORGE</span>
            </td>
            <td align="right">
              <span style="display:inline-block; font-family: 'DM Sans', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: ${meta.color}; background: ${meta.color}1A; border: 1px solid ${meta.color}40; padding: 5px 11px; border-radius: 20px; text-transform: uppercase;">${meta.label}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Divider -->
    <tr><td class="px-pad" style="padding: 24px 40px 0 40px;"><div style="height:1px; background-color:#1a1a1a; width:100%;"></div></td></tr>

    <!-- Date block + Title -->
    <tr>
      <td class="px-pad" style="padding: 32px 40px 8px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr valign="top">
            <td class="stack" width="76" style="width:76px; padding-right: 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="background: linear-gradient(160deg, #2a2a2a 0%, #0d0d0d 100%); border: 1px solid #2a2a2a; border-radius: 16px; width: 76px; height: 76px;">
                <tr>
                  <td align="center" valign="middle" style="height:76px;">
                    <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 30px; line-height: 1; color: #ffffff; font-weight: 700;">${day}</div>
                    <div style="font-family: 'DM Sans', Helvetica, Arial, sans-serif; font-size: 10px; letter-spacing: 0.12em; color: ${meta.color}; margin-top: 4px; font-weight: 700;">${month} · ${weekday}</div>
                  </td>
                </tr>
              </table>
            </td>
            <td class="stack" valign="middle" style="padding-top: 6px;">
              <h1 style="margin: 0 0 8px 0; font-family: 'DM Sans', Helvetica, Arial, sans-serif; font-size: 22px; font-weight: 700; color: #ffffff; line-height: 1.3;">
                ${event.title}
              </h1>
              <p style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 14px; color: #999999; line-height: 1.5;">
                ${fullDate} at <span style="color:#cccccc; font-weight:600;">${time}</span>${event.platform ? ` &nbsp;·&nbsp; <span style="color:#cccccc; font-weight:600;">${event.platform}</span>` : ''}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    ${event.description ? `
    <!-- Description -->
    <tr>
      <td class="px-pad" style="padding: 20px 40px 0 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#131313; border: 1px solid #1f1f1f; border-radius: 12px;">
          <tr>
            <td style="padding: 18px 20px;">
              <p style="margin:0; font-family: Helvetica, Arial, sans-serif; font-size: 13.5px; line-height: 1.65; color: #b8b8b8; white-space: pre-wrap;">${event.description}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : ''}

    <!-- CTA buttons -->
    <tr>
      <td class="px-pad" style="padding: 32px 40px 8px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="border-radius: 12px; background: linear-gradient(135deg, #bf671d 0%, #3b1803 100%);">
              <a href="${dashboardUrl}" target="_blank" style="display:block; padding: 14px 28px; font-family: 'DM Sans', Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 700; color: #ffffff; letter-spacing: 0.01em;">
                View in Calendar
              </a>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 10px;">
          <tr>
            <td align="center" style="border-radius: 12px; border: 1px solid #2a2a2a;">
              <a href="${gcalUrl}" target="_blank" style="display:block; padding: 13px 28px; font-family: 'DM Sans', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 600; color: #cccccc;">
                + Add to Google Calendar
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Sign-off -->
    <tr>
      <td class="px-pad" style="padding: 28px 40px 36px 40px;">
        <p style="margin:0; font-family: Helvetica, Arial, sans-serif; font-size: 13px; color: #666666; line-height: 1.6;">
          Hi ${name}, this was just added to your content calendar. You'll get this confirmation any time something new is scheduled — on the web, or directly by your AI agent.
        </p>
      </td>
    </tr>

  </table>

  <!-- Footer -->
  <table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" style="width:560px; max-width:560px; margin-top: 24px;">
    <tr>
      <td align="center">
        <p style="margin:0; font-family: Helvetica, Arial, sans-serif; font-size: 11px; color: #444444; line-height: 1.6;">
          © 2026 SHV Groups Pvt Ltd · ContentForge<br>
          You're receiving this because of an active workspace event notification.
        </p>
      </td>
    </tr>
  </table>

</td>
</tr>
</table>

</body>
</html>
`;
};

export const sendCalendarEmail = async (
  email: string,
  name: string,
  event: {
    title: string;
    start_date: string;
    type: string;
    platform?: string | null;
    description?: string | null;
  }
) => {
  const resend = new Resend(process.env.RESEND_API_KEY || "re_dummy_key_to_bypass_vercel_build");

  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`;
  const gcalUrl = buildGoogleCalendarLink(event);

  await resend.emails.send({
    from: FROM_CALENDAR,
    to: email,
    subject: `Scheduled: ${event.title}`,
    html: getCalendarEmailTemplate(name, event, dashboardUrl, gcalUrl),
  });
};


  export const sendCalendarDigestEmail = async (
  email: string,
  name: string,
  batch: { campaignName: string; events: Array<{ title: string; start_date: string; type: string }> }
) => {
  const resend = new Resend(process.env.RESEND_API_KEY || "re_dummy_key_to_bypass_vercel_build");
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`;

  const sorted = [...batch.events].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  );

  const rows = sorted.map(e => {
    const meta = TYPE_META[e.type] || TYPE_META.task;
    const d = new Date(e.start_date);
    const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeLabel = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #1a1a1a; width: 90px;">
          <span style="font-family: 'DM Sans', Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 700; color: #999999;">${dateLabel}</span><br>
          <span style="font-family: Helvetica, Arial, sans-serif; font-size: 11px; color: #555555;">${timeLabel}</span>
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #1a1a1a;">
          <span style="font-family: 'DM Sans', Helvetica, Arial, sans-serif; font-size: 13.5px; font-weight: 600; color: #ffffff;">${e.title}</span>
        </td>
        <td style="padding: 12px 0; border-bottom: 1px solid #1a1a1a; text-align: right; width: 90px;">
          <span style="font-family: 'DM Sans', Helvetica, Arial, sans-serif; font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; color: ${meta.color}; background: ${meta.color}1A; border: 1px solid ${meta.color}40; padding: 3px 9px; border-radius: 20px; text-transform: uppercase;">${meta.label}</span>
        </td>
      </tr>`;
  }).join('');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${batch.campaignName}</title>
<style>
  body, table, td { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  body { margin: 0; padding: 0; width: 100% !important; background-color: #050505; }
  a { text-decoration: none; }
  @media only screen and (max-width: 600px) {
    .container { width: 100% !important; }
    .px-pad { padding-left: 24px !important; padding-right: 24px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#050505; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#050505;">
<tr><td align="center" style="padding: 48px 16px;">

  <table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" style="width:560px; max-width:560px; background-color:#0c0c0c; border:1px solid #1f1f1f; border-radius:20px; overflow:hidden;">

    <tr>
      <td class="px-pad" style="padding: 32px 40px 0 40px;">
        <span style="font-family: 'DM Sans', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 800; letter-spacing: 0.16em; color: #f5f5f5; text-transform: uppercase;">CONTENTFORGE</span>
      </td>
    </tr>

    <tr><td class="px-pad" style="padding: 22px 40px 0 40px;"><div style="height:1px; background-color:#1a1a1a;"></div></td></tr>

    <tr>
      <td class="px-pad" style="padding: 28px 40px 4px 40px;">
        <span style="display:inline-block; font-family: 'DM Sans', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: #bf671d; background: #bf671d1A; border: 1px solid #bf671d40; padding: 5px 11px; border-radius: 20px; text-transform: uppercase; margin-bottom: 14px;">FORGE PLANNED THIS</span>
        <h1 style="margin: 14px 0 6px 0; font-family: 'DM Sans', Helvetica, Arial, sans-serif; font-size: 22px; font-weight: 700; color: #ffffff; line-height: 1.3;">${batch.campaignName}</h1>
        <p style="margin: 0 0 24px 0; font-family: Helvetica, Arial, sans-serif; font-size: 13.5px; color: #999999;">${sorted.length} events scheduled across your calendar.</p>
      </td>
    </tr>

    <tr>
      <td class="px-pad" style="padding: 0 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${rows}
        </table>
      </td>
    </tr>

    <tr>
      <td class="px-pad" style="padding: 32px 40px 8px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="border-radius: 12px; background: linear-gradient(135deg, #bf671d 0%, #3b1803 100%);">
              <a href="${dashboardUrl}" target="_blank" style="display:block; padding: 14px 28px; font-family: 'DM Sans', Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 700; color: #ffffff;">View Full Calendar</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td class="px-pad" style="padding: 24px 40px 36px 40px;">
        <p style="margin:0; font-family: Helvetica, Arial, sans-serif; font-size: 13px; color: #666666; line-height: 1.6;">
          Hi ${name}, Forge just laid this out based on your conversation. Every item is fully editable — open any one in your calendar to adjust the time, swap the platform, or remove it.
        </p>
      </td>
    </tr>

  </table>

  <table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" style="width:560px; max-width:560px; margin-top: 24px;">
    <tr><td align="center">
      <p style="margin:0; font-family: Helvetica, Arial, sans-serif; font-size: 11px; color: #444444; line-height: 1.6;">
        © 2026 SHV Groups Pvt Ltd · ContentForge<br>
        You're receiving this because Forge scheduled a batch of events on your behalf.
      </p>
    </td></tr>
  </table>

</td></tr>
</table>
</body>
</html>`;

  await resend.emails.send({
    from: FROM_CALENDAR,
    to: email,
    subject: `Forge scheduled: ${batch.campaignName} (${sorted.length} events)`,
    html,
  });
};
