/**
 * app/api/comments/route.ts
 *
 * GET   the comment inbox: comments under the active brand's posts, newest
 *       first, with the post each belongs to. ?status=new|replied|dismissed
 * POST  { action: 'sync' }  read new comments now for recent posts
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { brandRequest } from '@/lib/forge/brand-request';
import { COMMENT_COLUMNS, CommentsUnavailableError, draftsDueForComments, syncDraftComments } from '@/lib/forge/comments';
import { DRAFT_COLUMNS } from '@/lib/forge/data/drafts';
import { scopeRows } from '@/lib/forge/data/workspace';
import { draftText } from '@/lib/forge/draft-text';
import { HttpError, parseJson, route } from '@/lib/forge/http';
import { firstLine, truncate } from '@/lib/forge/text';
import { PlatformError } from '@/lib/platforms/http';
import type { DraftRecord } from '@/lib/forge/types';

export const GET = route('api/comments:get', async (req: Request) => {
  const { ctx, workspaceId } = await brandRequest(req);
  const status = new URL(req.url).searchParams.get('status') ?? 'new';
  if (!['new', 'replied', 'dismissed'].includes(status)) throw new HttpError(400, 'Unknown status.');

  const query = ctx.db.from('post_comments').select(COMMENT_COLUMNS).eq('status', status);
  const { data, error } = await scopeRows(query, ctx.userId, workspaceId).order('posted_at', { ascending: false, nullsFirst: false }).limit(150);
  if (error) throw new Error(error.message);

  const draftIds = Array.from(new Set((data ?? []).map((c: { draft_id: string }) => c.draft_id)));
  const { data: drafts } = draftIds.length ? await ctx.db.from('drafts').select(DRAFT_COLUMNS).in('id', draftIds) : { data: [] };
  const posts = Object.fromEntries(
    ((drafts ?? []) as DraftRecord[]).map((d) => [d.id, { id: d.id, platform: d.platform, opening: truncate(firstLine(draftText(d)), 140), post_url: d.post_url, posted_at: d.posted_at }])
  );

  return NextResponse.json({ comments: data ?? [], posts });
});

export const POST = route('api/comments:post', async (req: Request) => {
  await parseJson(req, z.object({ action: z.literal('sync') }));
  const { ctx, workspaceId } = await brandRequest(req, { feature: 'comment_inbox' });

  const drafts = await draftsDueForComments(ctx.db, { userId: ctx.userId, workspaceId }, 25);
  let stored = 0;
  const unavailable = new Set<string>();
  for (const draft of drafts) {
    try {
      stored += await syncDraftComments(draft);
    } catch (error) {
      if (error instanceof CommentsUnavailableError || error instanceof PlatformError) unavailable.add(error.message);
      else console.error('[api/comments] sync failed for', draft.id, error);
    }
  }
  return NextResponse.json({ checked: drafts.length, stored, notes: Array.from(unavailable).slice(0, 4) });
});
