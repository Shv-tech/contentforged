/**
 * app/api/drafts/[id]/comments/[commentId]/route.ts
 *
 * PATCH   { resolved }  resolve or reopen a thread (its author, or anyone
 *         who can edit the draft)
 *         { body }      edit your own comment
 * DELETE  delete your own comment
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { COMMENT_COLUMNS, recordAudit } from '@/lib/forge/data/collab';
import { loadDraftFor } from '@/lib/forge/data/drafts';
import { canWrite } from '@/lib/forge/data/workspace';
import { HttpError, isUuid, parseJson, requireUser, route } from '@/lib/forge/http';
import { createServiceClient } from '@/lib/supabase/service';

type Params = { params: { id: string; commentId: string } };

async function load(req: Request, params: Params['params']) {
  if (!isUuid(params.id) || !isUuid(params.commentId)) throw new HttpError(404, 'Comment not found.');
  const ctx = await requireUser(req);
  const { draft, role } = await loadDraftFor(ctx, params.id, 'read');
  const service = createServiceClient();
  const { data: comment } = await service.from('draft_comments').select(COMMENT_COLUMNS).eq('id', params.commentId).eq('draft_id', draft.id).maybeSingle();
  if (!comment) throw new HttpError(404, 'Comment not found.');
  return { ctx, draft, role, comment, service };
}

const PatchSchema = z.union([z.object({ resolved: z.boolean() }), z.object({ body: z.string().trim().min(1).max(2000) })]);

export const PATCH = route('api/drafts/[id]/comments/[commentId]:patch', async (req: Request, { params }: Params) => {
  const input = await parseJson(req, PatchSchema);
  const { ctx, draft, role, comment, service } = await load(req, params);

  if ('body' in input) {
    if (comment.user_id !== ctx.userId) throw new HttpError(403, 'You can only edit your own comments.');
    const { data, error } = await service.from('draft_comments').update({ body: input.body }).eq('id', comment.id).select(COMMENT_COLUMNS).single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ comment: data });
  }

  if (comment.user_id !== ctx.userId && !canWrite(role)) throw new HttpError(403, 'Only the author or an editor can resolve this.');
  const { data, error } = await service
    .from('draft_comments')
    .update(input.resolved ? { resolved_at: new Date().toISOString(), resolved_by: ctx.userId } : { resolved_at: null, resolved_by: null })
    .eq('id', comment.id)
    .select(COMMENT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  if (input.resolved) await recordAudit(draft.workspace_id, ctx.userId, 'comment.resolved', { type: 'draft', id: draft.id });
  return NextResponse.json({ comment: data });
});

export const DELETE = route('api/drafts/[id]/comments/[commentId]:delete', async (req: Request, { params }: Params) => {
  const { ctx, comment, service } = await load(req, params);
  if (comment.user_id !== ctx.userId) throw new HttpError(403, 'You can only delete your own comments.');
  const { error } = await service.from('draft_comments').delete().eq('id', comment.id);
  if (error) throw new Error(error.message);
  return NextResponse.json({ deleted: true });
});
