// app/api/user/timezone/route.ts

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { observed } from '@/lib/ops/observe';

/**
 * Records the user's IANA timezone.
 *
 * WHY THE BROWSER AND NOT A SETTING
 *
 * Asking someone to pick their timezone from a dropdown during signup is
 * friction for information the browser already knows and rarely gets wrong.
 * The value is detected client-side and posted here once per session.
 *
 * WHAT IT IS FOR
 *
 * Interpreting instructions and rendering times, NOT delivering reminders.
 * calendar_events.start_date is timestamptz, so "one hour before" is already
 * an absolute comparison that works regardless of where anyone is. This
 * matters for the other direction: when a user says "schedule it at 10 AM",
 * something has to decide which 10 AM. Without this, an IST user asking for
 * 10 AM gets 10:00 UTC, which is 3:30pm to them, and they have no way to tell
 * why.
 */
async function handlePOST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { timezone?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const timezone = body.timezone;

  if (typeof timezone !== 'string' || timezone.length === 0 || timezone.length > 64) {
    return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
  }

  // Validated by asking the runtime to use it. A bad value stored here would
  // surface much later as events scheduled at the wrong hour, or as a crash
  // inside the reminder job, with nothing pointing back to the cause.
  //
  // Intl throws RangeError on an unknown zone, which is exactly the check we
  // want and avoids shipping a hardcoded list that goes stale as zones change.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    return NextResponse.json({ error: 'Unrecognized timezone' }, { status: 400 });
  }

  // Service client because profiles has no user-facing UPDATE policy for this
  // column, and adding one would let a client write arbitrary values.
  const service = createServiceClient();

  const { error } = await service
    .from('profiles')
    .update({ timezone })
    .eq('id', user.id);

  if (error) {
    console.error('[user/timezone] Update failed:', error);
    return NextResponse.json({ error: 'Could not save timezone' }, { status: 500 });
  }

  return NextResponse.json({ timezone });
}

export const POST = observed('api/user/timezone', handlePOST);
