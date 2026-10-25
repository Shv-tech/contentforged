/**
 * app/api/cron/publish-scheduled/route.ts
 *
 * Every five minutes: publishes drafts the user scheduled with "Publish
 * automatically" through their connected LinkedIn, Threads or Bluesky
 * account. X is never auto-published; X drafts get the reminder email with
 * a link that opens X's composer.
 *
 * A failure is written to the draft (publish_error) and the draft stays
 * scheduled, so the card shows what went wrong and the reminder email still
 * goes out.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { requireCron } from '@/lib/forge/cron';
import { DRAFT_COLUMNS } from '@/lib/forge/data/drafts';
import { route } from '@/lib/forge/http';
import { publishDraft } from '@/lib/forge/publishing';
import type { DraftRecord } from '@/lib/forge/types';
import { createServiceClient } from '@/lib/supabase/service';

/** Drafts that came due while the job was down are published up to this late. */
const CATCHUP_HOURS = 6;

export const GET = route('api/cron/publish-scheduled', async (req: Request) => {
  requireCron(req);
  const db = createServiceClient();
  const now = new Date();

  const { data, error } = await db
    .from('drafts')
    .select(DRAFT_COLUMNS)
    .eq('status', 'scheduled')
    .eq('auto_publish', true)
    .in('platform', ['linkedin', 'threads', 'bluesky'])
    .lte('scheduled_for', now.toISOString())
    .gte('scheduled_for', new Date(now.getTime() - CATCHUP_HOURS * 3_600_000).toISOString())
    .is('publish_error', null)
    .limit(100);
  if (error) throw new Error(error.message);

  let published = 0;
  let failed = 0;
  for (const draft of (data ?? []) as DraftRecord[]) {
    // Drafts awaiting client sign-off are never published on a timer.
    if (draft.approval_status === 'pending' || draft.approval_status === 'changes_requested') {
      await db.from('drafts').update({ publish_error: 'Waiting for client approval.' }).eq('id', draft.id);
      failed++;
      continue;
    }
    try {
      await publishDraft(db, draft.user_id, draft);
      published++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : 'Publishing failed.';
      await db
        .from('drafts')
        .update({ publish_error: message.slice(0, 500) })
        .eq('id', draft.id);
    }
  }

  return NextResponse.json({ published, failed });
});
