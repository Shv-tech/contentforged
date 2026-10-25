/**
 * lib/forge/publishing.ts
 *
 * Publishing a draft to a connected platform, and the bookkeeping every
 * route does once a draft is live: status, link, calendar, voice sample.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { draftText, updateDraft } from './data/drafts';
import { addSamples } from './data/voice';
import { recordAudit } from './data/collab';
import { track } from './events';
import { afterPosted } from './outcomes';
import { getCredential, type ConnectablePlatform } from './connections';
import { PLATFORM_LIMITS, measure, splitIntoThread } from './text';
import { PLATFORM_NAMES, type DraftRecord } from './types';
import { publishToBluesky } from '@/lib/platforms/bluesky';
import { PlatformError } from '@/lib/platforms/http';
import { publishToLinkedIn } from '@/lib/platforms/linkedin';
import { publishToThreads } from '@/lib/platforms/threads';

export interface LiveLink {
  url: string | null;
  externalId: string | null;
  postedAt: string;
}

/**
 * Marks a draft as posted and links it to the live post. The posted text
 * becomes a voice sample, so the fingerprint keeps learning from what the
 * user actually published, and a pending calendar reminder is stamped so the
 * user is not reminded to post something already live.
 */
export async function markDraftPosted(db: SupabaseClient, userId: string, draft: DraftRecord, link: LiveLink): Promise<DraftRecord> {
  const updated = await updateDraft(db, userId, draft.id, {
    status: 'posted',
    posted_at: link.postedAt,
    post_url: link.url,
    external_id: link.externalId,
    publish_error: null,
  });

  if (draft.calendar_event_id) {
    await db
      .from('calendar_events')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', draft.calendar_event_id)
      .eq('user_id', userId)
      .is('reminder_sent_at', null);
  }

  await addSamples(db, userId, draft.workspace_id, [
    {
      platform: draft.platform === 'instagram' ? 'other' : draft.platform,
      body: draftText(draft),
      external_id: link.externalId,
      posted_at: link.postedAt,
      source: 'posted_draft',
    },
  ]).catch((error) => console.error('[forge/publishing] adding voice sample failed:', error));

  await afterPosted(db, updated);
  await recordAudit(updated.workspace_id, userId, 'draft.published', { type: 'draft', id: updated.id, detail: { platform: updated.platform, url: link.url } });
  await track(userId, 'draft.published', { platform: updated.platform, from_plan: Boolean(updated.plan_id) });

  return updated;
}

/** The parts to send: thread segments, or one post split if it is over the platform's limit. */
export function partsFor(draft: DraftRecord, platform: ConnectablePlatform): string[] {
  if (platform === 'linkedin') return [draftText(draft)];
  const parts = draft.kind === 'thread' && draft.segments.length > 0 ? draft.segments : [draftText(draft)];
  return parts.flatMap((part) => (measure(part, platform) > PLATFORM_LIMITS[platform] ? splitIntoThread(part, platform) : [part]));
}

export async function publishDraft(db: SupabaseClient, userId: string, draft: DraftRecord): Promise<DraftRecord> {
  const platform = draft.platform;
  if (platform !== 'linkedin' && platform !== 'threads' && platform !== 'bluesky') {
    throw new PlatformError(`${PLATFORM_NAMES[platform]} posts are published from ${PLATFORM_NAMES[platform]} itself.`, 400);
  }

  const credential = await getCredential(userId, draft.workspace_id, platform);
  if (!credential) throw new PlatformError(`Connect ${PLATFORM_NAMES[platform]} first, under Brand, Settings.`, 409);

  const parts = partsFor(draft, platform);
  if (parts.every((part) => !part.trim())) throw new PlatformError('This draft is empty.', 400);
  if (platform === 'linkedin' && measure(parts[0], 'linkedin') > PLATFORM_LIMITS.linkedin) {
    throw new PlatformError(`LinkedIn posts are limited to ${PLATFORM_LIMITS.linkedin} characters. Shorten this one first.`, 400);
  }

  const postedAt = new Date().toISOString();
  let link: LiveLink;

  if (platform === 'linkedin') {
    const result = await publishToLinkedIn(credential.accessToken, credential.accountId, parts[0]);
    link = { url: result.url, externalId: result.urn, postedAt };
  } else if (platform === 'threads') {
    const result = await publishToThreads(credential.accessToken, credential.accountId, parts);
    link = { url: result.url, externalId: result.id, postedAt };
  } else {
    if (!credential.secret) throw new PlatformError('Reconnect Bluesky with an app password.', 409, true);
    const result = await publishToBluesky(credential.accountHandle ?? credential.accountId, credential.secret, parts);
    link = { url: result.url, externalId: result.uri, postedAt };
  }

  return markDraftPosted(db, userId, draft, link);
}
