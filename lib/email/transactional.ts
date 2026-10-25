/**
 * lib/email/transactional.ts
 *
 * The welcome email, sent once by the server when a new user finishes
 * onboarding (app/api/profile). Never callable from the browser.
 */

import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase/service';
import { getWelcomeEmailHtml } from './templates/welcome';

let client: Resend | null = null;

function resend(): Resend | null {
  if (client) return client;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[email] RESEND_API_KEY is not set. The welcome email is disabled.');
    return null;
  }
  client = new Resend(apiKey);
  return client;
}

export async function sendWelcomeEmail({ userId, email, firstName }: { userId: string; email: string; firstName: string }): Promise<boolean> {
  const mailer = resend();
  if (!mailer || !email) return false;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://forgeyourway.dev').replace(/\/+$/, '');
  const { data: preferences } = await createServiceClient().from('email_preferences').select('unsubscribe_token').eq('user_id', userId).maybeSingle();
  const unsubscribeUrl = preferences?.unsubscribe_token
    ? `${appUrl}/api/email/unsubscribe?token=${encodeURIComponent(preferences.unsubscribe_token)}`
    : `${appUrl}/account`;

  const { error } = await mailer.emails.send({
    from: 'Forge <hello@forgeyourway.dev>',
    to: email,
    subject: 'Welcome to Forge',
    html: getWelcomeEmailHtml({ firstName, appUrl, unsubscribeUrl }),
    headers: preferences?.unsubscribe_token
      ? { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
      : undefined,
  });
  if (error) {
    console.error('[email] Welcome email failed:', error);
    return false;
  }
  return true;
}
