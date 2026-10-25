/**
 * app/api/workspaces/[id]/rollup/route.ts
 *
 * GET  the workspace's results by person: what each member published in the
 *      last 90 days, how it did against the workspace's usual, and, in a
 *      company workspace, how much of their own voice Forge has measured.
 *      For the marketing lead's view of a company account.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { listMembers } from '@/lib/forge/data/members';
import { route } from '@/lib/forge/http';
import { computePlaybook, engagementOf, loadPostedPosts } from '@/lib/forge/playbook';
import { timezoneOf } from '@/lib/forge/profile';
import { workspaceRequest } from '@/lib/forge/workspace-request';
import { createServiceClient } from '@/lib/supabase/service';

const WINDOW_DAYS = 90;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export const GET = route('api/workspaces/[id]/rollup', async (req: Request, { params }: { params: { id: string } }) => {
  const { ctx, workspace } = await workspaceRequest(req, params.id, { roles: ['owner', 'editor', 'reviewer'] });
  const service = createServiceClient();
  const timezone = await timezoneOf(ctx.userId);
  const since = Date.now() - WINDOW_DAYS * 86_400_000;

  const [{ members }, posts] = await Promise.all([listMembers(workspace.id), loadPostedPosts(service, workspace.ownerId, workspace.id, 1000)]);
  const recent = posts.filter((p) => p.draft.posted_at && new Date(p.draft.posted_at).getTime() >= since);
  const { scored } = computePlaybook(posts, timezone);
  const relativeById = new Map(scored.map((s) => [s.draft.id, s.relative]));

  const rows = await Promise.all(
    members.map(async (member) => {
      const theirs = recent.filter((p) => (p.draft.created_by ?? p.draft.user_id) === member.userId);
      const relatives = theirs.map((p) => relativeById.get(p.draft.id)).filter((v): v is number => typeof v === 'number');
      const voice =
        workspace.kind === 'company'
          ? await service.from('voice_fingerprints').select('sample_count').eq('user_id', member.userId).is('workspace_id', null).maybeSingle()
          : { data: null };
      return {
        userId: member.userId,
        name: member.name,
        role: member.role,
        posted: theirs.length,
        engagement: theirs.reduce((sum, p) => sum + (p.metrics ? engagementOf(p.metrics) : 0), 0),
        impressions: theirs.reduce((sum, p) => sum + (p.metrics?.impressions ?? 0), 0),
        medianRelative: median(relatives),
        voiceSamples: (voice.data?.sample_count as number | undefined) ?? null,
      };
    })
  );

  const { count: awaitingReview } = await service.from('drafts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id).eq('review_status', 'pending').neq('status', 'archived');

  return NextResponse.json({
    kind: workspace.kind,
    windowDays: WINDOW_DAYS,
    totals: {
      posted: recent.length,
      engagement: rows.reduce((sum, r) => sum + r.engagement, 0),
      impressions: rows.reduce((sum, r) => sum + r.impressions, 0),
      awaitingReview: awaitingReview ?? 0,
    },
    members: rows.sort((a, b) => b.posted - a.posted),
  });
});
