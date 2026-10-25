'use client';

/**
 * Brand settings: who this brand is (niche, handle, Brand DNA), the
 * language it writes in, where it publishes (connected accounts), and
 * whether it contributes to niche insights.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError, useConnectionsStore, useProfileStore, useWorkspaceStore, type ConnectionSummary } from '@/lib/forge/client';
import { LANGUAGE_NAMES, type WritingLanguage } from '@/lib/forge/types';
import { Button, Card, Field, Segmented, Tag, Toggle, cn, inputClass, relativeTime } from '../ui';
import { BlueskyGlyph, LinkedInGlyph, ThreadsGlyph, XGlyph } from '../icons';
import { ExtensionCard } from './ExtensionCard';

export function BrandSettingsPanel() {
  const activeId = useWorkspaceStore((s) => s.activeId);
  return (
    <div className="flex flex-col gap-5">
      {activeId ? <WorkspaceIdentity workspaceId={activeId} /> : <PersonalIdentity />}
      <LanguageCard />
      <ConnectionsCard />
      {!activeId && <InsightsCard />}
      {!activeId && <ExtensionCard />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

function PersonalIdentity() {
  const { profile, load, update } = useProfileStore();
  const [niche, setNiche] = useState('');
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!profile) return;
    setNiche(profile.niche ?? '');
    setHandle(profile.x_handle ?? '');
  }, [profile]);

  const dirty = profile !== null && (niche.trim() !== (profile.niche ?? '') || handle.trim().replace(/^@/, '') !== (profile.x_handle ?? ''));

  const save = async () => {
    setBusy(true);
    try {
      await update({ niche: niche.trim() || null, x_handle: handle.trim() || null });
      toast.success('Saved.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-[15px] font-semibold text-white">Your brand</h3>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Field label="Niche" htmlFor="brand-niche" hint="Two or three words. Signals and niche insights use it.">
          <input
            id="brand-niche"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            maxLength={80}
            placeholder="B2B SaaS founders"
            className={inputClass}
          />
        </Field>
        <Field label="X handle" htmlFor="brand-handle" hint="For importing your voice, finding posts you published, and your audit.">
          <input id="brand-handle" value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={60} placeholder="@yourhandle" className={inputClass} />
        </Field>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-white/50">
          Brand DNA lives in{' '}
          <Link href="/account?tab=personalization" className="text-forge-gold hover:underline">
            Account, Personalization
          </Link>
          .
        </p>
        <Button variant="primary" size="md" loading={busy} disabled={!dirty} onClick={save}>
          Save
        </Button>
      </div>
    </Card>
  );
}

function WorkspaceIdentity({ workspaceId }: { workspaceId: string }) {
  const { workspaces, update, remove } = useWorkspaceStore();
  const workspace = workspaces.find((w) => w.id === workspaceId);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [dna, setDna] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!workspace) return;
    setName(workspace.name);
    setEmail(workspace.client_email ?? '');
    setDna(workspace.brand_dna ?? '');
  }, [workspace]);

  if (!workspace) return null;

  const dirty = name.trim() !== workspace.name || email.trim() !== (workspace.client_email ?? '') || dna.trim() !== (workspace.brand_dna ?? '');

  const isOwner = workspace.role === 'owner';
  const canEdit = isOwner || workspace.role === 'editor';

  const save = async () => {
    setBusy(true);
    try {
      // Send only what changed: name and client email are the owner's to change.
      const patch: Parameters<typeof update>[1] = {};
      if (name.trim() !== workspace.name) patch.name = name.trim();
      if (email.trim() !== (workspace.client_email ?? '')) patch.client_email = email.trim() || null;
      if (dna.trim() !== (workspace.brand_dna ?? '')) patch.brand_dna = dna.trim() || null;
      await update(workspace.id, patch);
      toast.success('Saved.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const destroy = async () => {
    setBusy(true);
    try {
      await remove(workspace.id);
      toast.success(`${workspace.name} deleted.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not delete the workspace.');
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2">
        <h3 className="text-[15px] font-semibold text-white">{workspace.kind === 'company' ? 'Company' : 'Client'}</h3>
        <Tag tone="steel">Workspace</Tag>
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Field label="Name" htmlFor="ws-name">
          <input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputClass} disabled={!isOwner} />
        </Field>
        <Field label="Client email" htmlFor="ws-email" hint="Approval requests are sent here.">
          <input
            id="ws-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            placeholder="client@company.com"
            className={inputClass}
            disabled={!isOwner}
          />
        </Field>
      </div>
      <div className="mt-5">
        <Field
          label="Brand DNA"
          htmlFor="ws-dna"
          hint="Who they are, who they write for, what they believe, and how they sound. Every draft for this client starts here."
        >
          <textarea id="ws-dna" value={dna} onChange={(e) => setDna(e.target.value)} rows={8} maxLength={8000} className={cn(inputClass, 'resize-y')} disabled={!canEdit} />
        </Field>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        {confirming ? (
          <span className="flex items-center gap-2">
            <Button variant="danger" size="sm" onClick={destroy} disabled={busy}>
              Delete {workspace.name} and all its drafts
            </Button>
            <Button variant="quiet" size="sm" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </span>
        ) : isOwner ? (
          <Button variant="quiet" size="sm" onClick={() => setConfirming(true)}>
            Delete workspace
          </Button>
        ) : (
          <span />
        )}
        {canEdit && (
          <Button variant="primary" size="md" loading={busy && !confirming} disabled={!dirty || !name.trim()} onClick={save}>
            Save
          </Button>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

const LANGUAGE_HINT: Record<WritingLanguage, string> = {
  en: 'Drafts in English.',
  hi: 'Drafts in Hindi, in Devanagari. Platform names and technical terms stay as people write them.',
  hinglish: 'Drafts in Hinglish: Hindi and English mixed the way you speak, in Roman script. Forge matches how much you switch.',
};

/** The language this brand writes in. Forge also measures it from the voice samples and follows those when they disagree. */
function LanguageCard() {
  const activeId = useWorkspaceStore((s) => s.activeId);
  const workspace = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === s.activeId) ?? null);
  const updateWorkspace = useWorkspaceStore((s) => s.update);
  const { profile, load, update: updateProfile } = useProfileStore();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const value: WritingLanguage = (activeId ? workspace?.writing_language : profile?.writing_language) ?? 'en';
  const canEdit = !activeId || workspace?.role === 'owner' || workspace?.role === 'editor';

  const choose = async (next: WritingLanguage) => {
    if (next === value) return;
    setBusy(true);
    try {
      if (activeId && workspace) await updateWorkspace(workspace.id, { writing_language: next });
      else await updateProfile({ writing_language: next });
      toast.success(`Drafts will be written in ${LANGUAGE_NAMES[next]}.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not change the language.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-[15px] font-semibold text-white">Writing language</h3>
      <p className="mt-1 text-[13.5px] leading-relaxed text-white/50">{LANGUAGE_HINT[value]}</p>
      <div className={cn('mt-4', (busy || !canEdit) && 'pointer-events-none opacity-60')}>
        <Segmented<WritingLanguage>
          label="Writing language"
          value={value}
          onChange={choose}
          options={(Object.keys(LANGUAGE_NAMES) as WritingLanguage[]).map((language) => ({ value: language, label: LANGUAGE_NAMES[language] }))}
        />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

interface ConnectionsResponse {
  connections: ConnectionSummary[];
  xHandle: string | null;
  publishing: boolean;
  providers: { linkedin: boolean; threads: boolean; bluesky: boolean };
}

function ConnectionsCard() {
  const [data, setData] = useState<ConnectionsResponse | null>(null);
  const [blueskyOpen, setBlueskyOpen] = useState(false);
  const activeId = useWorkspaceStore((s) => s.activeId);

  const load = async () => {
    try {
      setData(await api<ConnectionsResponse>('/api/connections'));
      void useConnectionsStore.getState().load(true);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not load connections.');
    }
  };

  useEffect(() => {
    void load();
  }, [activeId]);

  const disconnect = async (platform: ConnectionSummary['platform']) => {
    try {
      await api(`/api/connections/${platform}`, { method: 'DELETE' });
      void load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not disconnect.');
    }
  };

  const connectionFor = (platform: ConnectionSummary['platform']) => data?.connections.find((c) => c.platform === platform) ?? null;
  const returnTo = encodeURIComponent('/dashboard?view=brand&tab=settings');

  return (
    <Card className="p-6">
      <h3 className="text-[15px] font-semibold text-white">Publishing</h3>
      <p className="mt-1 text-[13.5px] leading-relaxed text-white/55">
        Connected accounts publish straight from a draft card and report results back. X drafts open in X&apos;s own composer, so Forge never needs write access
        to your X account.
      </p>

      {data && !data.publishing && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
          <p className="text-[13px] text-white/70">Publishing to LinkedIn, Threads and Bluesky is on Starter.</p>
          <Link href="/account?tab=billing" className="rounded-full bg-white px-3 py-1 text-[12.5px] font-medium text-black">
            Compare plans
          </Link>
        </div>
      )}

      <ul className="mt-5 flex flex-col divide-y divide-white/[0.05]">
        <ConnectionRow
          icon={<XGlyph className="h-4 w-4" />}
          name="X"
          detail={data?.xHandle ? `@${data.xHandle}` : 'Set your handle above'}
          status={data?.xHandle ? 'Composer' : null}
        />
        <ConnectionRow
          icon={<LinkedInGlyph className="h-4 w-4" />}
          name="LinkedIn"
          detail={connectionFor('linkedin')?.account_name ?? (data?.providers.linkedin ? 'Not connected' : 'Not configured on this server')}
          status={connectionFor('linkedin') ? expiryLabel(connectionFor('linkedin')!) : null}
          action={
            connectionFor('linkedin') ? (
              <Button variant="quiet" size="xs" onClick={() => disconnect('linkedin')}>
                Disconnect
              </Button>
            ) : data?.providers.linkedin && data.publishing ? (
              <a
                href={`/api/connections/linkedin/start?return_to=${returnTo}`}
                className="rounded-full border border-white/[0.12] px-3 py-1 text-[12.5px] font-medium text-white hover:bg-white/[0.06]"
              >
                Connect
              </a>
            ) : null
          }
        />
        <ConnectionRow
          icon={<ThreadsGlyph className="h-4 w-4" />}
          name="Threads"
          detail={
            connectionFor('threads')?.account_handle
              ? `@${connectionFor('threads')!.account_handle}`
              : data?.providers.threads
                ? 'Not connected'
                : 'Not configured on this server'
          }
          status={connectionFor('threads') ? expiryLabel(connectionFor('threads')!) : null}
          action={
            connectionFor('threads') ? (
              <Button variant="quiet" size="xs" onClick={() => disconnect('threads')}>
                Disconnect
              </Button>
            ) : data?.providers.threads && data.publishing ? (
              <a
                href={`/api/connections/threads/start?return_to=${returnTo}`}
                className="rounded-full border border-white/[0.12] px-3 py-1 text-[12.5px] font-medium text-white hover:bg-white/[0.06]"
              >
                Connect
              </a>
            ) : null
          }
        />
        <ConnectionRow
          icon={<BlueskyGlyph className="h-4 w-4" />}
          name="Bluesky"
          detail={connectionFor('bluesky')?.account_handle ? `@${connectionFor('bluesky')!.account_handle}` : 'Not connected'}
          status={connectionFor('bluesky') ? 'Connected' : null}
          action={
            connectionFor('bluesky') ? (
              <Button variant="quiet" size="xs" onClick={() => disconnect('bluesky')}>
                Disconnect
              </Button>
            ) : data?.publishing ? (
              <Button variant="secondary" size="xs" onClick={() => setBlueskyOpen(!blueskyOpen)}>
                Connect
              </Button>
            ) : null
          }
        />
      </ul>

      {blueskyOpen && !connectionFor('bluesky') && (
        <BlueskyForm
          onDone={() => {
            setBlueskyOpen(false);
            void load();
          }}
        />
      )}
    </Card>
  );
}

function expiryLabel(connection: ConnectionSummary): string {
  if (!connection.expires_at) return 'Connected';
  const ms = new Date(connection.expires_at).getTime() - Date.now();
  if (ms <= 0) return 'Expired, reconnect';
  if (ms < 7 * 86_400_000) return `Expires ${relativeTime(connection.expires_at)}`;
  return 'Connected';
}

function ConnectionRow({
  icon,
  name,
  detail,
  status,
  action,
}: {
  icon: React.ReactNode;
  name: string;
  detail: string;
  status: string | null;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-4 py-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-white/[0.05] text-white">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-white">{name}</span>
        <span className="block truncate text-[12.5px] text-white/45">{detail}</span>
      </span>
      {status && (
        <Tag tone={status.startsWith('Expired') ? 'bad' : 'good'} dot>
          {status}
        </Tag>
      )}
      {action}
    </li>
  );
}

function BlueskyForm({ onDone }: { onDone: () => void }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    try {
      const result = await api<{ handle: string }>('/api/connections/bluesky', { method: 'POST', json: { identifier, appPassword: password } });
      toast.success(`Connected @${result.handle}.`);
      onDone();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not connect Bluesky.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="mt-4 flex flex-col gap-4 rounded-[18px] border border-white/[0.08] bg-white/[0.02] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void connect();
      }}
    >
      <p className="text-[13px] leading-relaxed text-white/55">
        Use an app password, not your account password. Create one in Bluesky under Settings, Privacy and security, App passwords. You can revoke it there at
        any time.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="you.bsky.social"
          aria-label="Bluesky handle"
          autoComplete="username"
          className={inputClass}
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="xxxx-xxxx-xxxx-xxxx"
          aria-label="App password"
          autoComplete="off"
          className={inputClass}
        />
      </div>
      <Button type="submit" variant="primary" size="md" className="self-end" loading={busy} disabled={!identifier.trim() || !password.trim()}>
        Connect Bluesky
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Niche insights
// ---------------------------------------------------------------------------

function InsightsCard() {
  const { profile, load, update } = useProfileStore();

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (next: boolean) => {
    try {
      await update({ share_anonymous_insights: next });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save.');
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h3 className="text-[15px] font-semibold text-white">Niche insights</h3>
          <p className="mt-1 max-w-[560px] text-[13.5px] leading-relaxed text-white/55">
            Contribute what works in your posts, as patterns only (hook type, length, hour posted, relative performance), to what creators in your niche see. No
            text, no handles. A pattern is shown only once at least five creators contribute to it.
          </p>
        </div>
        <Toggle checked={Boolean(profile?.share_anonymous_insights)} onChange={toggle} label="Share anonymous patterns" />
      </div>
    </Card>
  );
}
