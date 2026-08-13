import { Resend } from 'resend';
import { getWelcomeEmailHtml } from './templates/welcome';

// Ensure you have RESEND_API_KEY set in your .env file
const resend = new Resend(process.env.RESEND_API_KEY);

interface SendWelcomeArgs {
  email: string;
  firstName: string;
  unsubscribeToken: string;
}

export async function sendWelcomeEmail({ email, firstName, unsubscribeToken }: SendWelcomeArgs) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://theutopianspace.com';
  const unsubscribeUrl = `${appUrl}/unsubscribe?token=${unsubscribeToken}`;

  const html = getWelcomeEmailHtml({
    firstName,
    appUrl,
    unsubscribeUrl,
  });

  try {
    const { data, error } = await resend.emails.send({
      from: 'ContentForge <hello@theutopianspace.com>', // The transactional address
      to: email,
      subject: 'Welcome to Forge',
      html: html,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    if (error) {
      console.error('[email] Failed to send welcome email:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('[email] Exception throwing welcome email:', err);
    return { success: false, error: err };
  }
}