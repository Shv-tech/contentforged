/**
 * app/api/drafts/[id]/approval/route.ts
 *
 * GET   the latest approval request for this draft
 * POST  create a client approval link for the draft's current text, mark the
 *       draft as awaiting approval, and email the client when the workspace
 *       has a client email. Returns the link so it can also be sent by hand.
 *
 * The client needs no account: the link's token is the credential, it is
 * single-purpose (approve or request changes on one snapshot), and it
 * expires after 30 days.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/forge/app-url';
import { draftText, updateDraft, loadDraftFor } from '@/lib/forge/data/drafts';
import { HttpError, isUuid, requireUser, route } from '@/lib/forge/http';
import { requireFeature } from '@/lib/forge/plan';
import { truncate } from '@/lib/forge/text';
import { PLATFORM_NAMES } from '@/lib/forge/types';
import { sendApprovalRequestEmail } from '@/lib/mail-service';
import { createServiceClient } from '@/lib/supabase/service';

type Params = { params: { id: string } };

export const GET = route('api/drafts/[id]/approval:get', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Draft not found.');
  const ctx = await requireUser(req);
  const { draft } = await loadDraftFor(ctx, params.id, 'read');
  const { data } = await createServiceClient()
    .from('approval_requests')
    .select('id, token, status, client_comment, decided_at, expires_at, created_at')
    .eq('draft_id', draft.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ request: data ? { ...data, url: `${appUrl(req)}/approve/${data.token}` } : null });
});

export const POST = route('api/drafts/[id]/approval:post', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Draft not found.');
  const ctx = await requireUser(req);
  const { draft } = await loadDraftFor(ctx, params.id, 'write');
  if (!draft.workspace_id) throw new HttpError(400, 'Approval links are for client workspaces.');
  if (draft.status === 'posted') throw new HttpError(409, 'This draft is already posted.');

  const text = draftText(draft);
  if (!text.trim()) throw new HttpError(400, 'This draft is empty.');

  const service = createServiceClient();
  const { data: workspace } = await service
    .from('workspaces')
    .select('name, client_email, owner_id')
    .eq('id', draft.workspace_id)
    .maybeSingle();
  if (!workspace) throw new HttpError(404, 'Workspace not found.');
  // Workspaces are an Agency feature of the owner's plan, not the member's.
  await requireFeature(workspace.owner_id, 'workspaces');

  // Earlier open requests for this draft are superseded by the new snapshot.
  await service
    .from('approval_requests')
    .update({ status: 'changes_requested', client_comment: 'Superseded by a newer version.', decided_at: new Date().toISOString() })
    .eq('draft_id', draft.id)
    .eq('status', 'pending');

  const { data: request, error } = await service
    .from('approval_requests')
    .insert({ user_id: ctx.userId, draft_id: draft.id, workspace_id: draft.workspace_id, snapshot_body: text })
    .select('token')
    .single();
  if (error || !request) throw new Error(error?.message ?? 'Could not create the approval link.');

  await updateDraft(ctx.db, ctx.userId, draft.id, { approval_status: 'pending' });

  const url = `${appUrl(req)}/approve/${request.token}`;
  let emailed = false;
  if (workspace.client_email) {
    emailed = await sendApprovalRequestEmail({
      to: workspace.client_email,
      clientName: workspace.name,
      senderName: ctx.name,
      platform: PLATFORM_NAMES[draft.platform],
      excerpt: truncate(text, 600),
      url,
    });
  }

  return NextResponse.json({ url, emailed });
});
