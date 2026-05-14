import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server'; // FIX: Swapped to the correct App Router Client
import { PRICING } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, tier_id, user_id } =
      await req.json();

    // Verify signature
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) {
      return NextResponse.json({ error: 'Invalid payment signature.' }, { status: 400 });
    }

    const tier = PRICING.find((t) => t.id === tier_id);
    if (!tier) {
      return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 });
    }

    const supabase = createClient(); // FIX: Initialize the correct client

    // FIX: Update user plan + credits in the PROFILES table
    await supabase
      .from('profiles')
      .update({
        plan: tier_id,
        credits_remaining: tier.credits,
      })
      .eq('id', user_id);

    // Log payment
    await supabase.from('payments').insert({
      user_id,
      razorpay_order_id,
      razorpay_payment_id,
      tier_id,
      amount: tier.price,
    });

    return NextResponse.json({ success: true, plan: tier_id, credits: tier.credits });
  } catch (err: any) {
    console.error('[razorpay/verify] Error:', err.message);
    return NextResponse.json({ error: 'Verification failed.' }, { status: 500 });
  }
}