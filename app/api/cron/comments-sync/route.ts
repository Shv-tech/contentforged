/**
 * app/api/cron/comments-sync/route.ts
 *
 * Every two hours: reads new comments under recent posts for brands whose
 * plan includes the comment inbox. Platforms that cannot be read for a
 * given post are skipped quietly; the inbox explains why when asked.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { CommentsUnavailableError, draftsDueForComments, syncDraftComments } from '@/lib/forge/comments';
import { requireCron } from '@/lib/forge/cron';
import { hasFeature } from '@/lib/forge/entitlements';
import { route } from '@/lib/forge/http';
import { resolvePlan } from '@/lib/forge/plan';
import { createServiceClient } from '@/lib/supabase/service';
import { PlatformError } from '@/lib/platforms/http';
import type { PlanId } from '@/lib/billing/plans';

const BUDGET_MS = 250_000;
const MAX_DRAFTS = 300;

export const GET = route('api/cron/comments-sync', async (req: Request) => {
  requireCron(req);
  const started = Date.now();
  const db = createServiceClient();
  const drafts = await draftsDueForComments(db, {}, MAX_DRAFTS);

  // Plans are resolved once per owner, not once per post.
  const ownerOf = new Map<string, string>();
  const planOf = new Map<string, PlanId>();
  let stored = 0;
  let checked = 0;

  for (const draft of drafts) {
    if (Date.now() - started > BUDGET_MS) break;
    let owner = draft.user_id;
    if (draft.workspace_id) {
      if (!ownerOf.has(draft.workspace_id)) {
        const { data } = await db.from('workspaces').select('owner_id').eq('id', draft.workspace_id).maybeSingle();
        ownerOf.set(draft.workspace_id, (data?.owner_id as string) ?? draft.user_id);
      }
      owner = ownerOf.get(draft.workspace_id) ?? draft.user_id;
    }
    if (!planOf.has(owner)) planOf.set(owner, await resolvePlan(owner));
    if (!hasFeature(planOf.get(owner), 'comment_inbox')) continue;

    try {
      stored += await syncDraftComments(draft);
      checked += 1;
    } catch (error) {
      if (!(error instanceof CommentsUnavailableError) && !(error instanceof PlatformError)) console.error('[cron/comments-sync]', draft.id, error);
      await db.from('drafts').update({ comments_synced_at: new Date().toISOString() }).eq('id', draft.id);
    }
  }

  return NextResponse.json({ checked, stored });
});
