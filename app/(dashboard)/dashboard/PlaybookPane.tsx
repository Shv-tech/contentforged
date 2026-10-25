'use client';

/**
 * Playbook: what works for this brand, from its own results.
 *
 * Every finding states the sample it rests on. With a few dozen posts these
 * are tendencies, not laws, and the copy says so instead of dressing small
 * numbers up as certainty.
 */

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError, WORKSPACE_CHANGED_EVENT } from '@/lib/forge/client';
import type { Finding } from '@/lib/forge/playbook';
import { PLATFORM_NAMES, type DraftPlatform } from '@/lib/forge/types';
import { DraftCardById } from '@/components/forge/drafts/DraftCard';
import { CalibrationScatter } from '@/components/forge/playbook/CalibrationScatter';
import { ResultsTimeline, type TimelinePoint } from '@/components/forge/playbook/ResultsTimeline';
import { PlatformGlyph } from '@/components/forge/icons';
import { Card, EmptyState, Segmented, Spinner, Tag, compactNumber, relativeTime } from '@/components/forge/ui';
import { ExperimentsPanel } from '@/components/forge/playbook/ExperimentsPanel';
import { GoalsPanel } from '@/components/forge/playbook/GoalsPanel';
import { PredictionsPanel } from '@/components/forge/playbook/PredictionsPanel';
import { ViewShell, composeInChat } from '@/components/forge/views/ViewShell';

interface PlaybookResponse {
  postedCount: number;
  measuredCount: number;
  totals: { impressions: number; likes: number; replies: number; reposts: number };
  findings: Finding[];
  calibration: { pairs: number; correlation: number | null };
  series: Array<TimelinePoint & { engagement: number; percentile: number; grade: number | null }>;
  unmeasured: Array<{ id: string; platform: DraftPlatform; postedAt: string | null; opening: string }>;
  niche: {
    optedIn: boolean;
    name: string | null;
    signals: Array<{ dimension: string; bucket: string; lift: number; contributor_count: number; post_count: number; text: string }>;
  };
}

type Tab = 'works' | 'experiments' | 'predictions' | 'goals';

const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: 'works', label: 'What works' },
  { value: 'experiments', label: 'Experiments' },
  { value: 'predictions', label: 'Predictions' },
  { value: 'goals', label: 'Goals' },
];

/** Findings need a few measured posts on each side before any can appear. */
const POSTS_FOR_FINDINGS = 6;

export function PlaybookPane() {
  const [data, setData] = useState<PlaybookResponse | null>(null);
  const [openDraft, setOpenDraft] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('works');

  // Links such as /dashboard?view=playbook&tab=experiments open a tab directly.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (TABS.some((t) => t.value === requested)) setTab(requested as Tab);
  }, []);

  const load = useCallback(async () => {
    try {
      setData(await api<PlaybookResponse>('/api/playbook'));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not load your Playbook.');
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(WORKSPACE_CHANGED_EVENT, load);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, load);
  }, [load]);

  return (
    <ViewShell title="Playbook" subtitle="What works for you, measured from your own posts. Forge reads this before every draft." width="wide">
      <div className="mb-6 overflow-x-auto pb-1">
        <Segmented<Tab> label="Playbook section" value={tab} onChange={setTab} options={TABS} />
      </div>
      {tab === 'experiments' ? (
        <ExperimentsPanel />
      ) : tab === 'predictions' ? (
        <PredictionsPanel />
      ) : tab === 'goals' ? (
        <GoalsPanel />
      ) : !data ? (
        <div className="flex items-center gap-2 py-16 text-[13.5px] text-white/45">
          <Spinner /> Reading your results
        </div>
      ) : data.postedCount === 0 ? (
        <EmptyState
          plate="quench"
          title="Nothing posted through Forge yet"
          body="Post a draft and link it to the live post. Forge collects its results at 1 hour, 24 hours and 7 days, and this page starts to fill in with what works for you."
        />
      ) : (
        <div className="flex flex-col gap-6">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Posts linked" value={String(data.postedCount)} note={`${data.measuredCount} with results`} />
            <Tile label="Views" value={compactNumber(data.totals.impressions)} note="Where the platform reports them" />
            <Tile label="Replies" value={compactNumber(data.totals.replies)} note="The strongest signal" />
            <Tile label="Reposts" value={compactNumber(data.totals.reposts)} note="Including quotes" />
          </section>

          {data.series.length > 0 && (
            <Card className="p-6">
              <h3 className="text-[16px] font-semibold text-white">Each post against your usual</h3>
              <p className="mt-1 text-[13px] text-white/45">Engagement divided by your median on the same platform. Solid bars beat it.</p>
              <div className="mt-5">
                <ResultsTimeline points={data.series} />
              </div>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card className="p-6">
              <h3 className="text-[16px] font-semibold text-white">What works for you</h3>
              {data.findings.length === 0 ? (
                <p className="mt-3 text-[14px] leading-relaxed text-white/55">
                  {data.measuredCount < POSTS_FOR_FINDINGS
                    ? `Findings appear once ${POSTS_FOR_FINDINGS} or more posts have results. You have ${data.measuredCount}.`
                    : 'No pattern is strong enough yet. That usually means your posts perform consistently, which is good.'}
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-3">
                  {data.findings.map((finding) => (
                    <li key={finding.id} className="flex gap-3 rounded-[16px] bg-white/[0.03] p-4">
                      <span aria-hidden className={finding.direction === 'better' ? 'mt-1.5 h-2 w-2 shrink-0 rounded-full bg-forge-good' : 'mt-1.5 h-2 w-2 shrink-0 rounded-full bg-forge-bad'} />
                      <div className="min-w-0">
                        <p className="text-[14.5px] leading-relaxed text-white/90">{finding.text}</p>
                        <p className="mt-1 text-[11.5px] text-white/35">
                          {finding.dimension} · {finding.direction === 'better' ? 'Do more of this' : 'Do less of this'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {data.findings.some((f) => f.direction === 'better') && (
                <button
                  type="button"
                  onClick={() =>
                    composeInChat({
                      fresh: true,
                      send: true,
                      tool: null,
                      text: `Based on my Playbook, write my next post the way my best ones work:\n${data.findings
                        .filter((f) => f.direction === 'better')
                        .map((f) => `- ${f.text}`)
                        .join('\n')}\n\nAsk me what it should be about first.`,
                    })
                  }
                  className="mt-4 inline-flex h-8 items-center rounded-full bg-white px-3.5 text-[13px] font-medium text-black hover:bg-white/85"
                >
                  Write the next one this way
                </button>
              )}
            </Card>

            <Card className="p-6">
              <h3 className="text-[16px] font-semibold text-white">Is the grade right for you?</h3>
              <CalibrationSummary pairs={data.calibration.pairs} correlation={data.calibration.correlation} />
              {data.series.filter((p) => p.grade !== null).length >= 3 && (
                <div className="mt-4">
                  <CalibrationScatter
                    points={data.series.filter((p) => p.grade !== null).map((p) => ({ id: p.id, grade: p.grade!, percentile: p.percentile, opening: p.opening }))}
                  />
                </div>
              )}
            </Card>
          </div>

          {data.niche.optedIn && (
            <Card className="p-6">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[16px] font-semibold text-white">Across {data.niche.name ?? 'your niche'}</h3>
                <Tag tone="steel">Anonymous</Tag>
              </div>
              {data.niche.signals.length === 0 ? (
                <p className="mt-3 text-[14px] leading-relaxed text-white/55">
                  Not enough creators in this niche share patterns yet. A pattern is shown only when at least five contribute to it.
                </p>
              ) : (
                <ul className="mt-4 grid gap-3 md:grid-cols-2">
                  {data.niche.signals.map((signal) => (
                    <li key={`${signal.dimension}:${signal.bucket}`} className="rounded-[16px] bg-white/[0.03] p-4">
                      <p className="text-[14px] text-white/90">
                        {signal.text}: <span className="font-semibold">{signal.lift}x</span> the creator&apos;s usual
                      </p>
                      <p className="mt-1 text-[11.5px] text-white/35">
                        {signal.contributor_count} creators, {signal.post_count} posts, last 90 days
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {data.unmeasured.length > 0 && (
            <Card className="p-6">
              <h3 className="text-[16px] font-semibold text-white">Posted, waiting for numbers</h3>
              <p className="mt-1 text-[13px] text-white/45">Open one to refresh its results or add them by hand.</p>
              <ul className="mt-4 flex flex-col gap-2">
                {data.unmeasured.map((post) => (
                  <li key={post.id}>
                    {openDraft === post.id ? (
                      <div>
                        <button type="button" onClick={() => setOpenDraft(null)} className="mb-2 text-[12.5px] text-white/45 hover:text-white">
                          Collapse
                        </button>
                        <DraftCardById id={post.id} />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOpenDraft(post.id)}
                        className="flex w-full items-center gap-3 rounded-[14px] bg-white/[0.03] px-4 py-3 text-left hover:bg-white/[0.05]"
                      >
                        <PlatformGlyph platform={post.platform} className="h-3.5 w-3.5 shrink-0 text-white/60" />
                        <span className="min-w-0 flex-1 truncate text-[14px] text-white/85">{post.opening || 'Untitled'}</span>
                        <span className="shrink-0 text-[12px] text-white/35">
                          {PLATFORM_NAMES[post.platform]} · {relativeTime(post.postedAt)}
                        </span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </ViewShell>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[20px] border border-white/[0.07] bg-forge-card p-5">
      <div className="text-[12.5px] text-white/50">{label}</div>
      <div className="mt-1.5 text-[28px] font-semibold tracking-[-0.02em] text-white tabular-nums">{value}</div>
      <div className="mt-1 text-[11.5px] text-white/35">{note}</div>
    </div>
  );
}

function CalibrationSummary({ pairs, correlation }: { pairs: number; correlation: number | null }) {
  if (correlation === null) {
    return (
      <p className="mt-3 text-[14px] leading-relaxed text-white/55">
        After six graded posts have results, this shows whether a high grade has meant a better post for you. You have {pairs}.
      </p>
    );
  }
  const verdict =
    correlation >= 0.4
      ? 'Yes. High grades have meant better results for you, so trust them.'
      : correlation <= 0.1
        ? 'Not yet. For you the grade has not predicted results; your Playbook findings are the better guide.'
        : 'Loosely. Higher grades have done somewhat better for you.';
  return (
    <p className="mt-3 text-[14px] leading-relaxed text-white/70">
      {verdict} <span className="text-white/40">Rank correlation {correlation.toFixed(2)} over {pairs} posts.</span>
    </p>
  );
}
