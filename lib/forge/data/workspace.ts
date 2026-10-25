/**
 * lib/forge/data/workspace.ts
 *
 * Resolves which brand a request acts for, and with what role.
 *
 * A brand is either the user's own (workspace null) or a workspace they own
 * or were invited to. Two kinds of workspace exist:
 *
 *   client   one brand voice every member writes in: an agency's client.
 *            Voice, stories, rules and drafts all belong to the workspace.
 *   company  brand rules and stories are shared, but each member keeps
 *            their own measured voice, so the CEO and an engineer posting
 *            for the same company still sound like themselves.
 *
 * Every Story Bank, voice, rule and draft query is narrowed through
 * `scopeRows`. Workspace rows are shared by membership (enforced by RLS for
 * sessions and by `resolveRole` for token requests, which use the service
 * client); personal rows stay private to their user_id.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { hasFeature } from '../entitlements';
import { HttpError } from '../http';
import { resolvePlan } from '../plan';
import type { WritingLanguage } from '../types';

export type { WritingLanguage };

/** Columns returned to the client for a workspace. */
export const WORKSPACE_COLUMNS = 'id, owner_id, name, kind, writing_language, brand_dna, client_email, created_at, updated_at';

import { ROLE_LABELS, type WorkspaceKind, type WorkspaceRole } from '../labels';

export { MEMBER_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, WORKSPACE_ROLES, type MemberRole, type WorkspaceKind, type WorkspaceRole } from '../labels';

export interface WorkspaceRef {
  id: string;
  name: string;
  brand_dna: string | null;
  kind: WorkspaceKind;
  writing_language: WritingLanguage;
  ownerId: string;
  role: WorkspaceRole;
}

export function canWrite(role: WorkspaceRole | null | undefined): boolean {
  return role === 'owner' || role === 'editor';
}

/**
 * The caller's role in a workspace, or null. Explicit rather than left to
 * RLS so it also holds on the service client used by token requests.
 */
export async function resolveRole(db: SupabaseClient, userId: string, workspaceId: string): Promise<{ role: WorkspaceRole; ownerId: string } | null> {
  const { data: workspace } = await db.from('workspaces').select('owner_id').eq('id', workspaceId).maybeSingle();
  if (!workspace) return null;
  if (workspace.owner_id === userId) return { role: 'owner', ownerId: workspace.owner_id };

  const { data: member } = await db.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
  return member ? { role: member.role as WorkspaceRole, ownerId: workspace.owner_id } : null;
}

/** Loads a workspace the caller belongs to, or null. */
export async function loadWorkspace(db: SupabaseClient, userId: string, workspaceId: string): Promise<WorkspaceRef | null> {
  const membership = await resolveRole(db, userId, workspaceId);
  if (!membership) return null;

  const { data } = await db.from('workspaces').select('id, name, brand_dna, kind, writing_language').eq('id', workspaceId).maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    brand_dna: data.brand_dna,
    kind: (data.kind as WorkspaceKind) ?? 'client',
    writing_language: (data.writing_language as WritingLanguage) ?? 'en',
    ownerId: membership.ownerId,
    role: membership.role,
  };
}

/**
 * The active workspace, or null for the personal brand.
 *
 * Workspaces are an Agency feature of the owner's plan: a member on Free
 * still works inside an Agency owner's workspace. If the owner's plan lapses
 * the workspace stays stored but is ignored until it returns, so a downgrade
 * cannot strand anyone inside it.
 */
export async function getActiveWorkspace(db: SupabaseClient, userId: string): Promise<WorkspaceRef | null> {
  const { data: profile } = await db.from('profiles').select('active_workspace_id').eq('id', userId).maybeSingle();
  const workspaceId = profile?.active_workspace_id as string | null | undefined;
  if (!workspaceId) return null;

  const workspace = await loadWorkspace(db, userId, workspaceId);
  if (!workspace) return null;

  const plan = await resolvePlan(workspace.ownerId);
  return hasFeature(plan, 'workspaces') ? workspace : null;
}

/** Throws 403 unless the role may change content in the workspace. */
export function requireWrite(workspace: WorkspaceRef | null): void {
  if (workspace && !canWrite(workspace.role)) {
    throw new HttpError(403, `As a ${ROLE_LABELS[workspace.role].toLowerCase()} in ${workspace.name}, you can read and comment but not change content.`);
  }
}

type Filterable<Q> = { is: (column: string, value: null) => Q; eq: (column: string, value: string) => Q };

/**
 * Narrows a query to one brand: every row of a workspace, or the user's own
 * personal rows. Works on any PostgREST filter builder with user_id and
 * workspace_id columns.
 */
export function scopeRows<Q extends Filterable<Q>>(query: Q, userId: string, workspaceId: string | null): Q {
  return workspaceId ? query.eq('workspace_id', workspaceId) : query.eq('user_id', userId).is('workspace_id', null);
}

/** Narrows to a workspace without a user filter. Kept for callers that filter by user themselves. */
export function scopeToWorkspace<Q extends Filterable<Q>>(query: Q, workspaceId: string | null): Q {
  return workspaceId ? query.eq('workspace_id', workspaceId) : query.is('workspace_id', null);
}

// ============================================================================
// KIND
// ============================================================================

const KIND_TTL_MS = 60_000;
const kindCache = new Map<string, { kind: WorkspaceKind; at: number }>();

/**
 * A workspace's kind, cached briefly per server instance. Voice and rules
 * resolution ask on every draft, and kind changes are rare.
 */
export async function workspaceKind(db: SupabaseClient, workspaceId: string): Promise<WorkspaceKind> {
  const cached = kindCache.get(workspaceId);
  if (cached && Date.now() - cached.at < KIND_TTL_MS) return cached.kind;
  const { data } = await db.from('workspaces').select('kind').eq('id', workspaceId).maybeSingle();
  const kind: WorkspaceKind = data?.kind === 'company' ? 'company' : 'client';
  kindCache.set(workspaceId, { kind, at: Date.now() });
  return kind;
}

export function forgetWorkspaceKind(workspaceId: string): void {
  kindCache.delete(workspaceId);
}

/**
 * Where a person's voice lives for a given brand. In a client workspace the
 * voice is the client's and is shared; in a company workspace it is the
 * person's own, so the personal scope (null) is used.
 */
export async function voiceScopeId(db: SupabaseClient, workspaceId: string | null): Promise<string | null> {
  if (!workspaceId) return null;
  return (await workspaceKind(db, workspaceId)) === 'company' ? null : workspaceId;
}

/**
 * Whether the caller may change a row that carries user_id and
 * workspace_id: its owner for personal rows, an owner or editor of the
 * workspace for shared ones. Throws 404 for rows the caller cannot see at
 * all, so existence is not leaked.
 */
export async function assertRowWritable(
  db: SupabaseClient,
  userId: string,
  table: string,
  id: string,
  notFound: string
): Promise<{ user_id: string; workspace_id: string | null }> {
  const { data } = await db.from(table).select('user_id, workspace_id').eq('id', id).maybeSingle();
  const row = data as { user_id: string; workspace_id: string | null } | null;
  if (!row) throw new HttpError(404, notFound);

  if (!row.workspace_id) {
    if (row.user_id !== userId) throw new HttpError(404, notFound);
    return row;
  }

  const membership = await resolveRole(db, userId, row.workspace_id);
  if (!membership) throw new HttpError(404, notFound);
  if (!canWrite(membership.role)) throw new HttpError(403, 'Your role in this workspace is read-only.');
  return row;
}
