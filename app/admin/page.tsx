'use client';

/**
 * /admin: how Forge is actually used, from product events only. Counts of
 * people and actions, never anything anyone wrote. Visible to the
 * addresses in ADMIN_EMAILS; everyone else gets a not-found page.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/forge/client';
import type { Insights } from '@/lib/forge/insights';
import { StandaloneShell } from '@/components/forge/StandaloneShell';
import { Card, LoadingRow, Segmented, StatTile, cn, compactNumber } from '@/components/forge/ui';

type Window = '7' | '30' | '90';

export default function AdminPage() {
  const [days, setDays] = useState<Window>('30');
  const [data, setData] = useState<Insights | null>(null);
  const [hidden, setHidden] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    setData(null);
    try {
      setData(await api<Insights>(`/api/admin/insights?days=${days}`));
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 401)) setHidden(true);
      else setFailed(error instanceof ApiError ? error.message : 'Could not load insights.');
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  // Not an admin: look exactly like a page that does not exist.
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
    <StandaloneShell
      title="Usage"
      surface="admin"
      width="wide"
      showBrand={false}
      actions={
        <>
          <Link href="/admin/ops" className="rounded-full border border-white/[0.1] px-3 py-1.5 text-[12.5px] text-white/75 transition hover:text-white">
            Health and errors
          </Link>
          <Segmented<Window>
            label="Window"
            value={days}
            onChange={setDays}
            options={[
              { value: '7', label: '7 days' },
              { value: '30', label: '30 days' },
              { value: '90', label: '90 days' },
            ]}
          />
        </>
      }
    >
      {failed ? <p className="py-16 text-center text-[14px] text-white/55">{failed}</p> : !data ? <LoadingRow label="Counting" /> : <Dashboard data={data} />}
    </StandaloneShell>
  );
}

function Dashboard({ data }: { data: Insights }) {
  const peak = Math.max(1, ...data.active.map((d) => d.users));
  const top = data.funnel[0]?.users || 1;
  const decided = data.plan.approved + data.plan.skipped;
  const editTotal = data.editDepth.reduce((sum, b) => sum + b.events, 0);
  const activeToday = data.active[data.active.length - 1]?.users ?? 0;
  const averageDaily = Math.round(data.active.reduce((sum, d) => sum + d.users, 0) / Math.max(data.active.length, 1));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="People" value={compactNumber(data.totals.users)} note={`Opened Forge in the last ${data.days} days`} />
        <StatTile label="Today" value={activeToday} note={`${averageDaily} on an average day`} />
        <StatTile
          label="Plan approval"
          value={decided > 0 ? `${Math.round((data.plan.approved / decided) * 100)}%` : 'None yet'}
          note={`${data.plan.approved} approved, ${data.plan.skipped} skipped, ${data.plan.generated} plans`}
        />
        <StatTile label="Events" value={compactNumber(data.totals.events)} />
      </div>

      <Card className="p-6">
        <h2 className="text-[15px] font-semibold text-white">People active each day</h2>
        <div className="mt-5 flex h-[140px] items-end gap-[3px]" role="img" aria-label="Daily active people">
          {data.active.map((day) => (
            <div key={day.day} className="group relative flex h-full flex-1 items-end" title={`${day.day}: ${day.users}`}>
              <div
                className="w-full rounded-t-[3px] bg-gradient-to-t from-forge-ember2 to-forge-gold opacity-80 transition-opacity group-hover:opacity-100"
                style={{ height: `${Math.max(2, (day.users / peak) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-white/30">
          <span>{data.active[0]?.day}</span>
          <span>{data.active[data.active.length - 1]?.day}</span>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-[15px] font-semibold text-white">From opening Forge to publishing</h2>
          <p className="mt-1 text-[12.5px] text-white/40">People who did each, in the window. Not a strict sequence.</p>
          <ol className="mt-5 flex flex-col gap-3">
            {data.funnel.map((step) => (
              <li key={step.label}>
                <div className="flex justify-between text-[13px]">
                  <span className="text-white/75">{step.label}</span>
                  <span className="tabular-nums text-white/55">
                    {step.users} <span className="text-white/30">{Math.round((step.users / top) * 100)}%</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-forge-ember" style={{ width: `${(step.users / top) * 100}%` }} />
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="p-6">
          <h2 className="text-[15px] font-semibold text-white">How much of each draft people rewrite</h2>
          <p className="mt-1 text-[12.5px] text-white/40">Share of words changed in each edit. Heavy rewriting means the first draft missed.</p>
          <ul className="mt-5 flex flex-col gap-3">
            {data.editDepth.map((band, index) => (
              <li key={band.bucket}>
                <div className="flex justify-between text-[13px]">
                  <span className="text-white/75">{band.bucket}</span>
                  <span className="tabular-nums text-white/55">{editTotal ? `${Math.round((band.events / editTotal) * 100)}%` : '0%'}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={cn('h-full rounded-full', index < 2 ? 'bg-forge-good' : 'bg-forge-warn')}
                    style={{ width: `${editTotal ? (band.events / editTotal) * 100 : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Ranked title="Views opened" rows={data.features.map((f) => ({ label: f.feature, value: f.users, unit: 'people' }))} />
        <Ranked title="Where drafts came from" rows={data.draftOrigins.map((o) => ({ label: o.origin, value: o.events, unit: 'drafts' }))} />
        <Ranked title="How people capture" rows={data.captureSources.map((c) => ({ label: c.source, value: c.events, unit: 'captures' }))} />
      </div>

      {data.retention.length > 0 && (
        <Card className="overflow-x-auto p-6">
          <h2 className="text-[15px] font-semibold text-white">Who comes back</h2>
          <p className="mt-1 text-[12.5px] text-white/40">
            Each row is the week people first opened Forge; each column, how many returned that many weeks later.
          </p>
          <table className="mt-5 w-full min-w-[560px] text-[12.5px] tabular-nums">
            <thead className="text-white/35">
              <tr>
                <th className="py-2 pr-4 text-left font-medium">Week of</th>
                <th className="py-2 pr-4 text-left font-medium">People</th>
                {Array.from({ length: 8 }, (_, i) => (
                  <th key={i} className="px-1 py-2 text-center font-medium">
                    {i === 0 ? 'Week 0' : `+${i}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.retention.map((row) => (
                <tr key={row.cohort}>
                  <td className="py-1 pr-4 text-white/60">{row.cohort}</td>
                  <td className="py-1 pr-4 text-white/80">{row.size}</td>
                  {Array.from({ length: 8 }, (_, i) => {
                    const value = row.weeks[i];
                    const share = row.size > 0 && value !== undefined ? value / row.size : null;
                    return (
                      <td key={i} className="px-1 py-1">
                        <div
                          className="flex h-8 items-center justify-center rounded-[6px] text-[11.5px]"
                          style={{
                            background: share === null ? 'transparent' : `rgba(255,138,43,${0.08 + share * 0.8})`,
                            color: share !== null && share > 0.5 ? '#000' : 'rgba(255,255,255,0.75)',
                          }}
                        >
                          {share === null ? '' : `${Math.round(share * 100)}%`}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="text-[15px] font-semibold text-white">Every event</h2>
        <table className="mt-4 w-full text-[13px] tabular-nums">
          <thead className="text-left text-[11.5px] uppercase tracking-[0.08em] text-white/35">
            <tr>
              <th className="py-2 font-semibold">Event</th>
              <th className="py-2 text-right font-semibold">People</th>
              <th className="py-2 text-right font-semibold">Times</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {data.events.map((event) => (
              <tr key={event.name}>
                <td className="py-2 font-mono text-[12.5px] text-white/75">{event.name}</td>
                <td className="py-2 text-right text-white/60">{event.users}</td>
                <td className="py-2 text-right text-white/60">{event.events}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-[11.5px] text-white/30">Generated {new Date(data.generatedAt).toLocaleString()}.</p>
      </Card>
    </div>
  );
}

function Ranked({ title, rows }: { title: string; rows: Array<{ label: string; value: number; unit: string }> }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card className="p-6">
      <h2 className="text-[15px] font-semibold text-white">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-white/40">Nothing in this window.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2.5">
          {rows.slice(0, 10).map((row) => (
            <li key={row.label}>
              <div className="flex justify-between gap-3 text-[13px]">
                <span className="truncate text-white/75">{row.label}</span>
                <span className="shrink-0 tabular-nums text-white/50">{row.value}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-white/50" style={{ width: `${(row.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
