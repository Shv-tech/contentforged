import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { addMonths, format } from 'date-fns';

export async function POST(req: Request) {
  try {
    // 1. Initialize Razorpay INSIDE the request handler
    const razorpay = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
      key_secret: process.env.RAZORPAY_KEY_SECRET || '',
    });

    const { planId, baseAmount, email, name } = await req.json();

    // Calculate the exact math (Base + 18% Tax)
    const taxRate = 0.18;
    const taxAmount = parseFloat((baseAmount * taxRate).toFixed(2));
    const totalAmount = parseFloat((baseAmount + taxAmount).toFixed(2));

    // Razorpay expects the smallest currency sub-unit (cents/paise)
    const amountInCents = Math.round(totalAmount * 100);

    // Create the secure order
    const order = await razorpay.orders.create({
      amount: amountInCents,
      currency: 'USD', 
      receipt: `cf_rcpt_${Date.now()}`,
      notes: {
        planId,
        baseAmount: baseAmount.toString(),
        taxAmount: taxAmount.toString(),
        totalAmount: totalAmount.toString(),
        customerEmail: email || '',
        customerName: name || 'Creator',
        nextBillingDate: format(addMonths(new Date(), 1), 'MMM dd, yyyy')
      }
    });

    // Send the math back to the frontend for the invoice
    return NextResponse.json({
      orderId: order.id,
      currency: order.currency,
      amount: order.amount,
      breakdown: {
        base: baseAmount,
        tax: taxAmount,
        total: totalAmount,
        nextBillingDate: order.notes!.nextBillingDate
      }
    });

  } catch (error: any) {
    console.error("Razorpay Generation Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}