/**
 * lib/forge/scheduling.ts
 *
 * Putting a draft on the calendar. Used by the schedule button, by approving
 * a weekly plan draft (which schedules it at the slot the plan suggested),
 * and by the API.
 *
 * A scheduled draft gets a calendar event with a reminder. When the person
 * opted in and the platform is connected, the publish job also posts it at
 * that time; X is never published automatically.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getCredential } from './connections';
import { draftText, updateDraft } from './data/drafts';
import { HttpError } from './http';
import { requireBrandFeature } from './plan';
import { PLATFORM_NAMES, VERDICT_LABELS, type DraftRecord } from './types';

export interface ScheduleOptions {
  at: string;
  reminderMinutes: number | null;
  autoPublish: boolean;
}

export async function scheduleDraft(db: SupabaseClient, actorId: string, draft: DraftRecord, options: ScheduleOptions): Promise<DraftRecord> {
  if (draft.status === 'posted') throw new HttpError(409, 'This draft has already been posted.');
  const at = new Date(options.at);
  if (Number.isNaN(at.getTime())) throw new HttpError(400, 'That is not a valid time.');

  if (options.autoPublish) {
    if (draft.platform !== 'linkedin' && draft.platform !== 'threads' && draft.platform !== 'bluesky') {
      throw new HttpError(400, `${PLATFORM_NAMES[draft.platform]} posts cannot be published automatically. You will get a reminder instead.`);
    }
    await requireBrandFeature(actorId, draft.workspace_id, 'publishing');
    if (!(await getCredential(actorId, draft.workspace_id, draft.platform))) {
      throw new HttpError(409, `Connect ${PLATFORM_NAMES[draft.platform]} first to publish automatically.`);
    }
  }

  const text = draftText(draft);
  const title =
    draft.title ||
    text
      .split('\n')
      .find((l) => l.trim())
      ?.trim()
      .slice(0, 80) ||
    'Scheduled post';

  const eventFields = {
    title,
    description: draft.notes,
    start_date: at.toISOString(),
    type: 'post',
    platform: PLATFORM_NAMES[draft.platform],
    color: '#D18A5E',
    post_content: text,
    hook_score: draft.grade?.score ?? null,
    hook_verdict: draft.grade ? VERDICT_LABELS[draft.grade.verdict] : null,
    hook_notes: draft.grade?.weakest ?? null,
    reminder_minutes_before: options.reminderMinutes,
    reminder_sent_at: null,
    draft_id: draft.id,
  };

  // The event belongs to whoever scheduled the draft last. Someone else
  // rescheduling gets their own reminder rather than editing another
  // member's calendar.
  let eventId = draft.calendar_event_id;
  if (eventId) {
    const { data: updated, error } = await db.from('calendar_events').update(eventFields).eq('id', eventId).eq('user_id', actorId).select('id');
    if (error || !updated || updated.length === 0) eventId = null;
  }
  if (!eventId) {
    const { data, error } = await db.from('calendar_events').insert({ ...eventFields, user_id: actorId, ai_generated: false }).select('id').single();
    if (error || !data) throw new HttpError(500, 'Could not add the post to your calendar.');
    eventId = data.id as string;
  }

  return updateDraft(db, actorId, draft.id, {
    status: 'scheduled',
    scheduled_for: at.toISOString(),
    calendar_event_id: eventId,
    auto_publish: options.autoPublish,
    publish_error: null,
  });
}

export async function unscheduleDraft(db: SupabaseClient, actorId: string, draft: DraftRecord): Promise<DraftRecord> {
  if (draft.calendar_event_id) {
    await db.from('calendar_events').delete().eq('id', draft.calendar_event_id).eq('user_id', actorId);
  }
  return updateDraft(db, actorId, draft.id, {
    status: draft.status === 'scheduled' ? 'draft' : draft.status,
    scheduled_for: null,
    calendar_event_id: null,
    auto_publish: false,
    publish_error: null,
  });
}
