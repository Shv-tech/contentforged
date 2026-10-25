/**
 * lib/forge/data/collab.ts
 *
 * The record of how a draft came to be, and who said what about it:
 * versions, line comments and, for workspaces, an audit trail.
 *
 * Versions and audit events are written with the service client. Neither has
 * an insert policy, because neither should be writable from a browser: a
 * history someone can forge is not a history.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { draftText } from '../draft-text';
import type { DraftRecord } from '../types';

// ============================================================================
// VERSIONS
// ============================================================================

export type VersionReason = 'edit' | 'assist' | 'restore' | 'approval' | 'plan' | 'collab' | 'created';

export interface DraftVersion {
  id: string;
  draft_id: string;
  user_id: string | null;
  body: string;
  segments: string[];
  reason: VersionReason;
  created_at: string;
}

const VERSION_COLUMNS = 'id, draft_id, user_id, body, segments, reason, created_at';
const MAX_VERSIONS = 100;
/** Consecutive edits by one person inside this window become one version. */
const COALESCE_MS = 2 * 60_000;

export async function recordVersion(
  _db: SupabaseClient,
  input: { draft: DraftRecord; userId: string | null; reason: VersionReason; previous?: DraftRecord | null }
): Promise<void> {
  const service = createServiceClient();
  const { draft, userId, reason } = input;

  const { data: latest } = await service
    .from('draft_versions')
    .select('id, user_id, reason, created_at')
    .eq('draft_id', draft.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // The first recorded change also preserves what the draft said before it,
  // so history always starts from the original words.
  if (!latest && input.previous) {
    await service.from('draft_versions').insert({
      draft_id: draft.id,
      workspace_id: draft.workspace_id,
      user_id: input.previous.created_by ?? input.previous.user_id,
      body: draftText(input.previous),
      segments: input.previous.segments,
      reason: 'created',
      created_at: input.previous.updated_at,
    });
  }

  const coalesce =
    latest &&
    latest.user_id === userId &&
    latest.reason === reason &&
    (reason === 'edit' || reason === 'collab') &&
    Date.now() - new Date(latest.created_at).getTime() < COALESCE_MS;

  if (coalesce) {
    await service
      .from('draft_versions')
      .update({ body: draftText(draft), segments: draft.segments, created_at: new Date().toISOString() })
      .eq('id', latest.id);
  } else {
    await service.from('draft_versions').insert({
      draft_id: draft.id,
      workspace_id: draft.workspace_id,
      user_id: userId,
      body: draftText(draft),
      segments: draft.segments,
      reason,
    });
  }

  const { data: overflow } = await service
    .from('draft_versions')
    .select('id')
    .eq('draft_id', draft.id)
    .order('created_at', { ascending: false })
    .range(MAX_VERSIONS, MAX_VERSIONS + 200);
  if (overflow && overflow.length > 0) {
    await service
      .from('draft_versions')
      .delete()
      .in(
        'id',
        overflow.map((row: { id: string }) => row.id)
      );
  }
}

export async function listVersions(db: SupabaseClient, draftId: string): Promise<DraftVersion[]> {
  const { data, error } = await db.from('draft_versions').select(VERSION_COLUMNS).eq('draft_id', draftId).order('created_at', { ascending: false }).limit(MAX_VERSIONS);
  if (error) throw new Error(`Could not load versions: ${error.message}`);
  return (data ?? []) as DraftVersion[];
}

// ============================================================================
// COMMENTS
// ============================================================================

export interface DraftComment {
  id: string;
  draft_id: string;
  user_id: string;
  parent_id: string | null;
  anchor_text: string | null;
  anchor_start: number | null;
  anchor_end: number | null;
  body: string;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

export const COMMENT_COLUMNS = 'id, draft_id, user_id, parent_id, anchor_text, anchor_start, anchor_end, body, resolved_at, resolved_by, created_at, updated_at';

export async function listComments(db: SupabaseClient, draftId: string): Promise<DraftComment[]> {
  const { data, error } = await db.from('draft_comments').select(COMMENT_COLUMNS).eq('draft_id', draftId).order('created_at', { ascending: true }).limit(500);
  if (error) throw new Error(`Could not load comments: ${error.message}`);
  return (data ?? []) as DraftComment[];
}

/**
 * Display names for a set of user ids. Read through the service client
 * because auth.users is not exposed to sessions; only names and emails of
 * people who share a draft with the caller are ever requested.
 */
export async function peopleNamed(userIds: string[]): Promise<Record<string, { name: string; email: string }>> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  const service = createServiceClient();
  const entries = await Promise.all(
    unique.map(async (id) => {
      const { data } = await service.auth.admin.getUserById(id);
      const user = data?.user;
      const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
      const fullName = typeof meta.full_name === 'string' && meta.full_name.trim() ? meta.full_name.trim() : null;
      const email = user?.email ?? '';
      return [id, { name: fullName ?? email.split('@')[0] ?? 'Someone', email }] as const;
    })
  );
  return Object.fromEntries(entries);
}

// ============================================================================
// AUDIT
// ============================================================================

export type AuditAction =
  | 'draft.created'
  | 'draft.edited'
  | 'draft.restored'
  | 'draft.scheduled'
  | 'draft.published'
  | 'draft.approved_in_review'
  | 'draft.sent_for_approval'
  | 'draft.client_decision'
  | 'draft.archived'
  | 'comment.added'
  | 'comment.resolved'
  | 'member.invited'
  | 'member.joined'
  | 'member.role_changed'
  | 'member.removed'
  | 'connection.added'
  | 'connection.removed'
  | 'rule.added'
  | 'report.generated'
  | 'workspace.updated';

export interface AuditEvent {
  id: number;
  workspace_id: string;
  user_id: string | null;
  action: AuditAction;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

/** Records a workspace event. A no-op for the personal brand, which has no audience to account to. */
export async function recordAudit(
  workspaceId: string | null,
  userId: string | null,
  action: AuditAction,
  target: { type?: string; id?: string | null; detail?: Record<string, unknown> } = {}
): Promise<void> {
  if (!workspaceId) return;
  const { error } = await createServiceClient()
    .from('audit_events')
    .insert({ workspace_id: workspaceId, user_id: userId, action, target_type: target.type ?? null, target_id: target.id ?? null, detail: target.detail ?? {} });
  if (error) console.error('[forge/audit] could not record', action, error.message);
}

export async function listAudit(db: SupabaseClient, workspaceId: string, before?: number): Promise<AuditEvent[]> {
  let query = db.from('audit_events').select('id, workspace_id, user_id, action, target_type, target_id, detail, created_at').eq('workspace_id', workspaceId);
  if (before) query = query.lt('id', before);
  const { data, error } = await query.order('id', { ascending: false }).limit(60);
  if (error) throw new Error(`Could not load the audit trail: ${error.message}`);
  return (data ?? []) as AuditEvent[];
}
