'use client';

/**
 * The X profile audit, rendered. Used on the public /audit page, its share
 * page, and inside the app's Signals view.
 *
 * Every number shown is computed in lib/x/audit.ts from the account's own
 * posts; nothing here is a benchmark or an estimate.
 */

import type { AuditFlag, AuditPost, AuditReport } from '@/lib/x/audit';
import { cn, compactNumber } from '../ui';

const SEVERITY_STYLE: Record<AuditFlag['severity'], { dot: string; label: string }> = {
  high: { dot: 'bg-forge-bad', label: 'Fix first' },
  medium: { dot: 'bg-forge-warn', label: 'Worth fixing' },
  low: { dot: 'bg-forge-steel', label: 'Small win' },
};

export function AuditReportView({ report, actions }: { report: AuditReport; actions?: React.ReactNode }) {
  const { user, stats, narrative } = report;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-5 rounded-[28px] border border-white/[0.07] bg-forge-card p-6 sm:flex-row sm:items-center sm:p-8">
        {user.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatar.replace('_normal', '_200x200')} alt="" className="h-16 w-16 shrink-0 rounded-full border border-white/10 object-cover" />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[22px] font-semibold text-white">
            {user.name.charAt(0)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-white">{user.name}</h2>
            <a href={`https://x.com/${user.username}`} target="_blank" rel="noopener noreferrer" className="text-[15px] text-white/45 hover:text-white">
              @{user.username}
            </a>
          </div>
          {user.bio && <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-white/60">{user.bio}</p>}
          <p className="mt-2 text-[13px] text-white/45 tabular-nums">
            {compactNumber(user.followers)} followers · {compactNumber(user.following)} following
          </p>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </header>

      {narrative.headline && (
        <section className="rounded-[28px] bg-gradient-to-br from-forge-ember/[0.14] via-forge-card to-forge-card p-6 sm:p-8">
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-forge-gold">The short version</p>
          <p className="mt-3 text-[22px] font-semibold leading-snug tracking-[-0.02em] text-white sm:text-[26px]">{narrative.headline}</p>
          {narrative.diagnosis.length > 0 && (
            <ul className="mt-5 flex flex-col gap-2.5">
              {narrative.diagnosis.map((line) => (
                <li key={line} className="flex gap-3 text-[15px] leading-relaxed text-white/75">
                  <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-white/40" />
                  {line}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-label="Numbers" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Posts a week" value={stats.postsPerWeek.toString()} />
        <Stat label="Median likes" value={compactNumber(stats.medianLikes)} />
        <Stat label="Median replies" value={compactNumber(stats.medianReplies)} />
        <Stat label="Median reposts" value={compactNumber(stats.medianReposts)} />
        <Stat label="Median views" value={stats.medianImpressions !== null ? compactNumber(stats.medianImpressions) : 'Hidden'} />
        <Stat label="Longest silence" value={`${stats.longestGapDays}d`} />
      </section>
      <p className="-mt-3 text-[12.5px] text-white/35">
        From the last {stats.analysed} original posts, over {stats.spanDays} days. Replies and reposts are not counted.
      </p>

      {report.flags.length > 0 && (
        <section className="rounded-[28px] border border-white/[0.07] bg-forge-card p-6 sm:p-8">
          <h3 className="text-[17px] font-semibold text-white">What is holding it back</h3>
          <ul className="mt-5 flex flex-col divide-y divide-white/[0.05]">
            {report.flags.map((flag) => (
              <li key={flag.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                <span aria-hidden className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', SEVERITY_STYLE[flag.severity].dot)} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-medium text-white">{flag.title}</span>
                    <span className="text-[11.5px] text-white/35">{SEVERITY_STYLE[flag.severity].label}</span>
                  </div>
                  <p className="mt-1 text-[14px] leading-relaxed text-white/60">{flag.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {narrative.fixes.length > 0 && (
        <section className="rounded-[28px] border border-white/[0.07] bg-forge-card p-6 sm:p-8">
          <h3 className="text-[17px] font-semibold text-white">Three things to do this week</h3>
          <ol className="mt-5 flex flex-col gap-4">
            {narrative.fixes.map((fix, index) => (
              <li key={fix} className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-semibold text-black">
                  {index + 1}
                </span>
                <p className="pt-0.5 text-[15px] leading-relaxed text-white/80">{fix}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {report.hooks.length > 0 && <HookBreakdown hooks={report.hooks} />}
        {report.hours.some((h) => h > 0) && <HourChart hours={report.hours} best={stats.bestHourUtc} />}
      </div>

      {report.best.length > 0 && (
        <section className="rounded-[28px] border border-white/[0.07] bg-forge-card p-6 sm:p-8">
          <h3 className="text-[17px] font-semibold text-white">What worked</h3>
          {narrative.bestPostWhy && <p className="mt-1.5 text-[14px] leading-relaxed text-white/55">{narrative.bestPostWhy}</p>}
          <ul className="mt-5 grid gap-3 md:grid-cols-3">
            {report.best.slice(0, 3).map((post) => (
              <PostTile key={post.id} post={post} />
            ))}
          </ul>
        </section>
      )}

      {narrative.bioRewrite && (
        <section className="rounded-[28px] border border-white/[0.07] bg-forge-card p-6 sm:p-8">
          <h3 className="text-[17px] font-semibold text-white">A sharper bio</h3>
          <p className="mt-1 text-[13px] text-white/45">Uses only what is already in your bio and posts.</p>
          <p className="mt-4 rounded-2xl bg-white/[0.04] p-4 text-[15px] leading-relaxed text-white">{narrative.bioRewrite}</p>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/[0.07] bg-forge-card px-4 py-4">
      <div className="text-[24px] font-semibold tracking-[-0.02em] text-white tabular-nums">{value}</div>
      <div className="mt-1 text-[12px] text-white/45">{label}</div>
    </div>
  );
}

function PostTile({ post }: { post: AuditPost }) {
  return (
    <li>
      <a
        href={post.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-full flex-col rounded-[18px] bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.06]"
      >
        <p className="line-clamp-5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-white/80">{post.text}</p>
        <p className="mt-auto pt-3 text-[12px] text-white/40 tabular-nums">
          {compactNumber(post.likes)} likes · {compactNumber(post.replies)} replies · {compactNumber(post.reposts)} reposts
        </p>
      </a>
    </li>
  );
}

function HookBreakdown({ hooks }: { hooks: AuditReport['hooks'] }) {
  const max = Math.max(...hooks.map((h) => h.medianEngagement), 1);
  const sorted = [...hooks].sort((a, b) => b.medianEngagement - a.medianEngagement);
  return (
    <section className="rounded-[28px] border border-white/[0.07] bg-forge-card p-6 sm:p-8">
      <h3 className="text-[17px] font-semibold text-white">How posts open</h3>
      <p className="mt-1 text-[13px] text-white/45">Median engagement by opening type.</p>
      <ul className="mt-5 flex flex-col gap-3">
        {sorted.map((hook) => (
          <li key={hook.type}>
            <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
              <span className="text-white/80">{hook.label}</span>
              <span className="text-white/40 tabular-nums">
                {hook.count} {hook.count === 1 ? 'post' : 'posts'} · {compactNumber(hook.medianEngagement)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-forge-ember2 to-forge-gold"
                style={{ width: `${(hook.medianEngagement / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Posting hours, in UTC because the audit does not know the account's time zone. */
function HourChart({ hours, best }: { hours: number[]; best: number | null }) {
  const max = Math.max(...hours, 1);
  const width = 24 * 12;
  const height = 96;
  return (
    <section className="rounded-[28px] border border-white/[0.07] bg-forge-card p-6 sm:p-8">
      <h3 className="text-[17px] font-semibold text-white">When posts go out</h3>
      <p className="mt-1 text-[13px] text-white/45">
        Posts per hour of day, UTC.{best !== null ? ` Best results around ${String(best).padStart(2, '0')}:00.` : ''}
      </p>
      <svg viewBox={`0 0 ${width} ${height + 18}`} className="mt-5 w-full" role="img" aria-label="Posts by hour of day">
        {hours.map((count, hour) => {
          const h = Math.max((count / max) * height, count > 0 ? 3 : 1);
          return (
            <rect
              key={hour}
              x={hour * 12 + 2}
              y={height - h}
              width={8}
              height={h}
              rx={2}
              className={hour === best ? 'fill-forge-gold' : count > 0 ? 'fill-white/40' : 'fill-white/10'}
            />
          );
        })}
        {[0, 6, 12, 18].map((hour) => (
          <text key={hour} x={hour * 12 + 6} y={height + 14} textAnchor="middle" className="fill-white/35 text-[9px]">
            {String(hour).padStart(2, '0')}
          </text>
        ))}
      </svg>
    </section>
  );
}
