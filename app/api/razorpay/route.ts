import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { PRICING } from '@/types';

export async function POST(req: NextRequest) {
  try {
    // 1. Initialize Razorpay INSIDE the request handler to prevent Next.js build crashes
    const razorpay = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || '',
      key_secret: process.env.RAZORPAY_KEY_SECRET || '',
    });

    const { tier_id, user_id } = await req.json();

    const tier = PRICING.find((t) => t.id === tier_id);
    if (!tier) {
      return NextResponse.json({ error: 'Invalid plan selected.' }, { status: 400 });
    }

    const order = await razorpay.orders.create({
      amount: tier.price * 100,
      currency: 'USD',
      receipt: `cf_${user_id}_${Date.now()}`,
      notes: { tier_id, user_id },
    });

    return NextResponse.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (err: any) {
    console.error('[razorpay] Order error:', err.message);
    return NextResponse.json({ error: 'Could not create payment. Try again.' }, { status: 500 });
  }
}