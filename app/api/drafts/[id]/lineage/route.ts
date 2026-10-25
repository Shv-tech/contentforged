/**
 * app/api/drafts/[id]/lineage/route.ts
 *
 * GET  where a draft came from and what came from it: the capture, source
 *      passage, idea, format, experiment arm or weekly plan behind it, the
 *      draft it was a variant of, and its own variants and siblings.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { loadDraftFor } from '@/lib/forge/data/drafts';
import { HttpError, isUuid, requireUser, route } from '@/lib/forge/http';
import { createServiceClient } from '@/lib/supabase/service';

type Row = Record<string, unknown> | null;

export const GET = route('api/drafts/[id]/lineage', async (req: Request, { params }: { params: { id: string } }) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Draft not found.');
  const ctx = await requireUser(req);
  const { draft } = await loadDraftFor(ctx, params.id, 'read');
  // Every lookup below is keyed by ids stored on a draft the caller may
  // read, so the service client cannot widen access.
  const db = createServiceClient();
  const one = async (table: string, columns: string, id: string | null): Promise<Row> => {
    if (!id) return null;
    const { data } = await db.from(table).select(columns).eq('id', id).maybeSingle();
    return (data as Row) ?? null;
  };

  const [capture, source, idea, format, experiment, plan, parent, children, siblings] = await Promise.all([
    one('captures', 'id, source, title, created_at', draft.capture_id),
    one('repurpose_sources', 'id, kind, title, url, created_at', draft.source_id),
    one('ideas', 'id, source, angle, rationale', draft.idea_id),
    one('formats', 'id, title, summary', draft.format_id),
    one('experiments', 'id, variable, arm_a, arm_b, status, hypothesis', draft.experiment_id),
    one('weekly_plans', 'id, week_start', draft.plan_id),
    one('drafts', 'id, title, platform, status', draft.parent_draft_id),
    db.from('drafts').select('id, title, platform, status').eq('parent_draft_id', draft.id).neq('status', 'archived').limit(20),
    draft.source_id
      ? db.from('drafts').select('id, title, platform, status').eq('source_id', draft.source_id).neq('id', draft.id).neq('status', 'archived').limit(20)
      : Promise.resolve({ data: [] }),
  ]);

  const arm = experiment && draft.experiment_arm ? String(draft.experiment_arm === 'a' ? experiment.arm_a : experiment.arm_b) : null;

  return NextResponse.json({
    capture,
    source,
    idea,
    format,
    experiment: experiment ? { ...experiment, arm, armKey: draft.experiment_arm } : null,
    plan,
    parent,
    children: children.data ?? [],
    siblings: siblings.data ?? [],
  });
});
