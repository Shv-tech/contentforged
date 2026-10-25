/**
 * app/api/drafts/[id]/posted/route.ts
 *
 * POST  mark a draft as posted. With a URL, links it directly. Without one,
 *       for X drafts, looks through the user's latest posts for a match, so
 *       "I posted it" is usually all the user has to click.
 *
 * Linking matters: it is what lets the metrics job pull results at 1 hour,
 * 24 hours and 7 days, which feed the Playbook and the grader's calibration.
 * The posted text also becomes a voice sample, so the fingerprint keeps
 * learning from what the user actually published.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { draftText, loadDraftFor } from '@/lib/forge/data/drafts';
import { markDraftPosted } from '@/lib/forge/publishing';
import { HttpError, isUuid, parseJson, requireUser, route } from '@/lib/forge/http';
import { identifyPostUrl } from '@/lib/forge/post-links';
import { words } from '@/lib/forge/text';
import { getUserPosts, postUrl, xConfigured } from '@/lib/x/client';

const BodySchema = z.object({
  url: z.string().url().max(500).nullish(),
  postedAt: z.string().datetime({ offset: true }).nullish(),
});

/** Share of the draft's words that appear in the candidate post. */
function overlap(draft: string, candidate: string): number {
  const a = new Set(words(draft));
  const b = new Set(words(candidate));
  if (a.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / a.size;
}

export const POST = route('api/drafts/[id]/posted', async (req: Request, { params }: { params: { id: string } }) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Draft not found.');
  const ctx = await requireUser(req);
  const input = await parseJson(req, BodySchema);
  const { draft } = await loadDraftFor(ctx, params.id, 'write');

  const text = draftText(draft);
  let url = input.url ?? null;
  let externalId: string | null = null;
  let postedAt = input.postedAt ?? new Date().toISOString();
  let matched = false;

  if (url) {
    const identified = identifyPostUrl(url);
    if (identified && identified.platform !== draft.platform) {
      throw new HttpError(400, `That looks like a ${identified.platformName} link, but this draft is for a different platform.`);
    }
    externalId = identified?.externalId ?? null;
  } else if (draft.platform === 'x' && xConfigured()) {
    const { data: profile } = await ctx.db.from('profiles').select('x_handle, x_user_id').eq('id', ctx.userId).maybeSingle();
    if (profile?.x_user_id && profile.x_handle) {
      const recent = await getUserPosts(profile.x_user_id, { max: 10, includeReplies: false, fresh: true }).catch(() => []);
      const firstSegment = draft.kind === 'thread' && draft.segments.length > 0 ? draft.segments[0] : text;
      const best = recent.map((post) => ({ post, score: overlap(firstSegment, post.text) })).sort((a, b) => b.score - a.score)[0];
      if (best && best.score >= 0.6) {
        externalId = best.post.id;
        url = postUrl(profile.x_handle, best.post.id);
        postedAt = best.post.created_at;
        matched = true;
      }
    }
  }

  const updated = await markDraftPosted(ctx.db, ctx.userId, draft, { url, externalId, postedAt });

  return NextResponse.json({ draft: updated, matched, linked: Boolean(url) });
});
