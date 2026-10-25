'use client';

/**
 * Who is in the workspace and what each person may do. Owners and editors
 * invite; only the owner changes roles or removes people; anyone can leave.
 */

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api, useWorkspaceStore, type WorkspaceSummary } from '@/lib/forge/client';
import { MEMBER_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type MemberRole, type WorkspaceRole } from '@/lib/forge/labels';
import { UpsellCard } from '@/components/forge/views/UpsellCard';
import { Avatar, Button, Dialog, Field, LoadingRow, Tag, cn, copyText, focusRing, inputClass, relativeTime } from '@/components/forge/ui';

interface Member {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: string | null;
}

interface Invite {
  id: string;
  email: string;
  role: MemberRole;
  expires_at: string;
  created_at: string;
}

export function PeoplePanel({ workspace, meId }: { workspace: WorkspaceSummary; meId: string | null }) {
  const [data, setData] = useState<{ members: Member[]; invites: Invite[]; role: WorkspaceRole } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [locked, setLocked] = useState(false);
  const switchTo = useWorkspaceStore((s) => s.switchTo);
  const reloadWorkspaces = useWorkspaceStore((s) => s.load);

  const load = useCallback(async () => {
    try {
      setData(await api<{ members: Member[]; invites: Invite[]; role: WorkspaceRole }>(`/api/workspaces/${workspace.id}/members`));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not load the team.');
    }
  }, [workspace.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(member: Member, role: MemberRole) {
    try {
      await api(`/api/workspaces/${workspace.id}/members/${member.userId}`, { method: 'PATCH', json: { role } });
      setData((current) => (current ? { ...current, members: current.members.map((m) => (m.userId === member.userId ? { ...m, role } : m)) } : current));
      toast.success(`${member.name} is now ${role === 'editor' ? 'an editor' : `a ${role}`}.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not change the role.');
    }
  }

  async function remove(member: Member) {
    const leaving = member.userId === meId;
    try {
      await api(`/api/workspaces/${workspace.id}/members/${member.userId}`, { method: 'DELETE' });
      if (leaving) {
        toast.success(`You left ${workspace.name}.`);
        await switchTo(null);
        await reloadWorkspaces(true);
        return;
      }
      setData((current) => (current ? { ...current, members: current.members.filter((m) => m.userId !== member.userId) } : current));
      toast.success(`${member.name} was removed.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not do that.');
    }
  }

  async function revoke(invite: Invite) {
    try {
      await api(`/api/workspaces/${workspace.id}/invites/${invite.id}`, { method: 'DELETE' });
      setData((current) => (current ? { ...current, invites: current.invites.filter((i) => i.id !== invite.id) } : current));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not withdraw the invitation.');
    }
  }

  if (locked) return <UpsellCard feature="members" body="Bring editors, reviewers and clients into a workspace, with comments on lines, live co-editing, version history and an activity log." />;
  if (!data) return <LoadingRow label="Loading the team" />;

  const isOwner = data.role === 'owner';
  const canInvite = isOwner || data.role === 'editor';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-white/50">
          {data.members.length} {data.members.length === 1 ? 'person' : 'people'} in {workspace.name}
        </p>
        {canInvite && (
          <Button variant="primary" onClick={() => setInviting(true)}>
            Invite someone
          </Button>
        )}
      </div>

      <ul className="flex flex-col divide-y divide-white/[0.05] overflow-hidden rounded-[20px] border border-white/[0.07] bg-forge-card">
        {data.members.map((member) => (
          <li key={member.userId} className="flex flex-wrap items-center gap-3 px-5 py-4">
            <Avatar name={member.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-medium text-white">
                {member.name}
                {member.userId === meId && <span className="ml-2 text-[12px] font-normal text-white/35">You</span>}
              </p>
              <p className="truncate text-[12.5px] text-white/40">{member.email}</p>
            </div>
            {isOwner && member.role !== 'owner' ? (
              <select
                value={member.role}
                onChange={(e) => changeRole(member, e.target.value as MemberRole)}
                aria-label={`Role for ${member.name}`}
                className={cn('h-9 rounded-full border border-white/[0.1] bg-transparent px-3 text-[13px] text-white', focusRing)}
              >
                {MEMBER_ROLES.map((role) => (
                  <option key={role} value={role} className="bg-[#111]">
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            ) : (
              <Tag tone={member.role === 'owner' ? 'ember' : 'neutral'}>{ROLE_LABELS[member.role]}</Tag>
            )}
            {member.role !== 'owner' && (isOwner || member.userId === meId) && (
              <Button variant="quiet" size="xs" onClick={() => remove(member)}>
                {member.userId === meId ? 'Leave' : 'Remove'}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {data.invites.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/35">Invited</h3>
          <ul className="flex flex-col gap-1.5">
            {data.invites.map((invite) => (
              <li key={invite.id} className="flex items-center gap-3 rounded-[14px] bg-white/[0.025] px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-white/75">{invite.email}</span>
                <Tag>{ROLE_LABELS[invite.role]}</Tag>
                <span className="hidden text-[12px] text-white/35 sm:inline">expires {relativeTime(invite.expires_at)}</span>
                <Button variant="quiet" size="xs" onClick={() => revoke(invite)}>
                  Withdraw
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <InviteDialog
        open={inviting}
        onClose={() => setInviting(false)}
        workspace={workspace}
        onInvited={load}
        onLocked={() => {
          setInviting(false);
          setLocked(true);
        }}
      />
    </div>
  );
}

function InviteDialog({ open, onClose, workspace, onInvited, onLocked }: { open: boolean; onClose: () => void; workspace: WorkspaceSummary; onInvited: () => void; onLocked: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>(workspace.kind === 'client' ? 'client' : 'editor');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; emailed: boolean } | null>(null);

  const close = () => {
    setLink(null);
    setEmail('');
    onClose();
  };

  async function invite() {
    setBusy(true);
    try {
      const result = await api<{ url: string; emailed: boolean }>(`/api/workspaces/${workspace.id}/members`, { method: 'POST', json: { email: email.trim(), role } });
      setLink(result);
      onInvited();
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) onLocked();
      else toast.error(error instanceof ApiError ? error.message : 'Could not send the invitation.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={link ? 'Invitation sent' : `Invite to ${workspace.name}`}
      footer={
        link ? (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="quiet" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={invite} loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())}>
              Send invitation
            </Button>
          </>
        )
      }
    >
      {link ? (
        <div className="flex flex-col gap-4">
          <p className="text-[14px] leading-relaxed text-white/65">
            {link.emailed ? `We emailed ${email}.` : 'The email could not be sent.'} You can also send them this link. It works once, for {email}, for 14 days.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[12px] bg-white/[0.05] px-3 py-2.5 text-[12.5px] text-white/80">{link.url}</code>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                if (await copyText(link.url)) toast.success('Copied.');
              }}
            >
              Copy
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <Field label="Email" htmlFor="invite-email">
            <input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoFocus placeholder="name@company.com" />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[13px] font-medium text-white/80">Role</legend>
            {MEMBER_ROLES.map((option) => (
              <label key={option} className={cn('flex cursor-pointer items-start gap-3 rounded-[14px] border p-3.5 transition-colors', role === option ? 'border-white/30 bg-white/[0.04]' : 'border-white/[0.07] hover:border-white/15')}>
                <input type="radio" name="invite-role" value={option} checked={role === option} onChange={() => setRole(option)} className="mt-1 accent-[#FF8A2B]" />
                <span>
                  <span className="block text-[14px] font-medium text-white">{ROLE_LABELS[option]}</span>
                  <span className="mt-0.5 block text-[12.5px] text-white/50">{ROLE_DESCRIPTIONS[option]}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
      )}
    </Dialog>
  );
}
