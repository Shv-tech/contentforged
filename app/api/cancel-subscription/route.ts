import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    // Downgrade the user to the free tier and reset credits
    const { error } = await supabase
      .from('users')
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