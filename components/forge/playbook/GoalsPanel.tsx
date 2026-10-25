'use client';

/**
 * Goals: what posts actually lead to. Bookings from Cal.com or Calendly,
 * sign-ups and purchases from any service that can send a webhook, and
 * clicks on tracked links, each attributed to the post that sent the person.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api, onBrandChange, useActiveBrand } from '@/lib/forge/client';
import { draftText } from '@/lib/forge/draft-text';
import type { GoalEndpoint, GoalSummary } from '@/lib/forge/goals';
import type { DraftRecord } from '@/lib/forge/types';
import { PlatformGlyph } from '@/components/forge/icons';
import { UpsellCard } from '@/components/forge/views/UpsellCard';
import { Button, Card, Dialog, Field, IconButton, LoadingRow, StatTile, Tag, compactNumber, copyText, inputClass, relativeTime } from '@/components/forge/ui';

type Provider = GoalEndpoint['provider'];

interface GoalsResponse {
  summary: GoalSummary;
  endpoints: Array<GoalEndpoint & { url: string }>;
  providers: Record<Provider, { name: string; help: string }>;
}

const KIND_LABEL: Record<GoalSummary['recent'][number]['kind'], string> = { booking: 'Booking', signup: 'Sign-up', purchase: 'Purchase', custom: 'Event' };

export function GoalsPanel() {
  const brand = useActiveBrand();
  const [data, setData] = useState<GoalsResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftRecord>>({});
  const [connecting, setConnecting] = useState<Provider | null>(null);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await api<GoalsResponse>('/api/goals');
      setData(response);
      // Post openings are a nicety: the goals still show if they fail to load.
      const ids = response.summary.byDraft.slice(0, 12).map((d) => d.draftId);
      if (ids.length > 0) {
        api<{ drafts: DraftRecord[] }>(`/api/drafts?ids=${ids.join(',')}`)
          .then(({ drafts: rows }) => setDrafts(Object.fromEntries((rows ?? []).map((d) => [d.id, d]))))
          .catch(() => undefined);
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not load goals.');
    }
  }, []);

  useEffect(() => {
    void load();
    return onBrandChange(load);
  }, [load]);

  async function connect() {
    if (!connecting) return;
    setBusy(true);
    try {
      const { endpoint } = await api<{ endpoint: GoalEndpoint & { url: string } }>('/api/goals', { method: 'POST', json: { provider: connecting, secret: secret.trim() || null } });
      setData((current) => (current ? { ...current, endpoints: [...current.endpoints.filter((e) => e.provider !== connecting), endpoint] } : current));
      setSecret('');
      if (await copyText(endpoint.url)) toast.success('Connected. The webhook URL is copied.');
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) {
        setConnecting(null);
        setLocked(true);
      } else toast.error(error instanceof ApiError ? error.message : 'Could not connect it.');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(endpoint: GoalEndpoint) {
    try {
      await api(`/api/goals/endpoints/${endpoint.id}`, { method: 'DELETE' });
      setData((current) => (current ? { ...current, endpoints: current.endpoints.filter((e) => e.id !== endpoint.id) } : current));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not disconnect it.');
    }
  }

  const connected = useMemo(() => new Map((data?.endpoints ?? []).map((e) => [e.provider, e])), [data]);

  if (locked) return <UpsellCard feature="goals" body="Count the bookings, sign-ups and purchases each post leads to, from Cal.com, Calendly or any webhook, with tracked links in every post." />;
  if (!data) return <LoadingRow label="Loading goals" />;

  const { summary } = data;
  const endpoint = connecting ? connected.get(connecting) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Bookings" value={summary.totals.booking} note={`Last ${summary.windowDays} days`} tone={summary.totals.booking > 0 ? 'good' : undefined} />
        <StatTile label="Sign-ups" value={summary.totals.signup} />
        <StatTile label="Purchases" value={summary.totals.purchase} />
        <StatTile label="Link clicks" value={compactNumber(summary.clicks)} note={`${summary.attributed} goals traced to a post`} />
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-white/35">Connections</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {(Object.keys(data.providers) as Provider[]).map((provider) => {
            const existing = connected.get(provider);
            return (
              <Card key={provider} className="flex flex-col gap-3 p-5">
                <div className="flex items-center gap-2">
                  <h4 className="text-[14.5px] font-semibold text-white">{data.providers[provider].name}</h4>
                  {existing && (
                    <Tag tone="good" dot>
                      Connected
                    </Tag>
                  )}
                </div>
                <p className="text-[12.5px] leading-relaxed text-white/45">{existing?.last_event_at ? `Last event ${relativeTime(existing.last_event_at)}` : existing ? 'Waiting for the first event' : provider === 'webhook' ? 'Stripe, your app, a form tool: anything that can send JSON.' : 'Bookings attributed to the post that sent them.'}</p>
                {brand.canEdit && (
                  <div className="mt-auto flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setConnecting(provider)}>
                      {existing ? 'Show setup' : 'Connect'}
                    </Button>
                    {existing && (
                      <Button variant="quiet" size="sm" onClick={() => disconnect(existing)}>
                        Disconnect
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
        <p className="text-[12.5px] leading-relaxed text-white/40">
          Attribution needs the person to arrive from a tracked link: create one in a draft&rsquo;s studio and paste it in the post. Forge adds the post&rsquo;s reference to the link, and the booking tool passes it back.
        </p>
      </section>

      {summary.byDraft.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-white/35">By post</h3>
          <ul className="flex flex-col divide-y divide-white/[0.05] overflow-hidden rounded-[20px] border border-white/[0.07] bg-forge-card">
            {summary.byDraft.slice(0, 12).map((row) => {
              const draft = drafts[row.draftId];
              return (
                <li key={row.draftId}>
                  <Link href={`/drafts/${row.draftId}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.03]">
                    {draft && <PlatformGlyph platform={draft.platform} className="h-3.5 w-3.5 shrink-0 text-white/50" />}
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-white/80">{draft ? draftText(draft).split('\n')[0] : 'A post'}</span>
                    <span className="flex shrink-0 gap-3 text-[12.5px] tabular-nums text-white/55">
                      {row.bookings > 0 && <span className="text-forge-good">{row.bookings} booked</span>}
                      {row.signups > 0 && <span>{row.signups} signed up</span>}
                      {row.purchases > 0 && <span>{row.purchases} bought</span>}
                      <span className="text-white/35">{row.clicks} clicks</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {summary.recent.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-white/35">Recent</h3>
          <ul className="flex flex-col gap-1.5">
            {summary.recent.slice(0, 10).map((event) => (
              <li key={event.id} className="flex items-center gap-3 rounded-[14px] bg-white/[0.025] px-4 py-2.5 text-[13px]">
                <Tag tone={event.kind === 'booking' ? 'good' : 'neutral'}>{KIND_LABEL[event.kind]}</Tag>
                <span className="min-w-0 flex-1 truncate text-white/70">{event.label ?? (event.draft_id ? 'From a post' : 'Not traced to a post')}</span>
                {event.value ? (
                  <span className="shrink-0 tabular-nums text-white/60">
                    {event.currency ?? ''} {event.value}
                  </span>
                ) : null}
                <span className="shrink-0 text-[12px] text-white/30">{relativeTime(event.occurred_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog
        open={connecting !== null}
        onClose={() => {
          setConnecting(null);
          setSecret('');
        }}
        title={connecting ? `Connect ${data.providers[connecting].name}` : ''}
        footer={
          <>
            <Button variant="quiet" onClick={() => setConnecting(null)} disabled={busy}>
              Close
            </Button>
            <Button variant="primary" onClick={connect} loading={busy} disabled={connecting !== 'webhook' && secret.trim().length < 8}>
              {endpoint ? 'Save secret' : 'Create webhook URL'}
            </Button>
          </>
        }
      >
        {connecting && (
          <div className="flex flex-col gap-5">
            <p className="text-[13.5px] leading-relaxed text-white/60">{data.providers[connecting].help}</p>
            {endpoint && (
              <Field label="Webhook URL">
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-[12px] bg-white/[0.05] px-3 py-2.5 text-[12.5px] text-white/80">{endpoint.url}</code>
                  <IconButton
                    label="Copy URL"
                    onClick={async () => {
                      if (await copyText(endpoint.url)) toast.success('Copied.');
                    }}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                      <rect x="8" y="8" width="12" height="12" rx="2.5" />
                      <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
                    </svg>
                  </IconButton>
                </div>
              </Field>
            )}
            {connecting !== 'webhook' && (
              <Field label={connecting === 'calcom' ? 'Webhook secret' : 'Signing key'} htmlFor="goal-secret" hint="Used to check that each event really came from them. Stored encrypted.">
                <input id="goal-secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} className={inputClass} autoComplete="off" placeholder={endpoint?.has_secret ? 'Saved. Paste a new one to replace it.' : ''} />
              </Field>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
