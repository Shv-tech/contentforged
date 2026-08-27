// lib/calendar-tools.ts
import { createClient } from '@supabase/supabase-js';
import { sendCalendarDigestEmail } from '@/lib/mail-service';

// Dedicated service-role client — bypasses RLS by design, since the route
// itself enforces the user scope on every call. NEVER expose this key to
// the browser and NEVER prefix it with NEXT_PUBLIC_. Get it from Supabase
// dashboard -> Project Settings -> API -> service_role (secret) key.
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const TYPE_VALUES = ['post', 'deadline', 'meeting', 'task'] as const;
const TYPE_COLORS: Record<string, string> = {
  post: '#D18A5E', deadline: '#E05555', meeting: '#5588E0', task: '#55AA77',
};

// ============================================================
// EXECUTORS — every call is hard-scoped to userId, supplied by the route.
// ============================================================

export async function getCalendarEvents(
  args: { start_date: string; end_date: string; query?: string },
  userId: string
) {
  const supabase = getServiceClient();
  let q = supabase
    .from('calendar_events')
    .select('id, title, description, start_date, type, platform, status')
    .eq('user_id', userId)
    .gte('start_date', args.start_date)
    .lte('start_date', args.end_date)
    .order('start_date');

  if (args.query) {
    q = q.or(`title.ilike.%${args.query}%,description.ilike.%${args.query}%`);
  }

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, count: data.length, events: data };
}

export async function createCalendarEvent(
  args: {
    title: string; description?: string; start_date: string;
    type?: string; platform?: string; reminder_minutes_before?: number;
    post_content?: string;
    hook_score?: number; hook_verdict?: string; hook_notes?: string;
  },
  userId: string
) {
  const supabase = getServiceClient();
  const type = TYPE_VALUES.includes(args.type as any) ? args.type! : 'task';

  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      user_id: userId,
      title: args.title,
      description: args.description || null,
      start_date: args.start_date,
      type,
      platform: args.platform || null,
      color: TYPE_COLORS[type],
      ai_generated: true,
      reminder_minutes_before: args.reminder_minutes_before ?? 60,
      // The publishable draft, stored on the event itself.
      //
      // Previously an event carried only a title and a one-line angle, so on
      // the morning it was due the user had a label rather than something to
      // post, and had to dig the actual draft out of the chat session it was
      // planned in. The reminder email reads this field.
      post_content: args.post_content || null,
      hook_score: args.hook_score ?? null,
      hook_verdict: args.hook_verdict || null,
      hook_notes: args.hook_notes || null,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, event: data };
}

export async function createCalendarEventsBulk(
  args: {
    campaign_name?: string;
    events: Array<{
      title: string; description?: string; start_date: string;
      type?: string; platform?: string;
      post_content?: string;
      hook_score?: number; hook_verdict?: string; hook_notes?: string;
    }>;
  },
  userId: string,
  userEmail: string,
  userName: string
) {
  const supabase = getServiceClient();

  const rows = args.events.map(e => {
    const type = TYPE_VALUES.includes(e.type as any) ? e.type! : 'post';
    return {
      user_id: userId,
      title: e.title,
      description: e.description || null,
      start_date: e.start_date,
      type,
      platform: e.platform || null,
      color: TYPE_COLORS[type],
      ai_generated: true,
      notify_individually: false, // suppressed — digest sent below instead
      reminder_minutes_before: 60,
      // Each event carries its own draft, so a seven day plan produces seven
      // cards each holding the post that belongs to it. The reminder job then
      // delivers the right draft at the right time without regenerating
      // anything.
      post_content: e.post_content || null,
      hook_score: e.hook_score ?? null,
      hook_verdict: e.hook_verdict || null,
      hook_notes: e.hook_notes || null,
    };
  });

  const { data, error } = await supabase.from('calendar_events').insert(rows).select();
  if (error) return { success: false, error: error.message };

  try {
    await sendCalendarDigestEmail(userEmail, userName, {
      campaignName: args.campaign_name || 'Your new schedule',
      events: data.map((e: any) => ({ title: e.title, start_date: e.start_date, type: e.type })),
    });
  } catch (err) {
    console.error('[CALENDAR DIGEST] Failed to send:', err);
  }

  return { success: true, count: data.length, events: data };
}

export async function updateCalendarEvent(
  args: {
    event_id: string; title?: string; description?: string;
    start_date?: string; type?: string; platform?: string;
  },
  userId: string
) {
  const supabase = getServiceClient();
  const updates: Record<string, any> = {};
  if (args.title) updates.title = args.title;
  if (args.description !== undefined) updates.description = args.description;
  if (args.start_date) updates.start_date = args.start_date;
  if (args.type && TYPE_VALUES.includes(args.type as any)) {
    updates.type = args.type;
    updates.color = TYPE_COLORS[args.type];
  }
  if (args.platform !== undefined) updates.platform = args.platform;

  const { data, error } = await supabase
    .from('calendar_events')
    .update(updates)
    .eq('id', args.event_id)
    .eq('user_id', userId) // can never touch another user's row, regardless of what id is passed in
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, event: data };
}

export async function deleteCalendarEvents(
  args: {
    event_ids?: string[]; start_date?: string; end_date?: string; title_contains?: string;
  },
  userId: string
) {
  const supabase = getServiceClient();
  let q = supabase.from('calendar_events').delete().eq('user_id', userId);

  if (args.event_ids?.length) {
    q = q.in('id', args.event_ids);
  } else if (args.start_date && args.end_date) {
    q = q.gte('start_date', args.start_date).lte('start_date', args.end_date);
    if (args.title_contains) q = q.ilike('title', `%${args.title_contains}%`);
  } else {
    return { success: false, error: 'Must provide either event_ids or a start_date/end_date range.' };
  }

  const { data, error } = await q.select();
  if (error) return { success: false, error: error.message };
  return { success: true, deletedCount: data.length };
}

// ============================================================
// ANTHROPIC TOOL SCHEMAS
// ============================================================

// lib/calendar-tools.ts (append) or wherever you assemble system prompts

/**
 * @param timezone IANA zone for the user, e.g. 'Asia/Kolkata'. Defaults to UTC.
 *
 * Both the date and the offset below are rendered IN THE USER'S ZONE. Without
 * it the model computed "tomorrow" and "10 AM" against UTC, so an IST user
 * asking for a 10 AM post got 10:00 UTC, which is 3:30pm to them, with
 * nothing in the interface explaining why.
 */
export function getCalendarAgentPrompt(timezone: string = 'UTC'): string {
  const now = new Date();

  // Validated before use, and falls back rather than throwing.
  //
  // Intl raises RangeError on an unknown zone. Since this prompt is built on
  // the hot path of every chat request, an unrecognized value stored on a
  // profile would take down the whole conversation rather than just degrade
  // the calendar, and the error would point here instead of at the bad data.
  // The write endpoint validates too; this is the second line of defence for
  // values that predate it or arrive by some other route.
  let zone = timezone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
  } catch {
    console.warn(`[calendar] Unrecognized timezone "${timezone}", falling back to UTC.`);
    zone = 'UTC';
  }

  // Formatted in the user's zone so "today" means their today, not the
  // server's. A user in Asia scheduling late at night is otherwise told the
  // date is still yesterday.
  const todayStr = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: zone,
  });

  // The literal UTC offset, computed rather than looked up, so it stays
  // correct across daylight saving transitions in zones that observe them.
  const offsetLabel = (() => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, timeZoneName: 'longOffset',
      }).formatToParts(now);
      return parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
    } catch {
      return 'GMT+00:00';
    }
  })();

  return `
CALENDAR INTELLIGENCE — TODAY'S ACTUAL DATE IS ${todayStr}.
Always compute relative dates ("next month", "in 3 months", "every Tuesday") from this real date, never from assumption.

TIMEZONE — THE USER IS IN ${zone} (${offsetLabel}).
Every time the user states is in THEIR local time. "10 AM" means 10 AM in ${zone}, not UTC.

When you pass start_date to a tool, convert that local time to a UTC ISO 8601 datetime ending in Z. For example, if the user is in Asia/Kolkata (GMT+05:30) and asks for 10:00 AM on 12 September 2026, pass "2026-09-12T04:30:00Z".

Getting this wrong is invisible to the user until their post fires at the wrong hour, so do the conversion carefully and state the local time back to them in your summary ("scheduled for 10:00 AM your time") so they can catch a mistake immediately.

You have full read/write access to the user's content calendar. Use it proactively whenever a conversation implies scheduling — launches, campaigns, deadlines, recurring posts — even if the user doesn't explicitly say "add this to my calendar."

WORKFLOW FOR MULTI-EVENT PLANNING (launches, campaigns, content calendars):
1. Gather what you actually need before touching the calendar: the goal, the timeframe, the cadence or frequency, which platforms. Ask only for what's missing — don't interrogate for things the user already told you.
2. Call get_calendar_events across the full date range first, so you never schedule on top of something that's already there.
3. Once you have enough to plan, build out the full list of events yourself — compute every specific date and time, don't ask the user to enumerate them.
4. Call create_calendar_events_bulk exactly once with the complete plan. Never loop single create_calendar_event calls for something with this many events.
5. After the tool returns, summarize what you scheduled in plain language directly in the chat — don't just say "done," tell them the shape of the plan (e.g. "12 LinkedIn posts every Tuesday/Friday from now through the launch date, plus a deadline 3 days before for final assets").

FOR SINGLE EVENTS: just use create_calendar_event directly, no need for the full workflow above.

FOR DESTRUCTIVE ACTIONS (delete_calendar_events): always confirm with the user in plain language what you're about to remove before calling the tool, unless they were extremely explicit (e.g. "delete the meeting on July 4th" is explicit enough; "clean up my calendar" is not).

WRITING THE ACTUAL POSTS (this is the part that matters most):
When you schedule an event of type "post", you MUST write the full, publishable draft and pass it as post_content. Not an outline. Not a description of what the post should say. The finished text, ready to copy and publish.

- title stays short: it is the label on the calendar card, e.g. "LinkedIn: pre-launch testing".
- description stays short: the angle or hook in one line, for scanning the calendar.
- post_content is the real deliverable: the complete post, in the user's voice, formatted for its platform, following every rule in your platform DNA library.

Also grade your own hook and pass hook_score (0-50), hook_verdict (PUBLISH, REVISE or SCRAP) and hook_notes (one sentence naming the weakest thing about it). Grade honestly. A generous score you do not believe is worth nothing to the user and teaches them to ignore the number.

Write every post in the batch. A seven day plan means seven finished drafts, not one draft and six titles. This is slower than writing headlines, and it is the difference between a calendar the user has to finish themselves and one that does the work.

The user receives each draft by email at their reminder time, so a card with no post_content arrives as an empty reminder.

Default event time is 9:00 AM in the absence of a stated preference. Default reminder is 60 minutes before. State these defaults when you use them so the user can correct you if they want something different.
`;
}

export const calendarTools = [
  {
    name: 'get_calendar_events',
    description: "Reads the user's existing calendar within a date range, optionally filtered by a keyword. ALWAYS call this before creating or bulk-scheduling events so you know what's already booked and never double-book or duplicate. Also use this to answer any question about what's already scheduled.",
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'ISO 8601 date, e.g. 2026-07-01' },
        end_date: { type: 'string', description: 'ISO 8601 date, e.g. 2026-09-30' },
        query: { type: 'string', description: 'Optional keyword to filter by title or description' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Creates a single calendar event. Use for one-off requests like "schedule a LinkedIn post for Friday." For anything with multiple events — a campaign, a multi-week plan — use create_calendar_events_bulk instead. It is far more efficient and sends one clean summary email instead of spamming the user.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        start_date: { type: 'string', description: 'ISO 8601 datetime, e.g. 2026-07-04T09:00:00' },
        type: { type: 'string', enum: ['post', 'deadline', 'meeting', 'task'] },
        platform: { type: 'string', description: 'e.g. LinkedIn, Instagram, Twitter, Email' },
        reminder_minutes_before: { type: 'integer', description: 'Minutes before the event to send a reminder. Default 60.' },
        post_content: { type: 'string', description: 'REQUIRED for type "post": the complete, publishable draft, ready to copy and post. Not an outline or a summary. This is what gets emailed to the user at reminder time.' },
        hook_score: { type: 'integer', description: 'Your honest grade for the opening line, 0-50.' },
        hook_verdict: { type: 'string', enum: ['PUBLISH', 'REVISE', 'SCRAP'] },
        hook_notes: { type: 'string', description: 'One sentence naming the weakest thing about the hook.' },
      },
      required: ['title', 'start_date'],
    },
  },
  {
    name: 'create_calendar_events_bulk',
    description: 'Creates many calendar events in one call. This is the primary tool for planning campaigns, launches, or any multi-event schedule spanning days, weeks, or months. ALWAYS use this instead of calling create_calendar_event in a loop. For every event of type "post", write the complete publishable draft into post_content: the user receives that draft by email at reminder time, and a card without one arrives empty.',
    input_schema: {
      type: 'object',
      properties: {
        campaign_name: { type: 'string', description: 'Short name for this batch, e.g. "Q3 Product Launch". Used as the email subject.' },
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              start_date: { type: 'string', description: 'ISO 8601 datetime' },
              type: { type: 'string', enum: ['post', 'deadline', 'meeting', 'task'] },
              platform: { type: 'string' },
              post_content: { type: 'string', description: 'REQUIRED for type "post": the complete, publishable draft, ready to copy and post. Not an outline or a summary. This is what gets emailed to the user at reminder time.' },
              hook_score: { type: 'integer', description: 'Your honest grade for the opening line, 0-50.' },
              hook_verdict: { type: 'string', enum: ['PUBLISH', 'REVISE', 'SCRAP'] },
              hook_notes: { type: 'string', description: 'One sentence naming the weakest thing about the hook.' },
            },
            required: ['title', 'start_date'],
          },
        },
      },
      required: ['events'],
    },
  },
  {
    name: 'update_calendar_event',
    description: 'Updates an existing event by id — reschedule, rename, change type/platform/description. Get the event_id from get_calendar_events first.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        start_date: { type: 'string' },
        type: { type: 'string', enum: ['post', 'deadline', 'meeting', 'task'] },
        platform: { type: 'string' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'delete_calendar_events',
    description: "Deletes one or more events. Provide event_ids (from get_calendar_events) OR a start_date/end_date range, optionally narrowed with title_contains. Confirm with the user before deleting anything they didn't explicitly ask to remove.",
    input_schema: {
      type: 'object',
      properties: {
        event_ids: { type: 'array', items: { type: 'string' } },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        title_contains: { type: 'string' },
      },
    },
  },
];