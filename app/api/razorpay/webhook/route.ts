import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { sendBillingEmail } from '@/lib/mail-service';

export async function POST(req: Request) {
  try {
    const bodyText = await req.text();
    const razorpaySignature = req.headers.get('x-razorpay-signature');
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET!;

    if (!razorpaySignature) return NextResponse.json({ error: 'No signature' }, { status: 400 });

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(bodyText)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const body = JSON.parse(bodyText);
    const event = body.event;
    
    // Extract common metadata (Assuming you pass these as 'notes' in Razorpay)
    const payload = body.payload;
    const entity = payload.payment?.entity || payload.invoice?.entity || payload.subscription?.entity;
    const customerEmail = entity?.email || entity?.customer_details?.email;
    const customerName = entity?.notes?.customerName || 'Strategist';

    switch (event) {
      case 'invoice.paid':
        const amountFormatted = new Intl.NumberFormat('en-IN', {
          style: 'currency', currency: 'INR', maximumFractionDigits: 0,
        }).format(entity.amount / 100);

        await sendBillingEmail('invoice', customerEmail, customerName, {
          amount: amountFormatted,
          pdfUrl: entity.short_url
        });
        break;

      case 'subscription.charged':
        // Welcome email only on the very first charge
        if (entity.charge_at === entity.start_at) {
          await sendBillingEmail('welcome', customerEmail, customerName, {
            planName: entity.notes?.planName || 'Pro'
          });
        }
        break;

      case 'subscription.pending':
        // Payment failed or is retrying
        await sendBillingEmail('due', customerEmail, customerName);
        break;

      case 'subscription.paused':
        await sendBillingEmail('paused', customerEmail, customerName);
        break;

      case 'subscription.cancelled':
        await sendBillingEmail('canceled', customerEmail, customerName);
        break;
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}