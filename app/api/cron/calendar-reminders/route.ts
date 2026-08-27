// app/api/cron/calendar-reminders/route.ts

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { sendScheduledPostEmail } from '@/lib/mail-service';

/**
 * Sends reminders for events whose reminder time has arrived.
 *
 * TIMEZONES ARE NOT HANDLED HERE, ON PURPOSE
 *
 * start_date is timestamptz, so it already denotes an absolute instant. A
 * reminder is due when:
 *
 *   now >= start_date - reminder_minutes_before
 *
 * which is correct for every user regardless of where they are. An earlier
 * version bucketed events into a UTC "day" and mailed everyone at a fixed
 * hour. That was both more code and unable to express "one hour before",
 * which the UI already offers.
 *
 * The user's timezone still matters for interpreting "10 AM" when an event is
 * created, and for rendering times in the email. Those happen elsewhere.
 *
 * RUN FREQUENCY
 *
 * Every five minutes. A daily run cannot deliver an offset reminder, and
 * Vercel's Hobby plan caps crons at one per day, so this is scheduled from
 * Supabase pg_cron instead. See calendar-reminders-migration.sql.
 */

interface DueEvent {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  post_content: string | null;
  hook_score: number | null;
  hook_verdict: string | null;
  hook_notes: string | null;
  start_date: string;
  platform: string | null;
  type: string | null;
  reminder_minutes_before: number | null;
}

/**
 * How far back to look for reminders that came due while the job was not
 * running.
 *
 * Without a floor, a deploy or outage spanning hours would fire every missed
 * reminder at once the moment the job resumed, including for posts already
 * published. Six hours catches a realistic gap; older than that, a late
 * reminder is worse than none.
 */
const CATCHUP_WINDOW_HOURS = 6;

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Without this the endpoint is a public trigger. reminder_sent_at prevents
  // duplicate sends, so damage is bounded, but there is no reason to leave it
  // open.
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();

  // Fetch a bounded window, then filter precisely in code.
  //
  // The exact condition depends on each row's own reminder_minutes_before,
  // which PostgREST cannot express as a column-to-column comparison. Bounding
  // the window keeps this a small result set: anything starting more than a
  // day out cannot be due under any sane offset.
  const windowStart = new Date(now.getTime() - CATCHUP_WINDOW_HOURS * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { data: candidates, error } = await supabase
    .from('calendar_events')
    .select(
      'id, user_id, title, description, post_content, hook_score, hook_verdict, hook_notes, start_date, platform, type, reminder_minutes_before'
    )
    .gte('start_date', windowStart.toISOString())
    .lte('start_date', windowEnd.toISOString())
    .is('reminder_sent_at', null)
    .order('start_date');

  if (error) {
    console.error('[cron/calendar-reminders] Query failed:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const due = (candidates ?? []).filter((event: DueEvent) => {
    // NULL means reminders are off for this event, which is different from an
    // offset of zero.
    if (event.reminder_minutes_before == null) return false;

    const startsAt = new Date(event.start_date).getTime();
    const remindAt = startsAt - event.reminder_minutes_before * 60 * 1000;
    const elapsed = now.getTime() - remindAt;

    // Upper bound as well as lower: a reminder whose moment passed hours ago,
    // because the job was down, is not worth sending late.
    return elapsed >= 0 && elapsed < CATCHUP_WINDOW_HOURS * 60 * 60 * 1000;
  });

  if (due.length === 0) {
    return NextResponse.json({ sent: 0, users: 0 });
  }

  // Grouped per user. Two posts an hour apart would otherwise arrive as two
  // emails, and reminders that arrive in bulk stop being read.
  const byUser = new Map<string, DueEvent[]>();
  for (const event of due) {
    const existing = byUser.get(event.user_id) ?? [];
    existing.push(event);
    byUser.set(event.user_id, existing);
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const [userId, userEvents] of byUser) {
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      const email = userData?.user?.email;

      if (!email) {
        console.warn(`[cron/calendar-reminders] No email for user ${userId}, skipping.`);
        continue;
      }

      const meta = userData?.user?.user_metadata ?? {};
      const name =
        meta.full_name?.split(' ')[0] ||
        meta.name?.split(' ')[0] ||
        email.split('@')[0];

      // Timezone is read only to render times in the email. Delivery timing
      // does not depend on it.
      const { data: profile } = await supabase
        .from('profiles')
        .select('timezone')
        .eq('id', userId)
        .maybeSingle();

      await sendScheduledPostEmail(email, name, userEvents, profile?.timezone ?? 'UTC');

      // Stamped only after the send resolves. Stamping first would let a
      // provider outage silently consume the reminder, and the user would
      // never hear about a post they scheduled.
      await supabase
        .from('calendar_events')
        .update({ reminder_sent_at: new Date().toISOString() })
        .in('id', userEvents.map((e) => e.id));

      sentCount += userEvents.length;
    } catch (sendError) {
      failedCount++;
      // Not rethrown: one user's failure must not abort the run for everyone
      // else. Their events stay unstamped and retry in five minutes.
      console.error(`[cron/calendar-reminders] Send failed for user ${userId}:`, sendError);
    }
  }

  console.log(
    `[cron/calendar-reminders] ${sentCount} events, ${byUser.size} users, ${failedCount} failed.`
  );

  return NextResponse.json({ sent: sentCount, users: byUser.size, failed: failedCount });
}