import { NextResponse } from 'next/server';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
// import { createClient } from '@supabase/supabase-js'; // Use for Supabase DB upgrade

// Initialize the Nodemailer transporter with your SHV Groups SMTP credentials
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER, // contact@shvgroups.com
    pass: process.env.SMTP_PASS, // Your secure app password
  },
});

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    // 1. Verify the cryptographic signature from Razorpay
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(rawBody)
      .digest('hex');

    if (expectedSignature !== signature) {
      return NextResponse.json({ error: 'Invalid Signature' }, { status: 400 });
    }

    const event = JSON.parse(rawBody);

    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const payment = event.payload.payment.entity;
      const orderNotes = payment.notes;
      const planName = orderNotes.planId.toUpperCase();

      // 2. UPGRADE USER IN SUPABASE (Uncomment in production)
      /*
      const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      await supabaseAdmin.from('users').update({ plan: orderNotes.planId }).eq('email', orderNotes.customerEmail);
      */

      // 3. GENERATE AND SEND THE ENTERPRISE HTML EMAIL
      const mailOptions = {
        from: '"ContentForge by SHV Groups" <contact@shvgroups.com>',
        to: orderNotes.customerEmail || 'user@example.com',
        subject: `Welcome to ContentForge ${planName} | Your Receipt`,
        html: `
          <!DOCTYPE html>
          <html>
          <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #FAFAFA; margin: 0; padding: 40px 0;">
            <div style="max-w: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
              
              <div style="background-color: #111827; padding: 30px; text-align: center;">
                <img src="https://via.placeholder.com/150x40/111827/ffffff?text=CONTENTFORGE" alt="ContentForge Logo" style="height: 30px; margin-bottom: 10px;" />
                <h1 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 600;">Workspace Unlocked</h1>
              </div>

              <div style="padding: 40px 30px;">
                <p style="font-size: 16px; color: #374151; line-height: 1.6; margin-top: 0;">
                  Hi ${orderNotes.customerName},
                </p>
                <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                  Welcome to the <strong>ContentForge ${planName}</strong> tier. Your payment was successfully processed, and your account has been instantly upgraded. You now have access to the weapons-grade strategist architecture.
                </p>

                <div style="margin: 32px 0; background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 24px;">
                  <h3 style="margin-top: 0; font-size: 13px; text-transform: uppercase; color: #EA580C; letter-spacing: 1px;">What you can do right now:</h3>
                  <ul style="padding-left: 20px; color: #374151; font-size: 15px; line-height: 1.8; margin-bottom: 0;">
                    <li><strong>Set your Brand DNA:</strong> Train the engine on your exact tone, niche, and contrarian beliefs.</li>
                    <li><strong>Deploy the War Room:</strong> Use the multi-agent system to strategize, write, and brutally critique your content simultaneously.</li>
                    <li><strong>Run the Stop-Scroll Grader:</strong> Never post a weak hook again. Get an objective out-of-10 score before you publish.</li>
                    <li><strong>BYOK Wholesale Mode:</strong> Configure your Anthropic or OpenAI API keys in the settings to generate content at zero markup.</li>
                  </ul>
                </div>

                <h3 style="font-size: 18px; color: #111827; margin-bottom: 16px; border-bottom: 2px solid #F3F4F6; padding-bottom: 8px;">Order Receipt</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 15px;">
                  <tr>
                    <td style="padding: 12px 0; color: #4B5563; border-bottom: 1px solid #F3F4F6;">ContentForge ${planName} Plan</td>
                    <td style="padding: 12px 0; color: #111827; text-align: right; font-weight: 500; border-bottom: 1px solid #F3F4F6;">$${orderNotes.baseAmount}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0; color: #4B5563; border-bottom: 1px solid #F3F4F6;">Tax (18% IGST)</td>
                    <td style="padding: 12px 0; color: #111827; text-align: right; font-weight: 500; border-bottom: 1px solid #F3F4F6;">$${orderNotes.taxAmount}</td>
                  </tr>
                  <tr>
                    <td style="padding: 16px 0; color: #111827; font-weight: 600; font-size: 18px;">Total Paid</td>
                    <td style="padding: 16px 0; color: #111827; text-align: right; font-weight: 600; font-size: 18px;">$${orderNotes.totalAmount}</td>
                  </tr>
                </table>
                
                <p style="font-size: 13px; color: #6B7280; line-height: 1.5; background: #EFF6FF; padding: 12px; border-radius: 6px;">
                  <strong>Auto-Renewal Notice:</strong> Your subscription will automatically renew on <strong>${orderNotes.nextBillingDate}</strong> for $${orderNotes.totalAmount}. You can cancel anytime directly in your dashboard settings.
                </p>

                <div style="text-align: center; margin-top: 40px;">
                  <a href="https://yourdomain.com/dashboard" style="background-color: #111827; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 500; font-size: 16px; display: inline-block;">Open Workspace</a>
                </div>
              </div>

              <div style="background-color: #F9FAFB; border-top: 1px solid #E5E7EB; padding: 20px; text-align: center;">
                <p style="font-size: 12px; color: #9CA3AF; margin: 0; line-height: 1.5;">
                  <strong>SHV Groups Pvt Ltd</strong><br/>
                  New Delhi, India<br/>
                  Order ID: ${payment.order_id}
                </p>
                <p style="font-size: 12px; color: #9CA3AF; margin-top: 8px;">
                  Need help? Reply to this email at <a href="mailto:contact@shvgroups.com" style="color: #6B7280;">contact@shvgroups.com</a>.
                </p>
              </div>
            </div>
          </body>
          </html>
        `
      };

      // Execute the email send
      await transporter.sendMail(mailOptions);
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error: any) {
    console.error('Webhook / Mail Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}