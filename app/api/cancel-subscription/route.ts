// app/api/cancel-subscription/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server'; // FIX: Swapped to the correct App Router Client

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(); // FIX: Initialize the correct client

    // FIX: Downgrade the user in the PROFILES table, not the users table
    const { error } = await supabase
      .from('profiles')
      .update({
        plan: 'free',
        credits_remaining: 5,
      })
      .eq('id', userId);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Subscription cancelled.' });
  } catch (error: any) {
    console.error('Cancellation Error:', error.message);
    return NextResponse.json({ error: 'Failed to cancel subscription.' }, { status: 500 });
  }
}