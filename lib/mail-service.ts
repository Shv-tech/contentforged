import { Resend } from 'resend';

const FROM_EMAIL = 'ContentForge <billing@forged.shvgroups.com>';

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