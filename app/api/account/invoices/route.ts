/**
 * app/api/account/invoices/route.ts
 *
 * GET  every invoice Razorpay raised for the person's subscriptions, newest
 *      first, each with a link to its hosted page and PDF.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { listInvoices } from '@/lib/billing/razorpay';
import { requireUser, route } from '@/lib/forge/http';

export const GET = route('api/account/invoices', async (req: Request) => {
  const ctx = await requireUser(req);
  const { data: subscriptions } = await createServiceClient()
    .from('subscriptions')
    .select('razorpay_subscription_id')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .limit(10);
  const ids = (subscriptions ?? []).map((s) => s.razorpay_subscription_id as string).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ invoices: [] });

  try {
    return NextResponse.json({ invoices: await listInvoices(ids) });
  } catch (error) {
    console.error('[api/account/invoices]', error);
    return NextResponse.json({ invoices: [], unavailable: true });
  }
});
