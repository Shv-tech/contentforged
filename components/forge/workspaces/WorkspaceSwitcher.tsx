'use client';

/**
 * The brand the app is acting for, at the top of the sidebar.
 *
 * With no workspaces to switch to this is just the Forge wordmark. Otherwise
 * it switches between the personal brand, the workspaces the person owns
 * (clients, or their company) and the ones they were invited into, and every
 * view (Story Bank, voice, drafts, Recents) follows the switch.
 */

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, useWorkspaceStore, type WorkspaceSummary } from '@/lib/forge/client';
import { ROLE_LABELS } from '@/lib/forge/labels';
import { ForgeMark } from '../icons';
import { Popover, Spinner, cn, focusRing, inputClass } from '../ui';

export function WorkspaceSwitcher() {
  const { loaded, available, canCreate, activeId, workspaces, load, switchTo, create } = useWorkspaceStore();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<'client' | 'company'>('client');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded || !available) {
    return (
      <div className="flex items-center gap-2.5 px-1">
        <ForgeMark className="h-6 w-6" />
        <span className="text-[16px] font-semibold tracking-[-0.02em] text-white">Forge</span>
      </div>
    );
  }

  const active = workspaces.find((w) => w.id === activeId) ?? null;

  const choose = async (id: string | null, close: () => void) => {
    setBusy(id ?? 'personal');
    try {
      await switchTo(id);
      close();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not switch workspace.');
    } finally {
      setBusy(null);
    }
  };

  const submit = async (close: () => void) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy('new');
    try {
      const workspace = await create(trimmed, null, kind);
      setName('');
      setAdding(false);
      await switchTo(workspace.id);
      close();
      toast.success(kind === 'company' ? `Switched to ${workspace.name}. Invite your team from Team.` : `Switched to ${workspace.name}. Add their Brand DNA under Brand.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not create the workspace.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Popover
      align="start"
      className="w-[248px]"
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={id}
          className={cn(
            '-ml-1 flex max-w-[190px] items-center gap-2.5 rounded-[12px] px-1.5 py-1 text-left transition-colors hover:bg-white/[0.04]',
            focusRing
          )}
        >
          <WorkspaceBadge name={active?.name ?? null} />
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-semibold text-white">{active?.name ?? 'Personal'}</span>
            <span className="block text-[11px] text-white/40">{active ? workspaceHint(active) : 'Your brand'}</span>
          </span>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-white/40" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="m7 10 5 5 5-5" />
          </svg>
        </button>
      )}
    >
      {(close) => (
        <div className="flex flex-col">
          <Option label="Personal" hint="Your brand" selected={activeId === null} busy={busy === 'personal'} onClick={() => choose(null, close)} />
          {workspaces.length > 0 && <div className="my-1.5 h-px bg-white/[0.06]" />}
          {workspaces.map((workspace) => (
            <Option
              key={workspace.id}
              label={workspace.name}
              hint={workspaceHint(workspace)}
              selected={activeId === workspace.id}
              busy={busy === workspace.id}
              onClick={() => choose(workspace.id, close)}
            />
          ))}
          <div className="my-1.5 h-px bg-white/[0.06]" />
          {adding ? (
            <form
              className="flex flex-col gap-2 p-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void submit(close);
              }}
            >
              <div role="radiogroup" aria-label="Workspace type" className="grid grid-cols-2 gap-1 rounded-full bg-white/[0.04] p-0.5">
                {(['client', 'company'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={kind === option}
                    onClick={() => setKind(option)}
                    className={cn('h-7 rounded-full text-[12px] font-medium', kind === option ? 'bg-white text-black' : 'text-white/55 hover:text-white')}
                  >
                    {option === 'client' ? 'A client' : 'My company'}
                  </button>
                ))}
              </div>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={kind === 'client' ? 'Client name' : 'Company name'}
                maxLength={80}
                className={cn(inputClass, 'h-9 py-0 text-[13.5px]')}
                aria-label={kind === 'client' ? 'Client name' : 'Company name'}
              />
              <p className="px-1 text-[11.5px] leading-snug text-white/40">
                {kind === 'client' ? 'Everyone writes in the client’s one voice.' : 'Everyone writes in their own voice, under the company’s rules.'}
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAdding(false)} className="rounded-full px-3 py-1 text-[12.5px] text-white/50 hover:text-white">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim() || busy === 'new'}
                  className="rounded-full bg-white px-3 py-1 text-[12.5px] font-medium text-black disabled:opacity-50"
                >
                  {busy === 'new' ? 'Creating' : 'Create'}
                </button>
              </div>
            </form>
          ) : (
            canCreate && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="rounded-[12px] px-3 py-2 text-left text-[13.5px] text-white/60 hover:bg-white/[0.04] hover:text-white"
              >
                New workspace
              </button>
            )
          )}
        </div>
      )}
    </Popover>
  );
}

function workspaceHint(workspace: WorkspaceSummary): string {
  const kind = workspace.kind === 'company' ? 'Company' : 'Client';
  return workspace.role === 'owner' ? `${kind} workspace` : `${kind}, ${ROLE_LABELS[workspace.role].toLowerCase()}`;
}

function WorkspaceBadge({ name }: { name: string | null }) {
  if (!name) return <ForgeMark className="h-7 w-7 shrink-0" />;
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-forge-steel/40 to-white/[0.06] text-[12.5px] font-semibold text-white"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function Option({ label, hint, selected, busy, onClick }: { label: string; hint: string; selected: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn('flex items-center gap-3 rounded-[12px] px-3 py-2 text-left transition-colors', selected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]')}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-white">{label}</span>
        <span className="block truncate text-[11.5px] text-white/40">{hint}</span>
      </span>
      {busy ? (
        <Spinner className="h-3.5 w-3.5" />
      ) : selected ? (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-forge-gold" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      ) : null}
    </button>
  );
}
