/**
 * app/api/plan/review/route.ts
 *
 * POST { draftId, action, autoPublish? }
 *
 *   approve  schedule the draft at the slot the plan suggested (or the next
 *            sensible one if that has passed). LinkedIn, Threads and Bluesky
 *            drafts can publish themselves; X drafts get a reminder.
 *   skip     set it aside; its idea returns to the queue
 *   undo     back to pending, unscheduled
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { suggestSlots } from '@/lib/forge/best-times';
import { getCredential, isConnectablePlatform } from '@/lib/forge/connections';
import { loadDraftFor, updateDraft } from '@/lib/forge/data/drafts';
import { recordAudit } from '@/lib/forge/data/collab';
import { track } from '@/lib/forge/events';
import { HttpError, parseJson, requireUser, route } from '@/lib/forge/http';
import { computePlaybook, loadPostedPosts } from '@/lib/forge/playbook';
import { timezoneOf } from '@/lib/forge/profile';
import { scheduleDraft, unscheduleDraft } from '@/lib/forge/scheduling';
import { markReviewedIfDone } from '@/lib/forge/weekly-plan';
import type { DraftRecord } from '@/lib/forge/types';
import type { SupabaseClient } from '@supabase/supabase-js';

const BodySchema = z.object({
  draftId: z.string().uuid(),
  action: z.enum(['approve', 'skip', 'undo']),
  autoPublish: z.boolean().optional(),
});

/** The plan's suggested slot, or the next good one when that has passed. */
async function slotFor(db: SupabaseClient, draft: DraftRecord, userId: string): Promise<string> {
  const soon = Date.now() + 30 * 60_000;
  if (draft.suggested_for && new Date(draft.suggested_for).getTime() > soon) return draft.suggested_for;
  const timeZone = await timezoneOf(userId);
  const posts = await loadPostedPosts(db, draft.user_id, draft.workspace_id, 200).catch(() => []);
  const [slot] = suggestSlots({ platform: draft.platform, timeZone, scored: computePlaybook(posts, timeZone).scored, taken: [] });
  return slot?.at ?? new Date(soon + 60 * 60_000).toISOString();
}

export const POST = route('api/plan/review', async (req: Request) => {
  const input = await parseJson(req, BodySchema);
  const ctx = await requireUser(req);
  const { draft } = await loadDraftFor(ctx, input.draftId, 'write');
  if (!draft.plan_id) throw new HttpError(400, 'This draft is not part of a weekly plan.');

  let updated: DraftRecord;
  if (input.action === 'approve') {
    // Publishing by itself is the default when the platform is connected;
    // the person can say otherwise. X is never published automatically.
    const platform = isConnectablePlatform(draft.platform) ? draft.platform : null;
    const connected = platform ? Boolean(await getCredential(ctx.userId, draft.workspace_id, platform).catch(() => null)) : false;
    const autoPublish = platform !== null && connected && (input.autoPublish ?? true);
    const scheduled = draft.status === 'scheduled' ? draft : await scheduleDraft(ctx.db, ctx.userId, draft, { at: await slotFor(ctx.db, draft, ctx.userId), reminderMinutes: 15, autoPublish });
    updated = await updateDraft(ctx.db, ctx.userId, draft.id, { review_status: 'approved' });
    updated = { ...scheduled, ...updated };
    await recordAudit(draft.workspace_id, ctx.userId, 'draft.approved_in_review', { type: 'draft', id: draft.id });
    await track(ctx.userId, 'draft.approved', { platform: draft.platform, auto_publish: autoPublish });
  } else if (input.action === 'skip') {
    if (draft.status === 'scheduled') await unscheduleDraft(ctx.db, ctx.userId, draft);
    updated = await updateDraft(ctx.db, ctx.userId, draft.id, { review_status: 'skipped' });
    if (draft.idea_id) await ctx.db.from('ideas').update({ status: 'open', draft_id: null }).eq('id', draft.idea_id);
    await track(ctx.userId, 'draft.skipped', { platform: draft.platform });
  } else {
    const base = draft.status === 'scheduled' ? await unscheduleDraft(ctx.db, ctx.userId, draft) : draft;
    updated = await updateDraft(ctx.db, ctx.userId, base.id, { review_status: 'pending' });
    if (draft.idea_id) await ctx.db.from('ideas').update({ status: 'planned', draft_id: draft.id }).eq('id', draft.idea_id);
  }

  await markReviewedIfDone(ctx.db, draft.plan_id);
  return NextResponse.json({ draft: updated });
});
