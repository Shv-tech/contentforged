/**
 * lib/forge/events.ts
 *
 * Product events: the small, fixed vocabulary of things people do in Forge,
 * recorded so the roadmap can be checked against behaviour instead of
 * guesses. Where people stop, what they edit, what they never open.
 *
 * Deliberately narrow. No page views, no keystrokes, no free-form names: an
 * event that is not in EVENT_NAMES is rejected, and properties are limited
 * to a handful of short scalars. Nothing a user writes is ever recorded.
 */

import { createServiceClient } from '@/lib/supabase/service';

export const EVENT_NAMES = [
  'session.started',
  'feature.opened',
  'draft.created',
  'draft.edited',
  'draft.approved',
  'draft.skipped',
  'draft.abandoned',
  'draft.published',
  'draft.copied',
  'draft.filled_composer',
  'capture.created',
  'source.connected',
  'proposal.kept',
  'proposal.discarded',
  'plan.generated',
  'plan.reviewed',
  'idea.drafted',
  'visual.rendered',
  'repurpose.run',
  'experiment.started',
  'goal.connected',
  'comment.replied',
  'format.published',
  'format.applied',
  'member.invited',
  'api.called',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export type EventProps = Record<string, string | number | boolean | null>;

export function isEventName(value: unknown): value is EventName {
  return typeof value === 'string' && (EVENT_NAMES as readonly string[]).includes(value);
}

const MAX_PROPS = 8;
const MAX_VALUE_LENGTH = 80;

/** Keeps properties to short scalars so an event can never carry content. */
export function sanitiseProps(props: Record<string, unknown> = {}): EventProps {
  const clean: EventProps = {};
  for (const [key, value] of Object.entries(props).slice(0, MAX_PROPS)) {
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(key)) continue;
    if (value === null || typeof value === 'boolean') clean[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === 'string') clean[key] = value.slice(0, MAX_VALUE_LENGTH);
  }
  return clean;
}

/**
 * Records an event. Never throws and never blocks the caller for long:
 * instrumentation failing must not fail the action it observes.
 */
export async function track(userId: string | null, name: EventName, props: Record<string, unknown> = {}): Promise<void> {
  try {
    const { error } = await createServiceClient().from('product_events').insert({ user_id: userId, name, props: sanitiseProps(props) });
    if (error) console.error('[forge/events] insert failed:', name, error.message);
  } catch (error) {
    console.error('[forge/events] insert threw:', name, error);
  }
}
