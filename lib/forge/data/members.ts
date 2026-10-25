/**
 * lib/forge/data/members.ts
 *
 * Who is in a workspace and with what role, and how people join.
 *
 * Invitations are single-use links sent to one email address. Only the
 * SHA-256 of the token is stored, and an invitation can only be accepted by
 * an account with the same email address, so a forwarded link does not let
 * someone else in.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { sendWorkspaceInviteEmail } from '@/lib/mail-service';
import { appUrl } from '../app-url';
import { randomToken, sha256Hex } from '../crypto';
import { HttpError } from '../http';
import { personById } from '../profile';
import { recordAudit } from './collab';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type MemberRole, type WorkspaceRole } from './workspace';

export const MAX_MEMBERS = 50;

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: string | null;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: MemberRole;
  expires_at: string;
  created_at: string;
}

export async function listMembers(workspaceId: string): Promise<{ members: Member[]; invites: PendingInvite[] }> {
  const service = createServiceClient();
  const [{ data: workspace }, { data: rows }, { data: invites }] = await Promise.all([
    service.from('workspaces').select('owner_id, created_at').eq('id', workspaceId).maybeSingle(),
    service.from('workspace_members').select('user_id, role, created_at').eq('workspace_id', workspaceId).order('created_at'),
    service
      .from('workspace_invites')
      .select('id, email, role, expires_at, created_at')
      .eq('workspace_id', workspaceId)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  ]);
  if (!workspace) throw new HttpError(404, 'Workspace not found.');

  const entries: Array<{ userId: string; role: WorkspaceRole; joinedAt: string | null }> = [
    { userId: workspace.owner_id, role: 'owner', joinedAt: workspace.created_at },
    ...((rows ?? []) as Array<{ user_id: string; role: MemberRole; created_at: string }>).map((m) => ({ userId: m.user_id, role: m.role as WorkspaceRole, joinedAt: m.created_at })),
  ];

  const members = await Promise.all(
    entries.map(async (entry) => {
      const person = await personById(entry.userId);
      return { ...entry, name: person?.name ?? 'Former member', email: person?.email ?? '' };
    })
  );
  return { members, invites: (invites ?? []) as PendingInvite[] };
}

export async function inviteMember(input: { workspaceId: string; workspaceName: string; inviterId: string; inviterName: string; email: string; role: MemberRole }): Promise<{ invite: PendingInvite; url: string; emailed: boolean }> {
  const service = createServiceClient();
  const email = input.email.trim().toLowerCase();

  const { count } = await service.from('workspace_members').select('user_id', { count: 'exact', head: true }).eq('workspace_id', input.workspaceId);
  if ((count ?? 0) >= MAX_MEMBERS) throw new HttpError(409, `A workspace can have up to ${MAX_MEMBERS} members.`);

  const { members } = await listMembers(input.workspaceId);
  if (members.some((m) => m.email.toLowerCase() === email)) throw new HttpError(409, 'That person is already in this workspace.');

  // A new invitation to the same address replaces the old one.
  await service.from('workspace_invites').delete().eq('workspace_id', input.workspaceId).eq('email', email).is('accepted_at', null);

  const token = randomToken(24);
  const { data, error } = await service
    .from('workspace_invites')
    .insert({ workspace_id: input.workspaceId, email, role: input.role, token_hash: sha256Hex(token), invited_by: input.inviterId })
    .select('id, email, role, expires_at, created_at')
    .single();
  if (error || !data) throw new Error(`Could not create the invitation: ${error?.message ?? 'unknown error'}`);

  const url = `${appUrl()}/invite/${token}`;
  const emailed = await sendWorkspaceInviteEmail({
    to: email,
    inviterName: input.inviterName,
    workspaceName: input.workspaceName,
    roleLabel: ROLE_LABELS[input.role],
    roleDescription: ROLE_DESCRIPTIONS[input.role],
    url,
  });

  await recordAudit(input.workspaceId, input.inviterId, 'member.invited', { type: 'invite', id: data.id, detail: { email, role: input.role } });
  return { invite: data as PendingInvite, url, emailed };
}

export interface InviteDetails {
  id: string;
  workspaceId: string;
  workspaceName: string;
  inviterName: string;
  email: string;
  role: MemberRole;
  expired: boolean;
  accepted: boolean;
}

export async function inviteByToken(token: string): Promise<InviteDetails | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const service = createServiceClient();
  const { data } = await service.from('workspace_invites').select('id, workspace_id, email, role, invited_by, expires_at, accepted_at').eq('token_hash', sha256Hex(token)).maybeSingle();
  if (!data) return null;
  const [{ data: workspace }, inviter] = await Promise.all([
    service.from('workspaces').select('name').eq('id', data.workspace_id).maybeSingle(),
    data.invited_by ? personById(data.invited_by) : Promise.resolve(null),
  ]);
  if (!workspace) return null;
  return {
    id: data.id,
    workspaceId: data.workspace_id,
    workspaceName: workspace.name,
    inviterName: inviter?.name ?? 'A teammate',
    email: data.email,
    role: data.role as MemberRole,
    expired: new Date(data.expires_at).getTime() < Date.now(),
    accepted: Boolean(data.accepted_at),
  };
}

export async function acceptInvite(token: string, user: { id: string; email: string }): Promise<{ workspaceId: string }> {
  const invite = await inviteByToken(token);
  if (!invite) throw new HttpError(404, 'This invitation does not exist.');
  if (invite.accepted) throw new HttpError(409, 'This invitation has already been used.');
  if (invite.expired) throw new HttpError(410, 'This invitation has expired. Ask for a new one.');
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new HttpError(403, `This invitation is for ${invite.email}. Sign in with that address to accept it.`);
  }

  const service = createServiceClient();
  const { data: workspace } = await service.from('workspaces').select('owner_id').eq('id', invite.workspaceId).maybeSingle();
  if (workspace?.owner_id === user.id) throw new HttpError(409, 'You own this workspace already.');

  const { error } = await service
    .from('workspace_members')
    .upsert({ workspace_id: invite.workspaceId, user_id: user.id, role: invite.role }, { onConflict: 'workspace_id,user_id' });
  if (error) throw new Error(`Could not add you to the workspace: ${error.message}`);

  await service.from('workspace_invites').update({ accepted_at: new Date().toISOString(), accepted_by: user.id }).eq('id', invite.id).is('accepted_at', null);
  await service.from('profiles').update({ active_workspace_id: invite.workspaceId }).eq('id', user.id);
  await recordAudit(invite.workspaceId, user.id, 'member.joined', { type: 'member', id: user.id, detail: { role: invite.role } });
  return { workspaceId: invite.workspaceId };
}

export async function changeRole(workspaceId: string, actorId: string, userId: string, role: MemberRole): Promise<void> {
  const { data, error } = await createServiceClient().from('workspace_members').update({ role }).eq('workspace_id', workspaceId).eq('user_id', userId).select('user_id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new HttpError(404, 'That person is not a member.');
  await recordAudit(workspaceId, actorId, 'member.role_changed', { type: 'member', id: userId, detail: { role } });
}

export async function removeMember(workspaceId: string, actorId: string, userId: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from('workspace_members').delete().eq('workspace_id', workspaceId).eq('user_id', userId);
  if (error) throw new Error(error.message);
  await service.from('profiles').update({ active_workspace_id: null }).eq('id', userId).eq('active_workspace_id', workspaceId);
  await recordAudit(workspaceId, actorId, 'member.removed', { type: 'member', id: userId, detail: { left: actorId === userId } });
}

export async function revokeInvite(workspaceId: string, inviteId: string): Promise<void> {
  await createServiceClient().from('workspace_invites').delete().eq('workspace_id', workspaceId).eq('id', inviteId).is('accepted_at', null);
}

/** Everyone who should hear about activity on a workspace draft, except the actor. */
export async function draftParticipants(workspaceId: string | null, draft: { user_id: string; created_by: string | null }, actorId: string, commenterIds: string[]): Promise<string[]> {
  const ids = new Set<string>([draft.user_id, ...(draft.created_by ? [draft.created_by] : []), ...commenterIds]);
  if (workspaceId) {
    const { data } = await createServiceClient().from('workspaces').select('owner_id').eq('id', workspaceId).maybeSingle();
    if (data?.owner_id) ids.add(data.owner_id);
  }
  ids.delete(actorId);
  return Array.from(ids);
}
