'use client';

/**
 * Connected sources: GitHub, Linear, Notion and a calendar, read every six
 * hours for what happened. Each connection is a read-only credential the
 * person creates themselves, so Forge can never write to those tools.
 */

import { useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api } from '@/lib/forge/client';
import type { ConnectorProvider } from '@/lib/forge/labels';
import { Button, Dialog, Field, Tag, cn, inputClass, relativeTime } from '@/components/forge/ui';

export interface SourceSummary {
  id: string;
  provider: ConnectorProvider;
  label: string | null;
  config: { repos?: string[] };
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
}

export type ProviderInfo = Record<ConnectorProvider, { name: string; credential: string; help: string }>;

const PROVIDER_ORDER: ConnectorProvider[] = ['github', 'linear', 'notion', 'calendar'];

const PROVIDER_LINE: Record<ConnectorProvider, string> = {
  github: 'Merged pull requests and releases become things you shipped.',
  linear: 'Completed issues become the work behind your posts.',
  notion: 'Pages you edit become notes Forge can draw from.',
  calendar: 'Your week of meetings becomes questions worth answering.',
};

function ProviderMark({ provider }: { provider: ConnectorProvider }) {
  const paths: Record<ConnectorProvider, string> = {
    github: 'M12 3a9 9 0 0 0-2.85 17.54c.45.08.62-.2.62-.44v-1.55c-2.5.54-3.03-1.2-3.03-1.2-.41-1.04-1-1.32-1-1.32-.82-.56.06-.55.06-.55.9.06 1.38.93 1.38.93.8 1.38 2.11.98 2.62.75.08-.58.31-.98.57-1.2-2-.23-4.1-1-4.1-4.44 0-.98.35-1.79.93-2.42-.1-.23-.4-1.14.08-2.38 0 0 .76-.24 2.48.92a8.6 8.6 0 0 1 4.5 0c1.72-1.16 2.48-.92 2.48-.92.49 1.24.18 2.15.09 2.38.58.63.92 1.44.92 2.42 0 3.45-2.1 4.2-4.1 4.43.32.28.61.82.61 1.66v2.46c0 .24.16.52.62.43A9 9 0 0 0 12 3Z',
    linear: 'M4.2 13.8 10.2 19.8M3.6 10.8l9.6 9.6M4.8 7.2l12 12M7.5 4.8l11.7 11.7M11.1 3.6l9.3 9.3',
    notion: 'M5 4.5h10.5l3.5 3v12H5v-15ZM8.5 8.5v8M8.5 8.5l6 8M14.5 8.5v8',
    calendar: 'M4 6h16v14H4V6ZM4 10h16M8 3v4M16 3v4',
  };
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white/[0.05] text-white/80">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill={provider === 'github' ? 'currentColor' : 'none'} stroke={provider === 'github' ? 'none' : 'currentColor'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={paths[provider]} />
      </svg>
    </span>
  );
}

export function SourcesPanel({
  sources,
  providers,
  onChange,
  readOnly,
}: {
  sources: SourceSummary[];
  providers: ProviderInfo | null;
  onChange: () => void;
  readOnly: boolean;
}) {
  const [connecting, setConnecting] = useState<ConnectorProvider | null>(null);
  const [secret, setSecret] = useState('');
  const [repos, setRepos] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function connect() {
    if (!connecting) return;
    setBusy('connect');
    try {
      const { captures } = await api<{ captures: number }>('/api/sources', {
        method: 'POST',
        json: {
          provider: connecting,
          secret: secret.trim(),
          repos:
            connecting === 'github'
              ? repos
                  .split(/[\s,]+/)
                  .map((r) => r.trim())
                  .filter(Boolean)
              : undefined,
        },
      });
      toast.success(captures > 0 ? `Connected. ${captures} new ${captures === 1 ? 'item' : 'items'} from the last week are in your inbox.` : 'Connected. Forge reads it every six hours.');
      setConnecting(null);
      setSecret('');
      setRepos('');
      onChange();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not connect it.');
    } finally {
      setBusy(null);
    }
  }

  async function sync(source: SourceSummary) {
    setBusy(source.id);
    try {
      const { captures } = await api<{ captures: number }>(`/api/sources/${source.id}`, { method: 'POST' });
      toast.success(captures > 0 ? `${captures} new ${captures === 1 ? 'item' : 'items'} in your inbox.` : 'Up to date.');
      onChange();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not sync it.');
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(source: SourceSummary) {
    setBusy(source.id);
    try {
      await api(`/api/sources/${source.id}`, { method: 'DELETE' });
      toast.success('Disconnected. The stored credential is deleted.');
      onChange();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not disconnect it.');
    } finally {
      setBusy(null);
    }
  }

  const byProvider = new Map(sources.map((s) => [s.provider, s]));
  const info = connecting && providers ? providers[connecting] : null;

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2">
        {PROVIDER_ORDER.map((provider) => {
          const source = byProvider.get(provider);
          const name = providers?.[provider].name ?? provider;
          return (
            <li key={provider} className={cn('flex flex-col gap-4 rounded-[20px] border p-5', source ? 'border-white/[0.1] bg-forge-card' : 'border-white/[0.06] bg-white/[0.015]')}>
              <div className="flex items-start gap-3">
                <ProviderMark provider={provider} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[15px] font-semibold text-white">{name}</h3>
                    {source && (
                      <Tag tone={source.last_error ? 'bad' : 'good'} dot>
                        {source.last_error ? 'Needs attention' : 'Connected'}
                      </Tag>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-white/50">
                    {source ? (source.label ?? PROVIDER_LINE[provider]) : PROVIDER_LINE[provider]}
                  </p>
                  {source?.last_error && <p className="mt-2 text-[12.5px] text-forge-bad">{source.last_error}</p>}
                  {source && <p className="mt-2 text-[12px] text-white/35">{source.last_synced_at ? `Read ${relativeTime(source.last_synced_at)}` : 'Not read yet'}</p>}
                </div>
              </div>
              {!readOnly && (
                <div className="mt-auto flex gap-2">
                  {source ? (
                    <>
                      <Button variant="secondary" size="sm" loading={busy === source.id} onClick={() => sync(source)}>
                        Sync now
                      </Button>
                      <Button variant="quiet" size="sm" disabled={busy === source.id} onClick={() => disconnect(source)}>
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => setConnecting(provider)}>
                      Connect
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog
        open={connecting !== null}
        onClose={() => setConnecting(null)}
        title={`Connect ${info?.name ?? ''}`}
        footer={
          <>
            <Button variant="quiet" onClick={() => setConnecting(null)} disabled={busy === 'connect'}>
              Cancel
            </Button>
            <Button variant="primary" onClick={connect} loading={busy === 'connect'} disabled={secret.trim().length < 8}>
              Connect
            </Button>
          </>
        }
      >
        {info && connecting && (
          <div className="flex flex-col gap-5">
            <p className="text-[13.5px] leading-relaxed text-white/60">{info.help}</p>
            <Field label={info.credential} htmlFor="source-secret" hint="Stored encrypted. Forge only reads; it never writes to your tools.">
              <input
                id="source-secret"
                type={connecting === 'calendar' ? 'url' : 'password'}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className={inputClass}
                autoComplete="off"
                spellCheck={false}
                placeholder={connecting === 'calendar' ? 'https://calendar.google.com/calendar/ical/.../basic.ics' : ''}
              />
            </Field>
            {connecting === 'github' && (
              <Field label="Repositories" htmlFor="source-repos" hint="owner/name, separated by commas. Leave empty for every repository the token can read.">
                <input id="source-repos" value={repos} onChange={(e) => setRepos(e.target.value)} className={inputClass} placeholder="acme/api, acme/web" spellCheck={false} />
              </Field>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}

