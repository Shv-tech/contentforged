/**
 * /r/[token]: a monthly client report, readable without an account.
 *
 * The token is the only key, it expires, and the page is never indexed.
 * Everything shown was frozen into the report when it was built, so the
 * page reads nothing live and leaks nothing beyond the report itself.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { reportByToken, type ReportData } from '@/lib/forge/reports';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Monthly report',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

function compact(value: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function change(current: number, previous: number): { label: string; tone: 'up' | 'down' | 'flat' } | null {
  if (previous <= 0) return null;
  const delta = (current - previous) / previous;
  if (Math.abs(delta) < 0.05) return { label: 'about the same as last month', tone: 'flat' };
  return { label: `${delta > 0 ? 'up' : 'down'} ${Math.round(Math.abs(delta) * 100)}% on last month`, tone: delta > 0 ? 'up' : 'down' };
}

function Figure({ label, value, delta }: { label: string; value: string; delta?: ReturnType<typeof change> }) {
  return (
    <div className="rounded-[20px] border border-white/[0.07] bg-[#0E0E0E] p-5 print:border-black/15 print:bg-white">
      <p className="text-[12px] font-medium text-white/45 print:text-black/55">{label}</p>
      <p className="mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-white print:text-black">{value}</p>
      {delta && <p className={`mt-2 text-[12px] ${delta.tone === 'up' ? 'text-[#8EE3B0] print:text-green-700' : delta.tone === 'down' ? 'text-[#FFB067] print:text-amber-700' : 'text-white/40 print:text-black/50'}`}>{delta.label}</p>}
    </div>
  );
}

export default async function ReportPage({ params }: { params: { token: string } }) {
  const report = await reportByToken(params.token);
  if (!report) notFound();
  const data: ReportData = report.data;
  const goals = data.goals;
  const goalTotal = goals.bookings + goals.signups + goals.purchases;

  return (
    <div className="min-h-[100dvh] bg-black font-sans text-white print:bg-white print:text-black">
      <main className="mx-auto max-w-[880px] px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
        <header className="flex flex-col gap-3 border-b border-white/[0.08] pb-10 print:border-black/15">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#FFB067] print:text-amber-700">{data.periodLabel}</p>
          <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[44px]">{data.workspaceName}</h1>
          <p className="max-w-[640px] text-[17px] leading-relaxed text-white/70 print:text-black/70">{data.headline}</p>
        </header>

        {report.note && (
          <section className="mt-10 rounded-[22px] border border-white/[0.07] bg-white/[0.02] p-6 print:border-black/15">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/40 print:text-black/50">A note from your team</p>
            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-white/85 print:text-black/85">{report.note}</p>
          </section>
        )}

        <section className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Figure label="Posts published" value={String(data.posted)} delta={change(data.posted, data.previousPosted)} />
          <Figure label="Views" value={compact(data.totals.impressions)} />
          <Figure label="Engagement" value={compact(data.totals.engagement)} delta={change(data.totals.engagement, data.previousEngagement)} />
          <Figure label="Replies" value={compact(data.totals.replies)} />
        </section>

        {(goalTotal > 0 || goals.clicks > 0) && (
          <section className="mt-12">
            <h2 className="text-[19px] font-semibold tracking-[-0.02em]">What the posts led to</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Figure label="Bookings" value={String(goals.bookings)} />
              <Figure label="Sign-ups" value={String(goals.signups)} />
              <Figure label="Purchases" value={String(goals.purchases)} />
              <Figure label="Link clicks" value={compact(goals.clicks)} />
            </div>
          </section>
        )}

        {data.topPosts.length > 0 && (
          <section className="mt-12">
            <h2 className="text-[19px] font-semibold tracking-[-0.02em]">The posts that did best</h2>
            <ol className="mt-4 flex flex-col gap-3">
              {data.topPosts.map((post, index) => (
                <li key={index} className="flex gap-4 rounded-[20px] border border-white/[0.07] bg-[#0E0E0E] p-5 print:border-black/15 print:bg-white">
                  <span className="text-[13px] font-semibold tabular-nums text-[#FFB067] print:text-amber-700">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] leading-relaxed text-white/90 print:text-black/90">{post.opening}</p>
                    <p className="mt-2 text-[12.5px] text-white/45 print:text-black/55">
                      {post.platform}
                      {post.impressions ? ` · ${compact(post.impressions)} views` : ''} · {compact(post.engagement)} engagement · {post.relative.toFixed(1)}x the usual
                      {post.url && (
                        <>
                          {' · '}
                          <a href={post.url} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4 hover:text-white print:hidden">
                            View
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {data.findings.length > 0 && (
          <section className="mt-12">
            <h2 className="text-[19px] font-semibold tracking-[-0.02em]">What we learned</h2>
            <ul className="mt-4 flex flex-col gap-2">
              {data.findings.map((finding, index) => (
                <li key={index} className="flex gap-3 text-[15px] leading-relaxed text-white/80 print:text-black/80">
                  <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF8A2B]" />
                  {finding}
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.byPlatform.length > 0 && (
          <section className="mt-12">
            <h2 className="text-[19px] font-semibold tracking-[-0.02em]">Where it went out</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {data.byPlatform.map((row) => (
                <span key={row.platform} className="rounded-full bg-white/[0.06] px-3.5 py-1.5 text-[13px] text-white/80 print:bg-black/5 print:text-black/80">
                  {row.platform}: {row.count}
                </span>
              ))}
            </div>
          </section>
        )}

        {data.upcoming.length > 0 && (
          <section className="mt-12">
            <h2 className="text-[19px] font-semibold tracking-[-0.02em]">Coming up</h2>
            <ul className="mt-4 flex flex-col divide-y divide-white/[0.06] overflow-hidden rounded-[20px] border border-white/[0.07] print:divide-black/10 print:border-black/15">
              {data.upcoming.map((item, index) => (
                <li key={index} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-0 flex-1 text-[14px] text-white/85 print:text-black/85">{item.opening}</span>
                  <span className="shrink-0 text-[12.5px] text-white/40 print:text-black/50">
                    {item.platform} · {new Date(item.at).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-16 flex items-center justify-between border-t border-white/[0.08] pt-6 text-[12px] text-white/35 print:border-black/15 print:text-black/45">
          <span>
            {new Date(`${data.periodStart}T00:00:00Z`).toLocaleDateString('en', { month: 'long', day: 'numeric', timeZone: 'UTC' })} to{' '}
            {new Date(`${data.periodEnd}T00:00:00Z`).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
          </span>
          <span>Prepared with Forge</span>
        </footer>
      </main>
    </div>
  );
}
