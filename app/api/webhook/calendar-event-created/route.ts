// app/api/webhooks/calendar-event-created/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sendCalendarEmail } from '@/lib/mail-service';

export async function POST(req: NextRequest) {
  // Verify this request actually came from Supabase, not a random POST
  const secret = req.headers.get('x-webhook-secret');
  if (secret !== process.env.SUPABASE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const event = body.record; // the newly inserted calendar_events row

  if (!event?.user_id) return NextResponse.json({ skipped: true });

  const supabase = createServerClient();
  const { data: userData } = await supabase.auth.admin.getUserById(event.user_id);
  const email = userData?.user?.email;
  if (!email) return NextResponse.json({ skipped: true });

  const name = userData?.user?.user_metadata?.full_name?.split(' ')[0] || email.split('@')[0];

  try {
    await sendCalendarEmail(email, name, {
      title: event.title,
      start_date: event.start_date,
      type: event.type,
      platform: event.platform,
      description: event.description,
    });
  } catch (err) {
    console.error('[CALENDAR EMAIL] Failed to send:', err);
  }

  return NextResponse.json({ sent: true });
}