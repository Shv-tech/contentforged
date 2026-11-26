'use client';

/**
 * /admin/ops: live health of every part of Forge.
 *
 * What is failing, where, for whom, and why: overall status, traffic and
 * errors over time, each feature, each outside service, scheduled jobs,
 * slow routes, and a live feed of errors. Any error reference (r_...) a
 * person quotes can be pasted in the search box to see the whole request.
 *
 * Refreshes every 5 seconds while "Live" is on. Visible to ADMIN_EMAILS
 * only; everyone else gets a not-found page.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Copy, MinusCircle, RefreshCw, Search, XCircle } from 'lucide-react';
import { ApiError, api } from '@/lib/forge/client';
import type { FeatureRow, JobRow, OpsEventRow, OpsSummary, OpsWindow, RouteRow, ServiceRow, Status } from '@/lib/ops/types';
import { HealthStrip, LatencyChart, Spark, STATUS_COLOR, TrafficChart, formatMs, statusColor } from '@/components/ops/charts';
import { Card, Dialog, LoadingRow, Segmented, StatTile, cn, compactNumber, focusRing, inputClass, relativeTime } from '@/components/forge/ui';

const REFRESH_MS = 5000;

const STATUS_LABEL: Record<Status, string> = {
  ok: 'Healthy',
  issues: 'Some errors',
  degraded: 'Degraded',
  down: 'Down',
  quiet: 'No traffic',
  idle: 'Idle',
  not_configured: 'Not set up',
};

function StatusIcon({ status, className }: { status: Status; className?: string }) {
  const props = { className: cn('h-4 w-4 shrink-0', className), style: { color: statusColor(status) }, 'aria-hidden': true } as const;
  if (status === 'ok') return <CheckCircle2 {...props} />;
  if (status === 'down') return <XCircle {...props} />;
  if (status === 'degraded' || status === 'issues') return <AlertTriangle {...props} />;
  if (status === 'not_configured') return <MinusCircle {...props} />;
  return <CircleDashed {...props} />;
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium"
      style={{ color: status === 'quiet' || status === 'idle' || status === 'not_configured' ? 'rgba(255,255,255,0.45)' : statusColor(status) }}
    >
      <StatusIcon status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function pct(value: number): string {
  if (value === 0) return '0%';
  if (value < 0.001) return '<0.1%';
  return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
}

function shortJob(name: string): string {
  return name.replace('api/cron/', '');
}

function every(minutes: number | null): string {
  if (minutes === null) return '–';
  if (minutes < 60) return `every ${minutes} min`;
  if (minutes < 1440) return `every ${minutes / 60} h`;
  if (minutes === 1440) return 'daily';
  if (minutes === 10080) return 'weekly';
  return 'monthly';
}

export default function OpsPage() {
  const [range, setRange] = useState<OpsWindow>('1h');
  const [live, setLive] = useState(true);
  const [summary, setSummary] = useState<OpsSummary | null>(null);
  const [hidden, setHidden] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [trace, setTrace] = useState<string | null>(null);
  const [feedFeature, setFeedFeature] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setSummary(await api<OpsSummary>(`/api/admin/ops/summary?window=${range}`));
      setFailed(null);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 401)) setHidden(true);
      else setFailed(error instanceof ApiError ? error.message : 'Could not load monitoring.');
    }
  }, [range]);

  useEffect(() => {
    setSummary(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [live, load]);

  const runChecks = async () => {
    setChecking(true);
    try {
      await api('/api/admin/ops/check', { method: 'POST' });
      await new Promise((r) => setTimeout(r, 1200));
      await load();
    } catch (error) {
      setFailed(error instanceof ApiError ? error.message : 'Checks failed to run.');
    } finally {
      setChecking(false);
    }
  };

  const showFeature = (feature: string) => {
    setFeedFeature(feature);
    feedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (hidden) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-black font-sans text-white">
        <p className="text-[15px] text-white/60">This page could not be found.</p>
        <Link href="/dashboard" className="text-[14px] text-white underline underline-offset-4">
          Back to Forge
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-forge-ink font-sans text-white">
      <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-semibold">Forge health</h1>
            <p className="text-[11.5px] text-white/40">
              <Link href="/admin" className="underline-offset-2 hover:underline">
                Usage
              </Link>
              <span className="mx-1.5">/</span>
              Monitoring
            </p>
          </div>
          <ReferenceSearch onOpen={setTrace} />
          <Segmented<OpsWindow>
            label="Time window"
            value={range}
            onChange={setRange}
            options={[
              { value: '15m', label: '15m' },
              { value: '1h', label: '1h' },
              { value: '24h', label: '24h' },
              { value: '7d', label: '7d' },
            ]}
          />
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            aria-pressed={live}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border border-white/[0.08] px-3 py-1.5 text-[12.5px]',
              live ? 'text-white' : 'text-white/45',
              focusRing
            )}
          >
            <span
              className={cn('h-2 w-2 rounded-full', live ? 'animate-pulse' : '')}
              style={{ background: live ? STATUS_COLOR.ok : 'rgba(255,255,255,0.3)' }}
              aria-hidden
            />
            {live ? 'Live' : 'Paused'}
          </button>
          <button
            type="button"
            onClick={runChecks}
            disabled={checking}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-black disabled:opacity-60',
              focusRing
            )}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', checking && 'animate-spin')} aria-hidden />
            {checking ? 'Checking' : 'Check now'}
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1320px] flex-col gap-6 px-4 pb-16 pt-6">
        {failed ? <p className="rounded-[14px] border border-white/[0.08] bg-forge-card px-4 py-3 text-[13px] text-white/70">{failed}</p> : null}
        {!summary ? (
          <LoadingRow label="Reading the logs" />
        ) : !summary.ready ? (
          <Card className="p-6">
            <h2 className="text-[15px] font-semibold">Monitoring is not set up yet</h2>
            <p className="mt-2 text-[13.5px] text-white/60">{summary.setupMessage}</p>
          </Card>
        ) : (
          <Overview summary={summary} onFeature={showFeature} />
        )}

        <div ref={feedRef}>
          <Feed live={live} feature={feedFeature} onFeature={setFeedFeature} onOpen={setTrace} features={summary?.features.map((f) => f.feature) ?? []} />
        </div>
      </main>

      <TraceDialog reference={trace} onClose={() => setTrace(null)} />
    </div>
  );
}

function ReferenceSearch({ onOpen }: { onOpen: (ref: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onOpen(value.trim());
      }}
      className="relative order-last w-full sm:order-none sm:w-auto"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" aria-hidden />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Error reference, e.g. r_3f9a1c2b7d"
        aria-label="Look up an error reference"
        className={cn(inputClass, 'h-8 w-full rounded-full pl-8 text-[12.5px] sm:w-[260px]')}
      />
    </form>
  );
}

function Overview({ summary, onFeature }: { summary: OpsSummary; onFeature: (feature: string) => void }) {
  const t = summary.totals;
  return (
    <>
      <OverallBanner summary={summary} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Requests" value={compactNumber(t.requests)} note={`${t.users} signed-in ${t.users === 1 ? 'person' : 'people'}`} />
        <StatTile
          label="Server errors"
          value={compactNumber(t.errors)}
          tone={t.errors > 0 ? (t.errorRate >= 0.05 ? 'bad' : 'warn') : 'good'}
          note={`${pct(t.errorRate)} of requests`}
        />
        <StatTile label="Client errors" value={compactNumber(t.warnings)} note="4xx: sign-in, limits, bad input" />
        <StatTile label="Response time" value={formatMs(t.p95)} note={`p95. Median ${formatMs(t.p50)}`} />
        <StatTile
          label="Browser errors"
          value={compactNumber(t.clientErrors)}
          tone={t.clientErrors > 0 ? 'warn' : undefined}
          note="Crashes and failed calls in pages"
        />
        <StatTile
          label="Service failures"
          value={compactNumber(t.upstreamFailures)}
          tone={t.upstreamFailures > 0 ? 'warn' : undefined}
          note={`of ${compactNumber(t.upstreamCalls)} outside calls`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="p-5">
          <h2 className="text-[14px] font-semibold">Requests and errors</h2>
          <p className="mb-3 mt-0.5 text-[12px] text-white/40">Every API call Forge served, by outcome. Hover a bar for the numbers.</p>
          <TrafficChart series={summary.series} bucketSeconds={summary.bucketSeconds} />
        </Card>
        <Card className="p-5">
          <h2 className="text-[14px] font-semibold">Response time, slowest 5% (p95)</h2>
          <p className="mb-3 mt-0.5 text-[12px] text-white/40">How long the slow end of requests took to answer.</p>
          <LatencyChart series={summary.series} bucketSeconds={summary.bucketSeconds} />
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-[14px] font-semibold">Features</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {summary.features
            .filter((f) => f.status !== 'quiet')
            .map((f) => (
              <FeatureCard key={f.feature} feature={f} onOpen={() => onFeature(f.feature)} />
            ))}
        </div>
        {summary.features.some((f) => f.status === 'quiet') ? (
          <p className="mt-3 text-[12.5px] text-white/40">
            <span className="text-white/55">No traffic in this window: </span>
            {summary.features
              .filter((f) => f.status === 'quiet')
              .map((f) => f.feature)
              .join(', ')}
          </p>
        ) : null}
      </section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <ServicesTable services={summary.services} />
        <JobsTable jobs={summary.jobs} />
      </div>

      <RoutesTable routes={summary.routes} />
    </>
  );
}

function OverallBanner({ summary }: { summary: OpsSummary }) {
  const { status, reasons } = summary.overall;
  const headline =
    status === 'ok'
      ? 'Everything is working'
      : status === 'down'
        ? 'Forge has a serious problem'
        : status === 'degraded'
          ? 'Something needs attention'
          : status === 'quiet'
            ? 'No traffic in this window'
            : 'Mostly fine, with some errors';
  return (
    <div
      className="flex flex-wrap items-start gap-4 rounded-[18px] border border-white/[0.07] bg-forge-card p-5"
      style={{ boxShadow: `inset 3px 0 0 ${statusColor(status)}` }}
    >
      <StatusIcon status={status} className="mt-0.5 h-6 w-6" />
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-semibold tracking-[-0.01em]">{headline}</p>
        {reasons.length > 0 ? (
          <ul className="mt-1.5 flex flex-col gap-0.5 text-[13px] text-white/60">
            {reasons.slice(0, 6).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[13px] text-white/50">All services answered their last check and the error rate is normal.</p>
        )}
      </div>
      <p className="w-full text-[11.5px] text-white/35 sm:w-auto">Updated {new Date(summary.generatedAt).toLocaleTimeString()}</p>
    </div>
  );
}

function FeatureCard({ feature: f, onOpen }: { feature: FeatureRow; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex flex-col gap-2 rounded-[16px] border border-white/[0.07] bg-forge-card p-4 text-left transition hover:border-white/[0.15]',
        focusRing
      )}
      style={{ boxShadow: f.status === 'down' || f.status === 'degraded' ? `inset 0 0 0 1px ${statusColor(f.status)}55` : undefined }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13.5px] font-medium text-white">{f.feature}</p>
        <StatusBadge status={f.status} />
      </div>
      <div className="flex items-end justify-between gap-3">
        <dl className="grid grid-cols-3 gap-x-3 text-[11.5px] text-white/45">
          <div>
            <dt>Calls</dt>
            <dd className="text-[13px] tabular-nums text-white/85">{compactNumber(f.requests)}</dd>
          </div>
          <div>
            <dt>Errors</dt>
            <dd className="text-[13px] tabular-nums text-white/85">{f.errors > 0 ? `${f.errors} (${pct(f.errorRate)})` : '0'}</dd>
          </div>
          <div>
            <dt>p95</dt>
            <dd className="text-[13px] tabular-nums text-white/85">{formatMs(f.p95)}</dd>
          </div>
        </dl>
        <Spark points={f.spark} label={`${f.feature} requests and errors over time`} />
      </div>
      {f.lastError || f.clientErrors > 0 ? (
        <p className="line-clamp-2 text-[12px] leading-snug text-white/50">
          {f.lastError ? (
            <>
              <span className="text-white/35">{relativeTime(f.lastErrorAt)}: </span>
              {f.lastError}
            </>
          ) : null}
          {f.clientErrors > 0 ? (
            <span className="block text-white/40">
              {f.clientErrors} browser {f.clientErrors === 1 ? 'error' : 'errors'}
            </span>
          ) : null}
        </p>
      ) : null}
    </button>
  );
}

function TableCard({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 pb-2 pt-5">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        <p className="mt-0.5 text-[12px] text-white/40">{note}</p>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </Card>
  );
}

const th = 'px-3 py-2 text-left text-[11.5px] font-medium text-white/40 first:pl-5 last:pr-5';
const td = 'px-3 py-2.5 align-top text-[12.5px] text-white/75 first:pl-5 last:pr-5';

function ServicesTable({ services }: { services: ServiceRow[] }) {
  return (
    <TableCard
      title="Outside services"
      note="Checked every 5 minutes with a free read-only call, or judged from real calls where every call costs money (X, Tavily)."
    >
      <table className="w-full min-w-[640px] border-t border-white/[0.06]">
        <thead>
          <tr>
            <th className={th}>Service</th>
            <th className={th}>Status</th>
            <th className={th}>Calls</th>
            <th className={th}>p95</th>
            <th className={th}>Last 72 checks</th>
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.name} className="border-t border-white/[0.04]">
              <td className={td}>
                <p className="font-medium text-white/90">{s.name}</p>
                <p className="text-[11px] text-white/35">
                  {s.check === 'active'
                    ? `Live check${s.checkLatencyMs !== null ? `, ${s.checkLatencyMs} ms` : ''}`
                    : s.check === 'passive'
                      ? 'From real calls'
                      : s.check === 'config'
                        ? 'Settings'
                        : 'Traffic only'}
                </p>
              </td>
              <td className={td}>
                <StatusBadge status={s.status} />
                {s.checkMessage && s.status !== 'ok' ? <p className="mt-1 max-w-[260px] text-[11.5px] leading-snug text-white/45">{s.checkMessage}</p> : null}
                {s.lastFailure ? (
                  <p className="mt-1 max-w-[260px] text-[11.5px] leading-snug text-white/45">
                    {relativeTime(s.lastFailureAt)}: {s.lastFailure}
                  </p>
                ) : null}
              </td>
              <td className={cn(td, 'tabular-nums')}>
                {compactNumber(s.calls)}
                {s.failures > 0 ? <span style={{ color: STATUS_COLOR.error }}> ({s.failures} failed)</span> : null}
              </td>
              <td className={cn(td, 'tabular-nums')}>{formatMs(s.p95)}</td>
              <td className={td}>
                {s.status === 'not_configured' ? <span className="text-[11.5px] text-white/30">–</span> : <HealthStrip history={s.history} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  );
}

function JobsTable({ jobs }: { jobs: JobRow[] }) {
  return (
    <TableCard title="Scheduled jobs" note="Runs in the last 7 days. Late means it missed two runs in a row: check pg_cron.">
      <table className="w-full min-w-[560px] border-t border-white/[0.06]">
        <thead>
          <tr>
            <th className={th}>Job</th>
            <th className={th}>Status</th>
            <th className={th}>Last run</th>
            <th className={th}>Took</th>
            <th className={th}>Runs</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.name} className="border-t border-white/[0.04]">
              <td className={td}>
                <p className="font-medium text-white/90">{shortJob(j.name)}</p>
                <p className="text-[11px] text-white/35">{every(j.everyMinutes)}</p>
              </td>
              <td className={td}>
                {j.late ? (
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: STATUS_COLOR.warn }}>
                    <AlertTriangle className="h-4 w-4" aria-hidden /> Late
                  </span>
                ) : (
                  <StatusBadge status={j.status} />
                )}
                {j.lastError ? <p className="mt-1 max-w-[220px] text-[11.5px] leading-snug text-white/45">{j.lastError}</p> : null}
              </td>
              <td className={td}>{j.lastRunAt ? relativeTime(j.lastRunAt) : 'Never'}</td>
              <td className={cn(td, 'tabular-nums')}>{formatMs(j.lastDurationMs)}</td>
              <td className={cn(td, 'tabular-nums')}>
                {j.runs}
                {j.failures > 0 ? <span style={{ color: STATUS_COLOR.error }}> ({j.failures} failed)</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  );
}

function RoutesTable({ routes }: { routes: RouteRow[] }) {
  const [sort, setSort] = useState<'errors' | 'p95' | 'requests'>('errors');
  const rows = useMemo(() => {
    const copy = [...routes];
    if (sort === 'errors') copy.sort((a, b) => b.errors - a.errors || b.warnings - a.warnings || (b.p95 ?? 0) - (a.p95 ?? 0));
    if (sort === 'p95') copy.sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0));
    if (sort === 'requests') copy.sort((a, b) => b.requests - a.requests);
    return copy.slice(0, 25);
  }, [routes, sort]);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 pb-2 pt-5">
        <div>
          <h2 className="text-[14px] font-semibold">Routes</h2>
          <p className="mt-0.5 text-[12px] text-white/40">Each API endpoint in this window.</p>
        </div>
        <Segmented
          label="Sort routes"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'errors', label: 'Most errors' },
            { value: 'p95', label: 'Slowest' },
            { value: 'requests', label: 'Busiest' },
          ]}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-t border-white/[0.06]">
          <thead>
            <tr>
              <th className={th}>Route</th>
              <th className={th}>Feature</th>
              <th className={th}>Calls</th>
              <th className={th}>5xx</th>
              <th className={th}>4xx</th>
              <th className={th}>Median</th>
              <th className={th}>p95</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className={cn(td, 'text-white/40')} colSpan={7}>
                  No requests in this window.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.name} className="border-t border-white/[0.04]">
                  <td className={cn(td, 'font-mono text-[12px] text-white/85')}>{r.name}</td>
                  <td className={td}>{r.feature}</td>
                  <td className={cn(td, 'tabular-nums')}>{compactNumber(r.requests)}</td>
                  <td className={cn(td, 'tabular-nums')} style={{ color: r.errors > 0 ? STATUS_COLOR.error : undefined }}>
                    {r.errors}
                  </td>
                  <td className={cn(td, 'tabular-nums')}>{r.warnings}</td>
                  <td className={cn(td, 'tabular-nums')}>{formatMs(r.p50)}</td>
                  <td className={cn(td, 'tabular-nums')}>{formatMs(r.p95)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

type FeedLevel = 'errors' | 'problems' | 'all';
type FeedKind = 'all' | 'request' | 'client' | 'upstream';

const KIND_LABEL: Record<OpsEventRow['kind'], string> = { request: 'Server', client: 'Browser', upstream: 'Service', health: 'Check' };

function Feed({
  live,
  feature,
  onFeature,
  onOpen,
  features,
}: {
  live: boolean;
  feature: string | null;
  onFeature: (f: string | null) => void;
  onOpen: (ref: string) => void;
  features: string[];
}) {
  const [level, setLevel] = useState<FeedLevel>('problems');
  const [kind, setKind] = useState<FeedKind>('all');
  const [query, setQuery] = useState('');
  const [events, setEvents] = useState<OpsEventRow[] | null>(null);
  const [open, setOpen] = useState<OpsEventRow | null>(null);
  const [freshIds, setFreshIds] = useState<Set<number>>(new Set());
  const known = useRef<Set<number>>(new Set());

  const load = useCallback(async () => {
    const params = new URLSearchParams({ level, kind, limit: '60' });
    if (feature) params.set('feature', feature);
    if (query.trim()) params.set('q', query.trim());
    try {
      const { events: rows } = await api<{ events: OpsEventRow[] }>(`/api/admin/ops/events?${params.toString()}`);
      const fresh = new Set(known.current.size > 0 ? rows.filter((r) => !known.current.has(r.id)).map((r) => r.id) : []);
      known.current = new Set(rows.map((r) => r.id));
      setFreshIds(fresh);
      setEvents(rows);
    } catch {
      setEvents((prev) => prev ?? []);
    }
  }, [level, kind, feature, query]);

  useEffect(() => {
    known.current = new Set();
    setEvents(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [live, load]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 px-5 pb-3 pt-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold">Live feed</h2>
            <p className="mt-0.5 text-[12px] text-white/40">
              Newest first. Click a row for the full story: stack trace, the services it called, and who it happened to.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<FeedLevel>
              label="Which events"
              value={level}
              onChange={setLevel}
              options={[
                { value: 'errors', label: 'Errors' },
                { value: 'problems', label: 'Errors and 4xx' },
                { value: 'all', label: 'Everything' },
              ]}
            />
            <Segmented<FeedKind>
              label="Where"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'all', label: 'All' },
                { value: 'request', label: 'Server' },
                { value: 'client', label: 'Browser' },
                { value: 'upstream', label: 'Services' },
              ]}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={feature ?? ''}
            onChange={(e) => onFeature(e.target.value || null)}
            aria-label="Filter by feature"
            className={cn(inputClass, 'h-8 w-auto rounded-full bg-black px-3 text-[12.5px] text-white [&>option]:bg-black [&>option]:text-white')}
          >
            <option value="">All features</option>
            {Array.from(new Set([...(feature ? [feature] : []), ...features])).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search message, route, user id or reference"
            aria-label="Search the feed"
            className={cn(inputClass, 'h-8 min-w-[240px] flex-1 rounded-full px-3 text-[12.5px]')}
          />
        </div>
      </div>

      {events === null ? (
        <LoadingRow label="Loading events" />
      ) : events.length === 0 ? (
        <p className="border-t border-white/[0.06] px-5 py-10 text-center text-[13px] text-white/45">
          Nothing here. {level !== 'all' ? 'No problems match these filters.' : ''}
        </p>
      ) : (
        <ul className="border-t border-white/[0.06]">
          {events.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setOpen(e)}
                className={cn(
                  'grid w-full grid-cols-[72px_86px_1fr] gap-3 border-b border-white/[0.04] px-5 py-2.5 text-left text-[12.5px] transition hover:bg-white/[0.03] md:grid-cols-[80px_90px_170px_1fr_110px]',
                  freshIds.has(e.id) && 'bg-white/[0.04]',
                  focusRing
                )}
              >
                <span className="tabular-nums text-white/45" title={new Date(e.at).toLocaleString()}>
                  {new Date(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <StatusIcon status={e.level === 'error' ? 'down' : e.level === 'warn' ? 'issues' : 'ok'} className="h-3.5 w-3.5" />
                  <span className="text-white/60">{KIND_LABEL[e.kind]}</span>
                </span>
                <span className="hidden truncate text-white/60 md:block">{e.feature}</span>
                <span className="min-w-0">
                  <span className="font-mono text-[12px] text-white/85">
                    {e.status ? (
                      <span style={{ color: e.level === 'error' ? STATUS_COLOR.error : e.level === 'warn' ? STATUS_COLOR.warn : undefined }}>{e.status} </span>
                    ) : null}
                    {e.name}
                  </span>
                  {e.message ? <span className="block truncate text-white/50">{e.message}</span> : null}
                </span>
                <span className="hidden text-right font-mono text-[11.5px] text-white/35 md:block">{e.request_id ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <EventDialog
        event={open}
        onClose={() => setOpen(null)}
        onTrace={(ref) => {
          setOpen(null);
          onOpen(ref);
        }}
      />
    </Card>
  );
}

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className={cn('inline-flex items-center gap-1 rounded-full border border-white/[0.1] px-2 py-0.5 text-[11px] text-white/60', focusRing)}
    >
      <Copy className="h-3 w-3" aria-hidden />
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-1.5 text-[12.5px]">
      <dt className="text-white/40">{label}</dt>
      <dd className="min-w-0 break-words text-white/85">{children}</dd>
    </div>
  );
}

function EventDetails({ event: e }: { event: OpsEventRow }) {
  const detail = (e.detail ?? {}) as Record<string, unknown>;
  const stack = typeof detail.stack === 'string' ? detail.stack : null;
  const rest = Object.fromEntries(Object.entries(detail).filter(([k, v]) => k !== 'stack' && v !== null && v !== undefined));
  return (
    <div>
      <dl>
        <Field label="When">{new Date(e.at).toLocaleString()}</Field>
        <Field label="Where">
          {KIND_LABEL[e.kind]}, {e.feature}
        </Field>
        <Field label="What">
          <span className="font-mono">
            {e.method ? `${e.method} ` : ''}
            {e.path ?? e.name}
          </span>
        </Field>
        {e.status !== null ? <Field label="Status">{e.status}</Field> : null}
        {e.duration_ms !== null ? <Field label="Took">{formatMs(e.duration_ms)}</Field> : null}
        {e.message ? <Field label="Message">{e.message}</Field> : null}
        {e.user_id ? (
          <Field label="User">
            <span className="font-mono text-[12px]">{e.user_id}</span> <CopyButton value={e.user_id} />
          </Field>
        ) : (
          <Field label="User">Not signed in</Field>
        )}
        {e.request_id ? (
          <Field label="Reference">
            <span className="font-mono text-[12px]">{e.request_id}</span> <CopyButton value={e.request_id} />
          </Field>
        ) : null}
      </dl>
      {Object.keys(rest).length > 0 ? (
        <pre className="mt-3 max-h-[160px] overflow-auto rounded-[12px] bg-black/60 p-3 text-[11.5px] leading-relaxed text-white/60">
          {JSON.stringify(rest, null, 2)}
        </pre>
      ) : null}
      {stack ? (
        <>
          <p className="mt-4 text-[12px] font-medium text-white/50">Stack trace</p>
          <pre className="mt-1.5 max-h-[260px] overflow-auto rounded-[12px] bg-black/60 p-3 text-[11.5px] leading-relaxed text-white/70">{stack}</pre>
        </>
      ) : null}
    </div>
  );
}

function EventDialog({ event, onClose, onTrace }: { event: OpsEventRow | null; onClose: () => void; onTrace: (ref: string) => void }) {
  return (
    <Dialog
      open={event !== null}
      onClose={onClose}
      title={event ? `${KIND_LABEL[event.kind]} ${event.level === 'error' ? 'error' : event.level === 'warn' ? 'warning' : 'event'}` : ''}
      className="max-w-[720px]"
    >
      {event ? (
        <>
          <EventDetails event={event} />
          {event.request_id ? (
            <button
              type="button"
              onClick={() => onTrace(event.request_id as string)}
              className={cn('mt-4 rounded-full bg-white px-4 py-2 text-[13px] font-medium text-black', focusRing)}
            >
              Show everything in this request
            </button>
          ) : null}
        </>
      ) : null}
    </Dialog>
  );
}

function TraceDialog({ reference, onClose }: { reference: string | null; onClose: () => void }) {
  const [events, setEvents] = useState<OpsEventRow[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) return;
    setEvents(null);
    setFailed(null);
    api<{ events: OpsEventRow[] }>(`/api/admin/ops/trace?ref=${encodeURIComponent(reference)}`)
      .then((r) => setEvents(r.events))
      .catch((error) => setFailed(error instanceof ApiError ? error.message : 'Could not load this reference.'));
  }, [reference]);

  const main = events?.find((e) => e.kind === 'request') ?? events?.[0] ?? null;
  const others = events?.filter((e) => e !== main) ?? [];

  return (
    <Dialog open={reference !== null} onClose={onClose} title={`Reference ${reference ?? ''}`} className="max-w-[760px]">
      {failed ? (
        <p className="text-[13px] text-white/60">{failed}</p>
      ) : events === null ? (
        <LoadingRow label="Finding it" />
      ) : events.length === 0 ? (
        <p className="text-[13px] text-white/60">Nothing recorded under this reference. It may be older than the retention window, or mistyped.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {main ? <EventDetails event={main} /> : null}
          {others.length > 0 ? (
            <div>
              <p className="text-[12px] font-medium text-white/50">During this request ({others.length})</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {others.map((e) => (
                  <li key={e.id} className="flex items-start gap-2 rounded-[10px] bg-black/40 px-3 py-2 text-[12.5px]">
                    <StatusIcon status={e.level === 'error' ? 'down' : e.level === 'warn' ? 'issues' : 'ok'} className="mt-0.5 h-3.5 w-3.5" />
                    <span className="min-w-0 flex-1">
                      <span className="text-white/85">
                        {KIND_LABEL[e.kind]}: {e.name}
                      </span>
                      <span className="ml-2 font-mono text-[11.5px] text-white/45">
                        {e.status ?? 'no response'} {e.duration_ms !== null ? formatMs(e.duration_ms) : ''}
                      </span>
                      {e.path ? <span className="block truncate font-mono text-[11.5px] text-white/40">{e.path}</span> : null}
                      {e.message ? <span className="block text-white/55">{e.message}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
