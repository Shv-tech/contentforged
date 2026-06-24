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
    };
  });

  const { data, error } = await supabase.from('calendar_events').insert(rows).select();
  if (error) return { success: false, error: error.message };

  try {
    await sendCalendarDigestEmail(userEmail, userName, {
      campaignName: args.campaign_name || 'Your new schedule',
      events: data.map(e => ({ title: e.title, start_date: e.start_date, type: e.type })),
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

export function getCalendarAgentPrompt(): string {
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return `
CALENDAR INTELLIGENCE — TODAY'S ACTUAL DATE IS ${todayStr}.
Always compute relative dates ("next month", "in 3 months", "every Tuesday") from this real date, never from assumption.

You have full read/write access to the user's content calendar. Use it proactively whenever a conversation implies scheduling — launches, campaigns, deadlines, recurring posts — even if the user doesn't explicitly say "add this to my calendar."

WORKFLOW FOR MULTI-EVENT PLANNING (launches, campaigns, content calendars):
1. Gather what you actually need before touching the calendar: the goal, the timeframe, the cadence or frequency, which platforms. Ask only for what's missing — don't interrogate for things the user already told you.
2. Call get_calendar_events across the full date range first, so you never schedule on top of something that's already there.
3. Once you have enough to plan, build out the full list of events yourself — compute every specific date and time, don't ask the user to enumerate them.
4. Call create_calendar_events_bulk exactly once with the complete plan. Never loop single create_calendar_event calls for something with this many events.
5. After the tool returns, summarize what you scheduled in plain language directly in the chat — don't just say "done," tell them the shape of the plan (e.g. "12 LinkedIn posts every Tuesday/Friday from now through the launch date, plus a deadline 3 days before for final assets").

FOR SINGLE EVENTS: just use create_calendar_event directly, no need for the full workflow above.

FOR DESTRUCTIVE ACTIONS (delete_calendar_events): always confirm with the user in plain language what you're about to remove before calling the tool, unless they were extremely explicit (e.g. "delete the meeting on July 4th" is explicit enough; "clean up my calendar" is not).

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
      },
      required: ['title', 'start_date'],
    },
  },
  {
    name: 'create_calendar_events_bulk',
    description: 'Creates many calendar events in one call. This is the primary tool for planning campaigns, launches, or any multi-event schedule spanning days, weeks, or months. ALWAYS use this instead of calling create_calendar_event in a loop — it sends the user one organized summary email instead of one per event.',
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