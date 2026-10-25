'use client';

/**
 * Team: the people in the active workspace, how each of them is doing, what
 * has happened, and the monthly reports for the client. On the personal
 * brand it explains workspaces and lists the ones the person can open.
 */

import { useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, useActiveBrand, useWorkspaceStore } from '@/lib/forge/client';
import { ROLE_LABELS } from '@/lib/forge/labels';
import { useAppStore } from '@/lib/store';
import { ViewShell } from '@/components/forge/views/ViewShell';
import { UpsellCard } from '@/components/forge/views/UpsellCard';
import { Button, Card, Segmented, Tag } from '@/components/forge/ui';
import { PeoplePanel } from './PeoplePanel';
import { ActivityPanel, ReportsPanel, RollupPanel } from './TeamPanels';

type Tab = 'people' | 'results' | 'activity' | 'reports';

export function TeamView() {
  const brand = useActiveBrand();
  const user = useAppStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('people');

  if (!brand.workspace) return <PersonalTeam />;

  const workspace = brand.workspace;
  const canManage = workspace.role === 'owner' || workspace.role === 'editor';
  const tabs: ReadonlyArray<{ value: Tab; label: string }> = [
    { value: 'people', label: 'People' },
    ...(workspace.role !== 'client' ? [{ value: 'results' as const, label: 'Results by person' }] : []),
    ...(canManage ? [{ value: 'activity' as const, label: 'Activity' }] : []),
    { value: 'reports', label: 'Reports' },
  ];
  const current = tabs.some((t) => t.value === tab) ? tab : 'people';

  return (
    <ViewShell
      title="Team"
      subtitle={
        workspace.kind === 'company'
          ? `${workspace.name} posts as its people. Each person keeps their own voice; the brand's rules apply to everyone.`
          : `Everyone in ${workspace.name} writes in the client's voice. Clients and reviewers comment; editors change drafts.`
      }
      width="wide"
      actions={<Tag tone="ember">{workspace.role === 'owner' ? 'You own this workspace' : `You are ${workspace.role === 'editor' ? 'an editor' : `a ${ROLE_LABELS[workspace.role].toLowerCase()}`}`}</Tag>}
    >
      <div className="mb-6 overflow-x-auto pb-1">
        <Segmented<Tab> label="Team section" value={current} onChange={setTab} options={tabs} />
      </div>
      {current === 'people' && <PeoplePanel workspace={workspace} meId={user?.id ?? null} />}
      {current === 'results' && <RollupPanel workspace={workspace} />}
      {current === 'activity' && <ActivityPanel workspace={workspace} />}
      {current === 'reports' && <ReportsPanel workspace={workspace} />}
    </ViewShell>
  );
}

function PersonalTeam() {
  const { workspaces, canCreate, available, switchTo, create } = useWorkspaceStore();
  const [busy, setBusy] = useState<string | null>(null);

  const open = async (id: string) => {
    setBusy(id);
    try {
      await switchTo(id);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not switch.');
    } finally {
      setBusy(null);
    }
  };

  const start = async (kind: 'client' | 'company') => {
    setBusy(kind);
    try {
      const workspace = await create(kind === 'company' ? 'My company' : 'New client', null, kind);
      await switchTo(workspace.id);
      toast.success('Workspace created. Rename it and add Brand DNA under Brand.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not create the workspace.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ViewShell title="Team" subtitle="Your personal brand is yours alone. Work with other people in a workspace." width="wide">
      <div className="flex flex-col gap-8">
        {workspaces.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-white/35">Your workspaces</h2>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {workspaces.map((workspace) => (
                <li key={workspace.id}>
                  <Card className="flex items-center gap-4 p-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-white">{workspace.name}</p>
                      <p className="mt-0.5 text-[12.5px] text-white/45">
                        {workspace.kind === 'company' ? 'Company' : 'Client'} · {ROLE_LABELS[workspace.role]}
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" loading={busy === workspace.id} onClick={() => open(workspace.id)}>
                      Open
                    </Button>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}

        {canCreate ? (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Kind
              title="A client"
              body="For agencies and ghostwriters. One voice, the client's, shared by everyone who writes for them. Clients approve drafts and get a monthly report."
              action={
                <Button variant="primary" loading={busy === 'client'} onClick={() => start('client')}>
                  New client workspace
                </Button>
              }
            />
            <Kind
              title="Your company"
              body="For teams that post as themselves. Each person keeps their own measured voice; the brand's rules, Story Bank and formats are shared."
              action={
                <Button variant="secondary" loading={busy === 'company'} onClick={() => start('company')}>
                  New company workspace
                </Button>
              }
            />
          </section>
        ) : (
          !available && <UpsellCard feature="workspaces" body="Run each client, or your whole company, in its own workspace: shared Story Bank, roles, live co-editing, comments, an activity log and monthly reports." />
        )}

        <p className="text-[13px] leading-relaxed text-white/40">Invited to someone else&rsquo;s workspace? Open the link in the invitation email, signed in with the address it was sent to.</p>
      </div>
    </ViewShell>
  );
}

function Kind({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3 p-6">
      <h3 className="text-[17px] font-semibold text-white">{title}</h3>
      <p className="text-[14px] leading-relaxed text-white/55">{body}</p>
      <div className="mt-auto pt-2">{action}</div>
    </Card>
  );
}
