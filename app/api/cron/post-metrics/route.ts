/**
 * app/api/cron/post-metrics/route.ts
 *
 * Every 30 minutes: collects results for posted drafts at the 1 hour,
 * 24 hour and 7 day checkpoints. These rows are what the Playbook learns
 * from and what calibrates the grader against real outcomes.
 *
 * X reads are batched (up to 100 posts per request); other platforms are
 * read one post at a time. Each post is read at most once per checkpoint, so
 * the cost is three reads per post over its first week.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { requireCron } from '@/lib/forge/cron';
import { afterResults } from '@/lib/forge/outcomes';
import { DRAFT_COLUMNS } from '@/lib/forge/data/drafts';
import { route } from '@/lib/forge/http';
import { CHECKPOINT_WINDOWS, dueCheckpoint, fetchLiveMetrics, fromX, MetricsUnavailableError, recordMetrics } from '@/lib/forge/metrics';
import type { DraftRecord } from '@/lib/forge/types';
import { createServiceClient } from '@/lib/supabase/service';
import { getPostsByIds, xConfigured } from '@/lib/x/client';

const MAX_PER_RUN = 400;

export const GET = route('api/cron/post-metrics', async (req: Request) => {
  requireCron(req);
  const db = createServiceClient();
  const now = Date.now();
  const oldest = new Date(now - Math.max(...CHECKPOINT_WINDOWS.map((w) => w.toHours)) * 3_600_000).toISOString();

  const { data: drafts, error } = await db
    .from('drafts')
    .select(DRAFT_COLUMNS)
    .eq('status', 'posted')
    .not('posted_at', 'is', null)
    .gte('posted_at', oldest)
    .or('external_id.not.is.null,post_url.not.is.null')
    .order('posted_at', { ascending: false })
    .limit(MAX_PER_RUN);
  if (error) throw new Error(error.message);

  const candidates = ((drafts ?? []) as DraftRecord[])
    .map((draft) => ({ draft, checkpoint: dueCheckpoint(draft.posted_at!, now) }))
    .filter((c): c is { draft: DraftRecord; checkpoint: NonNullable<typeof c.checkpoint> } => c.checkpoint !== null);
  if (candidates.length === 0) return NextResponse.json({ checked: 0, recorded: 0 });

  const { data: existing } = await db
    .from('post_metrics')
    .select('draft_id, checkpoint')
    .in(
      'draft_id',
      candidates.map((c) => c.draft.id)
    );
  const done = new Set((existing ?? []).map((row: { draft_id: string; checkpoint: string }) => `${row.draft_id}:${row.checkpoint}`));
  const due = candidates.filter((c) => !done.has(`${c.draft.id}:${c.checkpoint}`));

  let recorded = 0;
  const failures: string[] = [];

  // X in batches.
  const xDue = due.filter((c) => c.draft.platform === 'x' && c.draft.external_id);
  if (xDue.length > 0 && xConfigured()) {
    try {
      const posts = await getPostsByIds(xDue.map((c) => c.draft.external_id!));
      const byId = new Map(posts.map((p) => [p.id, p]));
      for (const { draft, checkpoint } of xDue) {
        const post = byId.get(draft.external_id!);
        if (!post) continue;
        await recordMetrics(db, draft.user_id, draft, checkpoint, fromX(post.public_metrics), 'x_api', post.public_metrics);
        await afterResults(db, draft.id);
        recorded++;
      }
    } catch (err) {
      failures.push(`x: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Everything else one at a time; a platform that cannot be read for a
  // user is skipped quietly (the user adds those numbers themselves).
  for (const { draft, checkpoint } of due.filter((c) => c.draft.platform !== 'x')) {
    try {
      const live = await fetchLiveMetrics(draft);
      await recordMetrics(db, draft.user_id, draft, checkpoint, live.values, live.source, live.raw);
      await afterResults(db, draft.id);
      recorded++;
    } catch (err) {
      if (!(err instanceof MetricsUnavailableError)) failures.push(`${draft.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (failures.length > 0) console.error('[cron/post-metrics]', failures.slice(0, 20));
  return NextResponse.json({ checked: due.length, recorded, failed: failures.length });
});
