'use client';

/**
 * Account sections beyond the brief and the plan: notifications, connected
 * accounts, API keys, invoices, and the two actions that must be complete
 * to be honest: download my data, and delete my account.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { ApiError, api, useConnectionsStore, useWorkspaceStore } from '@/lib/forge/client';
import type { NotificationPreferences } from '@/lib/forge/notify';
import { currentSubscription, disablePush, enablePush, pushSupport, type PushSupport } from '@/lib/forge/push-client';
import type { ApiScope } from '@/lib/forge/http';
import { useAppStore } from '@/lib/store';
import { Dialog, Toggle, cn, copyText, relativeTime } from '@/components/forge/ui';
import { SectionHead, fieldDark, panel, pillGhost, pillWhite } from './accountStyle';

// ============================================================================
// NOTIFICATIONS
// ============================================================================

const PREFERENCE_ROWS: ReadonlyArray<{ email?: keyof NotificationPreferences; push?: keyof NotificationPreferences; title: string; body: string }> = [
  { email: 'plan_email', push: 'plan_push', title: 'Your weekly plan is ready', body: 'When this week’s drafts are written and waiting for review.' },
  { email: 'comments_email', push: 'comments_push', title: 'Comments on your drafts', body: 'When someone comments on a draft you wrote or are working on.' },
  { email: 'results_email', title: 'Results worth knowing', body: 'When a post does far better than usual, or an experiment has an answer.' },
  { email: 'reports_email', title: 'Send monthly reports to clients', body: 'On the 1st, email each client their report link. Off, and you send the links yourself.' },
];

interface NotificationsResponse {
  preferences: NotificationPreferences;
  push: { available: boolean; publicKey: string | null; devices: Array<{ id: string; user_agent: string | null; created_at: string; last_used_at: string | null }> };
}

export function NotificationsSection() {
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [support, setSupport] = useState<PushSupport>('unsupported');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<NotificationsResponse>('/api/account/notifications'));
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    void load();
    setSupport(pushSupport());
    void currentSubscription().then((s) => setSubscribed(Boolean(s)));
  }, [load]);

  async function setPreference(key: keyof NotificationPreferences, value: boolean) {
    if (!data) return;
    setData({ ...data, preferences: { ...data.preferences, [key]: value } });
    try {
      await api('/api/account/notifications', { method: 'PATCH', json: { [key]: value } });
    } catch (error) {
      setData(data);
      toast.error(error instanceof ApiError ? error.message : 'Could not save that.');
    }
  }

  async function togglePush() {
    if (!data?.push.publicKey) return;
    setBusy(true);
    try {
      if (subscribed) {
        await disablePush();
        setSubscribed(false);
        toast.success('This device will not get notifications.');
      } else {
        const ok = await enablePush(data.push.publicKey);
        setSubscribed(ok);
        if (ok) toast.success('This device will get notifications.');
        else toast.error('Notifications are blocked for this site. Allow them in your browser settings.');
      }
      void load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not change notifications on this device.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="notifications" className="scroll-mt-36 lg:scroll-mt-28">
      <SectionHead title="Notifications." lead="Only for things you would want to be interrupted for. Every one can be turned off." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className={panel}>
          <div className="mb-2 hidden grid-cols-[1fr_64px_64px] text-[12px] text-white/35 sm:grid">
            <span />
            <span className="text-center">Email</span>
            <span className="text-center">Push</span>
          </div>
          <ul className="flex flex-col divide-y divide-white/[0.06]">
            {PREFERENCE_ROWS.map((row) => (
              <li key={row.title} className="grid grid-cols-[1fr_auto] items-center gap-4 py-4 sm:grid-cols-[1fr_64px_64px]">
                <div>
                  <p className="text-[15px] font-medium text-white">{row.title}</p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-white/45">{row.body}</p>
                </div>
                <div className="flex gap-4 sm:contents">
                  <span className="flex justify-center">
                    {row.email && data && <Toggle checked={data.preferences[row.email]} onChange={(value) => setPreference(row.email!, value)} label={`${row.title} by email`} />}
                  </span>
                  <span className="flex justify-center">
                    {row.push && data && <Toggle checked={data.preferences[row.push]} onChange={(value) => setPreference(row.push!, value)} label={`${row.title} as push`} />}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className={cn(panel, 'flex flex-col justify-between gap-6')}>
          <div>
            <p className="text-[13.5px] text-white/45">This device</p>
            <p className="mt-3 text-[15px] leading-relaxed text-white/65">
              {!data?.push.available
                ? 'Push notifications are not set up on this server.'
                : support === 'needs-install'
                  ? 'On iPhone and iPad, add Forge to your home screen first (Share, Add to Home Screen), then turn notifications on from there.'
                  : support === 'denied'
                    ? 'Notifications are blocked for this site. Allow them in your browser settings to turn them on.'
                    : support === 'unsupported'
                      ? 'This browser does not support push notifications.'
                      : subscribed
                        ? 'This device gets your Forge notifications.'
                        : 'Get the Monday plan and comments as notifications here.'}
            </p>
            {data && data.push.devices.length > 0 && (
              <p className="mt-3 text-[13px] text-white/35">
                {data.push.devices.length} {data.push.devices.length === 1 ? 'device' : 'devices'} signed up.
              </p>
            )}
          </div>
          {data?.push.available && support === 'supported' && (
            <button type="button" onClick={togglePush} disabled={busy} className={cn(subscribed ? pillGhost : pillWhite, 'self-start')}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : subscribed ? 'Turn off here' : 'Turn on here'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// CONNECTED ACCOUNTS
// ============================================================================

interface ExtensionToken {
  id: string;
  label: string;
  last_used_at: string | null;
  created_at: string;
}

const PLATFORM_NAME: Record<string, string> = { linkedin: 'LinkedIn', threads: 'Threads', bluesky: 'Bluesky' };

export function ConnectionsSection() {
  const { connections, xHandle, load } = useConnectionsStore();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const [tokens, setTokens] = useState<ExtensionToken[] | null>(null);

  const loadTokens = useCallback(async () => {
    try {
      setTokens((await api<{ tokens: ExtensionToken[] }>('/api/extension/tokens')).tokens);
    } catch {
      setTokens([]);
    }
  }, []);

  useEffect(() => {
    void load(true);
    void loadTokens();
  }, [load, loadTokens]);

  async function revoke(token: ExtensionToken) {
    try {
      await api(`/api/extension/tokens/${token.id}`, { method: 'DELETE' });
      setTokens((current) => (current ?? []).filter((t) => t.id !== token.id));
      toast.success('Revoked. That browser is signed out of the extension.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not revoke it.');
    }
  }

  return (
    <section id="connections" className="scroll-mt-36 lg:scroll-mt-28">
      <SectionHead
        title="Connections."
        lead="Accounts Forge can publish to or read from, and the browsers your extension is signed into. Connections belong to the brand you were on when you made them."
        aside={
          <Link href="/dashboard?view=brand&tab=settings" className={pillGhost}>
            Manage in Brand
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className={panel}>
          <p className="text-[13.5px] text-white/45">Publishing</p>
          <ul className="mt-4 flex flex-col gap-3">
            <li className="flex items-center justify-between gap-3">
              <span className="text-[15px] text-white">X</span>
              <span className="text-[13.5px] text-white/50">{xHandle ? `@${xHandle}, read only. You post.` : 'Not set'}</span>
            </li>
            {(['linkedin', 'threads', 'bluesky'] as const).map((platform) => {
              const connection = connections.find((c) => c.platform === platform);
              return (
                <li key={platform} className="flex items-center justify-between gap-3">
                  <span className="text-[15px] text-white">{PLATFORM_NAME[platform]}</span>
                  <span className={cn('text-[13.5px]', connection ? 'text-[#8EE3B0]' : 'text-white/40')}>{connection ? (connection.account_name ?? connection.account_handle ?? 'Connected') : 'Not connected'}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 text-[13px] leading-relaxed text-white/35">GitHub, Linear, Notion and calendars are under Inbox, Sources. Booking tools are under Playbook, Goals.</p>
        </div>

        <div className={panel}>
          <p className="text-[13.5px] text-white/45">Browser extension</p>
          {tokens === null ? (
            <Loader2 className="mt-4 h-4 w-4 animate-spin text-white/40" />
          ) : tokens.length === 0 ? (
            <p className="mt-4 text-[15px] leading-relaxed text-white/55">Not signed in anywhere. Set it up under Brand, Settings.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {tokens.map((token) => (
                <li key={token.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] text-white">{token.label}</span>
                    <span className="text-[12.5px] text-white/35">{token.last_used_at ? `Used ${relativeTime(token.last_used_at)}` : 'Never used'}</span>
                  </span>
                  <button type="button" onClick={() => revoke(token)} className="text-[13px] text-white/50 hover:text-[#FF9A85]">
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
          {workspaces.length > 0 && <p className="mt-6 text-[13px] leading-relaxed text-white/35">You are in {workspaces.length} {workspaces.length === 1 ? 'workspace' : 'workspaces'}. Manage them under Team.</p>}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// API KEYS
// ============================================================================

interface ApiKey {
  id: string;
  label: string;
  prefix: string | null;
  scopes: ApiScope[];
  workspace_id: string | null;
  last_used_at: string | null;
  created_at: string;
}

export function ApiKeysSection() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [scopeInfo, setScopeInfo] = useState<Record<ApiScope, string> | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [locked, setLocked] = useState(false);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [scopes, setScopes] = useState<ApiScope[]>(['read']);
  const [pin, setPin] = useState<string>('');
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ keys: ApiKey[]; scopes: Record<ApiScope, string>; baseUrl: string }>('/api/keys');
      setKeys(data.keys);
      setScopeInfo(data.scopes);
      setBaseUrl(data.baseUrl);
    } catch {
      setKeys([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    try {
      const { key } = await api<{ key: string }>('/api/keys', { method: 'POST', json: { label: label.trim(), scopes, workspaceId: pin || null } });
      setCreated(key);
      void load();
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) {
        setCreating(false);
        setLocked(true);
      } else toast.error(error instanceof ApiError ? error.message : 'Could not create the key.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(key: ApiKey) {
    try {
      await api(`/api/keys/${key.id}`, { method: 'DELETE' });
      setKeys((current) => (current ?? []).filter((k) => k.id !== key.id));
      toast.success('Revoked. Requests with it now fail.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not revoke it.');
    }
  }

  const close = () => {
    setCreating(false);
    setCreated(null);
    setLabel('');
    setScopes(['read']);
    setPin('');
  };

  const mcpConfig = JSON.stringify({ mcpServers: { forge: { url: `${baseUrl}/api/mcp`, headers: { Authorization: 'Bearer fx_your_key' } } } }, null, 2);

  return (
    <section id="developers" className="scroll-mt-36 lg:scroll-mt-28">
      <SectionHead
        title="API and MCP."
        lead="Let other tools write as you, check text against your voice and look up your true stories. Claude and other assistants connect through the MCP server; everything else through the REST API."
        aside={
          !locked && (
            <button type="button" onClick={() => setCreating(true)} className={pillWhite}>
              New key
            </button>
          )
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className={panel}>
          <p className="text-[13.5px] text-white/45">Keys</p>
          {locked ? (
            <p className="mt-4 text-[15px] leading-relaxed text-white/60">
              The API and MCP server are on Pro.{' '}
              <Link href="/account?tab=billing" className="text-white underline underline-offset-4">
                See plans
              </Link>
            </p>
          ) : keys === null ? (
            <Loader2 className="mt-4 h-4 w-4 animate-spin text-white/40" />
          ) : keys.length === 0 ? (
            <p className="mt-4 text-[15px] leading-relaxed text-white/55">No keys yet.</p>
          ) : (
            <ul className="mt-4 flex flex-col divide-y divide-white/[0.06]">
              {keys.map((key) => (
                <li key={key.id} className="flex items-center gap-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] text-white">{key.label}</p>
                    <p className="mt-0.5 text-[12.5px] text-white/35">
                      <span className="font-mono">{key.prefix}…</span> · {key.scopes.join(', ')}
                      {key.workspace_id && ` · ${workspaces.find((w) => w.id === key.workspace_id)?.name ?? 'a workspace'}`} · {key.last_used_at ? `used ${relativeTime(key.last_used_at)}` : 'never used'}
                    </p>
                  </div>
                  <button type="button" onClick={() => revoke(key)} className="text-[13px] text-white/50 hover:text-[#FF9A85]">
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={panel}>
          <p className="text-[13.5px] text-white/45">Connect Claude</p>
          <p className="mt-3 text-[14px] leading-relaxed text-white/60">Add Forge as a remote MCP server with this configuration, using a key with the scopes you want it to have.</p>
          <pre className="mt-4 overflow-x-auto rounded-[18px] bg-black/60 p-4 text-[12px] leading-relaxed text-white/75">{mcpConfig}</pre>
          <p className="mt-4 text-[13px] leading-relaxed text-white/40">
            REST: <span className="font-mono text-white/60">{baseUrl}/api/v1/me</span>, <span className="font-mono text-white/60">/voice</span>, <span className="font-mono text-white/60">/voice/check</span>, <span className="font-mono text-white/60">/grade</span>,{' '}
            <span className="font-mono text-white/60">/drafts</span>, <span className="font-mono text-white/60">/stories</span>, <span className="font-mono text-white/60">/ideas</span>. Drafts made through the API are saved for you to review; nothing is posted.
          </p>
        </div>
      </div>

      <Dialog
        open={creating}
        onClose={close}
        title={created ? 'Copy your key now' : 'New API key'}
        footer={
          created ? (
            <button type="button" onClick={close} className={pillWhite}>
              Done
            </button>
          ) : (
            <>
              <button type="button" onClick={close} className={pillGhost}>
                Cancel
              </button>
              <button type="button" onClick={create} disabled={busy || !label.trim() || scopes.length === 0} className={pillWhite}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create key'}
              </button>
            </>
          )
        }
      >
        {created ? (
          <div className="flex flex-col gap-4">
            <p className="text-[14px] leading-relaxed text-white/60">This is the only time it is shown. Forge keeps only a fingerprint of it.</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-[14px] bg-white/[0.05] px-4 py-3 font-mono text-[12.5px] text-white/85">{created}</code>
              <button
                type="button"
                className={pillGhost}
                onClick={async () => {
                  if (await copyText(created)) toast.success('Copied.');
                }}
              >
                Copy
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-[13.5px] text-white/60">Name</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} className={fieldDark} placeholder="Claude desktop" autoFocus />
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[13.5px] text-white/60">What it can do</legend>
              {(['read', 'write', 'generate'] as ApiScope[]).map((scope) => (
                <label key={scope} className="flex cursor-pointer items-start gap-3 rounded-[16px] border border-white/[0.08] p-3.5">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={() => setScopes((current) => (current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]))}
                    className="mt-1 accent-[#FF8A2B]"
                  />
                  <span>
                    <span className="block text-[14px] font-medium capitalize text-white">{scope}</span>
                    <span className="mt-0.5 block text-[12.5px] text-white/45">{scopeInfo?.[scope]}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {workspaces.length > 0 && (
              <label className="flex flex-col gap-2">
                <span className="text-[13.5px] text-white/60">Brand</span>
                <select value={pin} onChange={(e) => setPin(e.target.value)} className={cn(fieldDark, 'appearance-none')}>
                  <option value="" className="bg-[#111]">
                    Whichever brand is active in Forge
                  </option>
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id} className="bg-[#111]">
                      Always {workspace.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </Dialog>
    </section>
  );
}

// ============================================================================
// INVOICES
// ============================================================================

interface Invoice {
  id: string;
  number: string | null;
  status: string;
  amount: number;
  amountPaid: number;
  currency: string;
  issuedAt: string | null;
  paidAt: string | null;
  url: string | null;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount / 100);
  } catch {
    return `${currency} ${(amount / 100).toFixed(2)}`;
  }
}

export function InvoicesSection() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    api<{ invoices: Invoice[]; unavailable?: boolean }>('/api/account/invoices')
      .then((data) => {
        setInvoices(data.invoices);
        setUnavailable(Boolean(data.unavailable));
      })
      .catch(() => setInvoices([]));
  }, []);

  if (invoices === null || (invoices.length === 0 && !unavailable)) return null;

  return (
    <section id="invoices" className="scroll-mt-36 lg:scroll-mt-28">
      <div className={panel}>
        <p className="text-[13.5px] text-white/45">Invoices</p>
        {unavailable ? (
          <p className="mt-4 text-[15px] text-white/55">Invoices could not be loaded right now. Your payment receipts are also in your email.</p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-white/[0.06]">
            {invoices.map((invoice) => (
              <li key={invoice.id} className="flex flex-wrap items-center gap-4 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] text-white">{invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : 'Invoice'}</span>
                  <span className="text-[12.5px] text-white/35">
                    {invoice.number ?? invoice.id} · {invoice.status === 'paid' ? 'Paid' : invoice.status}
                  </span>
                </span>
                <span className="text-[15px] tabular-nums text-white/80">{money(invoice.amountPaid || invoice.amount, invoice.currency)}</span>
                {invoice.url && (
                  <a href={invoice.url} target="_blank" rel="noreferrer noopener" className="text-[13.5px] text-white/60 underline underline-offset-4 hover:text-white">
                    View and download
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ============================================================================
// YOUR DATA
// ============================================================================

export function DataSection() {
  const router = useRouter();
  const { user, setUser } = useAppStore();
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      const response = await fetch('/api/account/export', { cache: 'no-store' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Could not prepare your data.');
      }
      const blob = await response.blob();
      const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? 'forge-export.zip';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not prepare your data.');
    } finally {
      setDownloading(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api('/api/account/delete', { method: 'POST', json: { confirm: confirm.trim() } });
      setUser(null);
      router.replace('/?account=deleted');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not delete the account.');
      setBusy(false);
    }
  }

  return (
    <section id="data" className="scroll-mt-36 lg:scroll-mt-28">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className={cn(panel, 'flex flex-col justify-between gap-8')}>
          <div>
            <p className="text-[13.5px] text-white/45">Your data</p>
            <p className="mt-4 text-[15px] leading-relaxed text-white/65">Everything Forge holds for you in one zip: drafts, Story Bank, voice, captures and recordings, results, plans and settings. Passwords, tokens and connector credentials are never included.</p>
          </div>
          <button type="button" onClick={download} disabled={downloading} className={cn(pillWhite, 'self-start')}>
            {downloading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Preparing
              </>
            ) : (
              'Download my data'
            )}
          </button>
        </div>
        <div className={cn(panel, 'flex flex-col justify-between gap-8')}>
          <div>
            <p className="text-[13.5px] text-white/45">Delete account</p>
            <p className="mt-4 text-[15px] leading-relaxed text-white/65">Cancels your subscription and permanently deletes your account and everything in it. Drafts you wrote in other people&rsquo;s workspaces stay with those workspaces. This cannot be undone.</p>
          </div>
          <button type="button" onClick={() => setDeleting(true)} className={cn(pillGhost, 'self-start !text-[#FF9A85] hover:!border-[#FF8A65]/50')}>
            Delete my account
          </button>
        </div>
      </div>

      <Dialog
        open={deleting}
        onClose={() => !busy && setDeleting(false)}
        title="Delete your account"
        footer={
          <>
            <button type="button" onClick={() => setDeleting(false)} disabled={busy} className={pillGhost}>
              Keep my account
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy || confirm.trim().toLowerCase() !== (user?.email ?? '').toLowerCase()}
              className={cn(pillWhite, '!bg-[#FF8A65] hover:!bg-[#FF9A85]')}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete everything'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[14px] leading-relaxed text-white/65">
            Your plan is cancelled now with no further charges, your workspaces are deleted along with everything in them, and your recordings and images are removed. Download your data first if you want a copy.
          </p>
          <label className="flex flex-col gap-2">
            <span className="text-[13.5px] text-white/60">Type {user?.email ?? 'your email'} to confirm</span>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className={fieldDark} autoComplete="off" spellCheck={false} />
          </label>
        </div>
      </Dialog>
    </section>
  );
}
