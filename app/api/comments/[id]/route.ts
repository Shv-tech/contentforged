/**
 * app/api/comments/[id]/route.ts
 *
 * PATCH  { status, replyText? }  mark replied or dismissed
 * POST   { action: 'draft_reply' }  write a reply in the author's voice;
 *        for X, also the link that opens X's reply box with it filled in
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { brandRequest } from '@/lib/forge/brand-request';
import { COMMENT_COLUMNS, draftReply, xReplyIntent, type PostComment } from '@/lib/forge/comments';
import { DRAFT_COLUMNS } from '@/lib/forge/data/drafts';
import { scopeRows } from '@/lib/forge/data/workspace';
import { track } from '@/lib/forge/events';
import { HttpError, isUuid, parseJson, route } from '@/lib/forge/http';
import type { DraftRecord } from '@/lib/forge/types';
import type { SupabaseClient } from '@supabase/supabase-js';

type Params = { params: { id: string } };

async function loadComment(db: SupabaseClient, userId: string, workspaceId: string | null, id: string): Promise<PostComment> {
  if (!isUuid(id)) throw new HttpError(404, 'Comment not found.');
  const query = db.from('post_comments').select(COMMENT_COLUMNS).eq('id', id);
  const { data } = await scopeRows(query, userId, workspaceId).maybeSingle();
  if (!data) throw new HttpError(404, 'Comment not found.');
  return data as PostComment;
}

const PatchSchema = z.object({
  status: z.enum(['new', 'replied', 'dismissed']),
  replyText: z.string().trim().max(3000).nullish(),
});

export const PATCH = route('api/comments/[id]:patch', async (req: Request, { params }: Params) => {
  const input = await parseJson(req, PatchSchema);
  const { ctx, workspaceId } = await brandRequest(req, { write: true });
  const comment = await loadComment(ctx.db, ctx.userId, workspaceId, params.id);
  const { data, error } = await ctx.db
    .from('post_comments')
    .update({ status: input.status, ...(input.replyText !== undefined ? { reply_text: input.replyText } : {}) })
    .eq('id', comment.id)
    .select(COMMENT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  if (input.status === 'replied') await track(ctx.userId, 'comment.replied', { platform: comment.platform });
  return NextResponse.json({ comment: data });
});

export const POST = route('api/comments/[id]:post', async (req: Request, { params }: Params) => {
  await parseJson(req, z.object({ action: z.literal('draft_reply') }));
  const { ctx, workspaceId } = await brandRequest(req, { write: true, feature: 'comment_inbox' });
  const comment = await loadComment(ctx.db, ctx.userId, workspaceId, params.id);

  const { data: post } = await ctx.db.from('drafts').select(DRAFT_COLUMNS).eq('id', comment.draft_id).maybeSingle();
  if (!post) throw new HttpError(404, 'The post this comment is on no longer exists.');

  const reply = await draftReply(ctx.db, ctx.userId, comment, post as DraftRecord);
  await ctx.db.from('post_comments').update({ reply_text: reply }).eq('id', comment.id);
  return NextResponse.json({ reply, intentUrl: comment.platform === 'x' ? xReplyIntent(comment.external_id, reply) : null, openUrl: comment.author_url });
});
