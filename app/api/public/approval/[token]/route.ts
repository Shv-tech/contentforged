/**
 * app/api/public/approval/[token]/route.ts
 *
 * POST { decision: 'approve' | 'changes', comment? }  the client's answer.
 *
 * One answer per link. The draft's approval state follows the answer only
 * while the draft still holds the text that was approved: if the writer
 * edited it in the meantime, the answer is recorded but does not approve
 * words the client never saw.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadApproval } from '@/lib/forge/approvals';
import { draftText } from '@/lib/forge/draft-text';
import { DRAFT_COLUMNS } from '@/lib/forge/data/drafts';
import { HttpError, clientIp, parseJson, route } from '@/lib/forge/http';
import { consumeLimit } from '@/lib/forge/limits';
import { hashRequester } from '@/lib/forge/crypto';
import { truncate } from '@/lib/forge/text';
import type { DraftRecord } from '@/lib/forge/types';
import { sendApprovalDecisionEmail } from '@/lib/mail-service';
import { createServiceClient } from '@/lib/supabase/service';

const BodySchema = z.object({
  decision: z.enum(['approve', 'changes']),
  comment: z.string().trim().max(2000).optional(),
});

export const POST = route('api/public/approval', async (req: Request, { params }: { params: { token: string } }) => {
  const limit = await consumeLimit(`approval:${hashRequester(clientIp(req))}`, 30, 3600);
  if (!limit.allowed) throw new HttpError(429, 'Too many attempts. Try again later.');

  const approval = await loadApproval(params.token);
  if (!approval) throw new HttpError(404, 'This approval link is not valid.');
  if (approval.expired) throw new HttpError(410, 'This approval link has expired. Ask for a new one.');
  if (approval.status !== 'pending') throw new HttpError(409, 'This post has already been answered.');

  const input = await parseJson(req, BodySchema);
  if (input.decision === 'changes' && !input.comment) throw new HttpError(400, 'Say what should change.');

  const status = input.decision === 'approve' ? 'approved' : 'changes_requested';
  const db = createServiceClient();
  const decidedAt = new Date().toISOString();

  const { error } = await db
    .from('approval_requests')
    .update({ status, client_comment: input.comment ?? null, decided_at: decidedAt })
    .eq('id', approval.id)
    .eq('status', 'pending');
  if (error) throw new Error(error.message);

  const { data: draft } = await db.from('drafts').select(DRAFT_COLUMNS).eq('id', approval.draftId).maybeSingle();
  if (draft && draftText(draft as DraftRecord) === approval.body) {
    await db
      .from('drafts')
      .update({ approval_status: status, notes: input.comment ? `Client: ${input.comment}` : (draft as DraftRecord).notes })
      .eq('id', approval.draftId);
  }

  const { data: owner } = await db.auth.admin.getUserById(approval.userId);
  if (owner?.user?.email) {
    const meta = (owner.user.user_metadata ?? {}) as Record<string, unknown>;
    await sendApprovalDecisionEmail({
      to: owner.user.email,
      name: typeof meta.full_name === 'string' ? meta.full_name : '',
      clientName: approval.clientName,
      approved: status === 'approved',
      comment: input.comment ?? null,
      excerpt: truncate(approval.body, 400),
    });
  }

  return NextResponse.json({ status });
});
