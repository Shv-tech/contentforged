/**
 * lib/forge/approvals.ts
 *
 * Reading and answering a client approval link. The token is the only
 * credential, so every read goes through the service client and returns only
 * what the approval page shows.
 */

import { createServiceClient } from '@/lib/supabase/service';
import type { DraftPlatform } from './types';

export interface ApprovalView {
  token: string;
  status: 'pending' | 'approved' | 'changes_requested';
  body: string;
  platform: DraftPlatform;
  kind: 'post' | 'thread' | 'carousel';
  segments: string[];
  clientName: string;
  comment: string | null;
  decidedAt: string | null;
  expired: boolean;
}

const TOKEN_PATTERN = /^[a-f0-9]{48}$/;

export function isApprovalToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export async function loadApproval(token: string): Promise<(ApprovalView & { id: string; userId: string; draftId: string }) | null> {
  if (!isApprovalToken(token)) return null;
  const db = createServiceClient();
  const { data: request } = await db
    .from('approval_requests')
    .select('id, user_id, draft_id, workspace_id, status, snapshot_body, client_comment, decided_at, expires_at')
    .eq('token', token)
    .maybeSingle();
  if (!request) return null;

  const [{ data: draft }, { data: workspace }] = await Promise.all([
    db.from('drafts').select('platform, kind').eq('id', request.draft_id).maybeSingle(),
    request.workspace_id ? db.from('workspaces').select('name').eq('id', request.workspace_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const kind = (draft?.kind ?? 'post') as ApprovalView['kind'];
  return {
    id: request.id,
    userId: request.user_id,
    draftId: request.draft_id,
    token,
    status: request.status,
    body: request.snapshot_body,
    platform: (draft?.platform ?? 'linkedin') as DraftPlatform,
    kind,
    segments: kind === 'thread' ? request.snapshot_body.split(/\n{2,}/).filter(Boolean) : [],
    clientName: (workspace as { name?: string } | null)?.name ?? 'Client',
    comment: request.client_comment,
    decidedAt: request.decided_at,
    expired: new Date(request.expires_at).getTime() < Date.now(),
  };
}
