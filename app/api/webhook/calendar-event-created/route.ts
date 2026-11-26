/**
 * app/api/webhook/calendar-event-created/route.ts
 *
 * Supabase database webhook, fired when a row is inserted into
 * calendar_events. Emails the owner a confirmation of what they scheduled.
 *
 * Configure it in Supabase under Database, Webhooks: an HTTP request on
 * INSERT into public.calendar_events, with the header x-webhook-secret set to
 * SUPABASE_WEBHOOK_SECRET.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { safeEqualHeader } from '@/lib/forge/http';
import { sendCalendarEmail } from '@/lib/mail-service';
import { createServiceClient } from '@/lib/supabase/service';
import { observed } from '@/lib/ops/observe';

interface CalendarEventRow {
  user_id?: string;
  title?: string;
  start_date?: string;
  type?: string;
  platform?: string;
  description?: string;
}

async function handlePOST(req: Request) {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'SUPABASE_WEBHOOK_SECRET is not configured.' }, { status: 503 });
  if (!safeEqualHeader(req.headers.get('x-webhook-secret'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let event: CalendarEventRow | undefined;
  try {
    event = ((await req.json()) as { record?: CalendarEventRow }).record;
  } catch {
    return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
  }
  if (!event?.user_id) return NextResponse.json({ skipped: true });

  // Looking up another user's email is an admin call, so it needs the
  // service-role client; the publishable key cannot make it.
  const { data } = await createServiceClient().auth.admin.getUserById(event.user_id);
  const user = data?.user;
  const email = user?.email;
  if (!user || !email) return NextResponse.json({ skipped: true });

  const fullName = user.user_metadata?.full_name;
  const name = typeof fullName === 'string' && fullName.trim() ? fullName.trim().split(/\s+/)[0] : email.split('@')[0];

  try {
    await sendCalendarEmail(email, name, {
      title: event.title ?? 'Scheduled post',
      start_date: event.start_date ?? new Date().toISOString(),
      type: event.type ?? 'post',
      platform: event.platform ?? '',
      description: event.description ?? '',
    });
  } catch (error) {
    console.error('[webhook/calendar-event-created] Email failed:', error);
    return NextResponse.json({ sent: false });
  }

  return NextResponse.json({ sent: true });
}

export const POST = observed('api/webhook/calendar-event-created', handlePOST);
