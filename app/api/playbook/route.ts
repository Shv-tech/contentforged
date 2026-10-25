/**
 * app/api/playbook/route.ts
 *
 * GET  the Playbook: what has worked for this brand, measured from its own
 *      posted drafts, plus anonymous niche signals when the user opted in.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getActiveWorkspace } from '@/lib/forge/data/workspace';
import { draftText } from '@/lib/forge/draft-text';
import { requireUser, route } from '@/lib/forge/http';
import { latestNicheSignals } from '@/lib/forge/niche-insights';
import { computePlaybook, dimensionsFor, loadPostedPosts } from '@/lib/forge/playbook';
import { firstLine, truncate } from '@/lib/forge/text';
import { createServiceClient } from '@/lib/supabase/service';

export const GET = route('api/playbook', async (req: Request) => {
  const ctx = await requireUser(req);
  const workspace = await getActiveWorkspace(ctx.db, ctx.userId);
  const { data: profile } = await ctx.db.from('profiles').select('timezone, niche, share_anonymous_insights').eq('id', ctx.userId).maybeSingle();
  const timeZone = (profile?.timezone as string | null) ?? 'UTC';

  const posts = await loadPostedPosts(ctx.db, ctx.userId, workspace?.id ?? null);
  const playbook = computePlaybook(posts, timeZone);

  const series = playbook.scored
    .filter((p) => p.draft.posted_at)
    .map((p) => ({
      id: p.draft.id,
      platform: p.draft.platform,
      postedAt: p.draft.posted_at!,
      opening: truncate(firstLine(draftText(p.draft)), 110),
      engagement: p.engagement,
      relative: Math.round(p.relative * 100) / 100,
      percentile: Math.round(p.percentile * 100) / 100,
      grade: p.draft.grade?.score ?? null,
      impressions: p.metrics.impressions,
      likes: p.metrics.likes,
      replies: p.metrics.replies,
      reposts: (p.metrics.reposts ?? 0) + (p.metrics.quotes ?? 0),
      url: p.draft.post_url,
    }))
    .sort((a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime());

  const unmeasured = posts
    .filter((p) => !p.metrics)
    .slice(0, 12)
    .map((p) => ({ id: p.draft.id, platform: p.draft.platform, postedAt: p.draft.posted_at, opening: truncate(firstLine(draftText(p.draft)), 110) }));

  const dimensions = dimensionsFor(timeZone);
  const niche =
    !workspace && profile?.share_anonymous_insights && profile.niche ? await latestNicheSignals(createServiceClient(), profile.niche as string) : [];

  return NextResponse.json({
    postedCount: playbook.postedCount,
    measuredCount: playbook.measuredCount,
    totals: playbook.totals,
    findings: playbook.findings,
    calibration: { pairs: playbook.calibration.pairs, correlation: playbook.calibration.correlation },
    series,
    unmeasured,
    niche: {
      optedIn: Boolean(profile?.share_anonymous_insights),
      name: (profile?.niche as string | null) ?? null,
      signals: niche.slice(0, 8).map((signal) => ({
        ...signal,
        text: dimensions.find((d) => d.id === signal.dimension)?.describe(signal.bucket) ?? `${signal.dimension}: ${signal.bucket}`,
      })),
    },
    timeZone,
  });
});
