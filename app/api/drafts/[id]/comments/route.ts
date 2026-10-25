/**
 * app/api/drafts/[id]/comments/route.ts
 *
 * GET   every comment on the draft, with authors' names
 * POST  { body, anchorText?, anchorStart?, anchorEnd?, parentId? }
 *       comment on the draft or on a quoted span of it. Anyone who can read
 *       the draft can comment, including reviewers and clients. The draft's
 *       people are notified by email and push, per their preferences.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { COMMENT_COLUMNS, listComments, peopleNamed, recordAudit, type DraftComment } from '@/lib/forge/data/collab';
import { loadDraftFor } from '@/lib/forge/data/drafts';
import { draftParticipants } from '@/lib/forge/data/members';
import { draftText } from '@/lib/forge/draft-text';
import { HttpError, isUuid, parseJson, requireUser, route } from '@/lib/forge/http';
import { notifyComment } from '@/lib/forge/notify';
import { truncate } from '@/lib/forge/text';
import { createServiceClient } from '@/lib/supabase/service';

type Params = { params: { id: string } };

async function withNames(comments: DraftComment[]) {
  const people = await peopleNamed(comments.map((c) => c.user_id));
  return comments.map((c) => ({ ...c, author: people[c.user_id]?.name ?? 'Someone' }));
}

export const GET = route('api/drafts/[id]/comments:get', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Draft not found.');
  const ctx = await requireUser(req);
  const { draft, role } = await loadDraftFor(ctx, params.id, 'read');
  const comments = await listComments(createServiceClient(), draft.id);
  return NextResponse.json({ comments: await withNames(comments), role, me: ctx.userId });
});

const CreateSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  anchorText: z.string().max(500).nullish(),
  anchorStart: z.number().int().min(0).nullish(),
  anchorEnd: z.number().int().min(0).nullish(),
  parentId: z.string().uuid().nullish(),
});

export const POST = route('api/drafts/[id]/comments:post', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Draft not found.');
  const input = await parseJson(req, CreateSchema);
  const ctx = await requireUser(req);
  const { draft } = await loadDraftFor(ctx, params.id, 'read');
  const service = createServiceClient();

  if (input.parentId) {
    const { data: parent } = await service.from('draft_comments').select('id, draft_id').eq('id', input.parentId).maybeSingle();
    if (!parent || parent.draft_id !== draft.id) throw new HttpError(400, 'That thread is not on this draft.');
  }

  // Written with the service client after the access check above, so a
  // token request (service client already) and a session behave the same.
  const { data, error } = await service
    .from('draft_comments')
    .insert({
      draft_id: draft.id,
      workspace_id: draft.workspace_id,
      user_id: ctx.userId,
      parent_id: input.parentId ?? null,
      anchor_text: input.parentId ? null : (input.anchorText ?? null),
      anchor_start: input.parentId ? null : (input.anchorStart ?? null),
      anchor_end: input.parentId ? null : (input.anchorEnd ?? null),
      body: input.body,
    })
    .select(COMMENT_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not save the comment: ${error?.message ?? 'unknown error'}`);

  const existing = await listComments(service, draft.id);
  const recipients = await draftParticipants(draft.workspace_id, draft, ctx.userId, existing.map((c) => c.user_id));
  const { data: workspace } = draft.workspace_id ? await service.from('workspaces').select('name').eq('id', draft.workspace_id).maybeSingle() : { data: null };
  await notifyComment({
    recipientIds: recipients,
    authorName: ctx.name,
    workspaceName: (workspace?.name as string | undefined) ?? null,
    draftId: draft.id,
    excerpt: truncate(draftText(draft), 280),
    quote: input.anchorText ?? null,
    comment: input.body,
  }).catch((e) => console.error('[api/drafts/comments] notify failed:', e));
  await recordAudit(draft.workspace_id, ctx.userId, 'comment.added', { type: 'draft', id: draft.id });

  const [named] = await withNames([data as DraftComment]);
  return NextResponse.json({ comment: named }, { status: 201 });
});
