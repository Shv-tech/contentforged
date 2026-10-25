'use client';

/**
 * Predictions, kept honest: every range Forge gave before a post went out,
 * what actually happened, and how often the range was right. When the
 * misses lean one way, it says so.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, onBrandChange } from '@/lib/forge/client';
import { describeRange } from '@/lib/forge/prediction-format';
import { PLATFORM_NAMES, isDraftPlatform } from '@/lib/forge/types';
import { PlatformGlyph } from '@/components/forge/icons';
import { EmptyState, LoadingRow, StatTile, Tag, cn, relativeTime } from '@/components/forge/ui';

interface PredictionsResponse {
  hitRate: { evaluated: number; landed: number; rate: number | null };
  misses: { above: number; below: number };
  predictions: Array<{
    draft_id: string;
    platform: string;
    expected: number;
    low: number;
    high: number;
    basis_count: number;
    actual: number | null;
    landed: boolean | null;
    created_at: string;
    opening: string;
    postedAt: string | null;
  }>;
}

export function PredictionsPanel() {
  const [data, setData] = useState<PredictionsResponse | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<PredictionsResponse>('/api/predictions'));
    } catch {
      setData({ hitRate: { evaluated: 0, landed: 0, rate: null }, misses: { above: 0, below: 0 }, predictions: [] });
    }
  }, []);

  useEffect(() => {
    void load();
    return onBrandChange(load);
  }, [load]);

  if (!data) return <LoadingRow label="Loading predictions" />;
  if (data.predictions.length === 0) {
    return (
      <EmptyState
        plate="steel"
        title="No predictions yet"
        body="Forge predicts a post's result once you have six or more posts with results on that platform. Each prediction is frozen when the post goes out and checked against what happens."
      />
    );
  }

  const { hitRate, misses } = data;
  const lean = misses.above + misses.below >= 4 && Math.abs(misses.above - misses.below) >= 3 ? (misses.above > misses.below ? 'above' : 'below') : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile
          label="Ranges that were right"
          value={hitRate.rate === null ? 'Too few' : `${Math.round(hitRate.rate * 100)}%`}
          note={hitRate.rate === null ? `Shown after 5 checked posts. ${hitRate.evaluated} so far.` : `${hitRate.landed} of the last ${hitRate.evaluated}`}
          tone={hitRate.rate !== null && hitRate.rate >= 0.6 ? 'good' : hitRate.rate !== null && hitRate.rate < 0.4 ? 'warn' : undefined}
        />
        <StatTile label="Did better than the range" value={misses.above} />
        <StatTile label="Did worse than the range" value={misses.below} />
      </div>

      {lean && (
        <p className="rounded-[16px] border border-white/[0.07] bg-white/[0.025] px-5 py-4 text-[13.5px] leading-relaxed text-white/70">
          {lean === 'above'
            ? 'Your posts have been beating Forge’s ranges. Your audience is growing faster than your history shows; the ranges catch up as new results come in.'
            : 'Your posts have been landing under Forge’s ranges. Something has changed since your best stretch, such as reach or timing; the ranges adjust as new results come in.'}
        </p>
      )}

      <ul className="flex flex-col divide-y divide-white/[0.05] overflow-hidden rounded-[20px] border border-white/[0.07] bg-forge-card">
        {data.predictions.map((p) => (
          <li key={p.draft_id}>
            <Link href={`/drafts/${p.draft_id}`} className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-white/[0.03] sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {isDraftPlatform(p.platform) && <PlatformGlyph platform={p.platform} className="h-3.5 w-3.5 shrink-0 text-white/50" />}
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] text-white/85">{p.opening || 'A post'}</p>
                  <p className="mt-0.5 text-[11.5px] text-white/35">
                    {isDraftPlatform(p.platform) ? PLATFORM_NAMES[p.platform] : p.platform} · {p.postedAt ? `posted ${relativeTime(p.postedAt)}` : 'not posted yet'}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-[12.5px]">
                <span className="text-white/50">Expected {describeRange(p)}</span>
                {p.actual === null ? (
                  <Tag tone="steel">Waiting</Tag>
                ) : (
                  <Tag tone={p.landed ? 'good' : 'warn'} className={cn('tabular-nums')}>
                    {p.actual.toFixed(1)}x · {p.landed ? 'in range' : p.actual > p.high ? 'above' : 'below'}
                  </Tag>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-[12px] leading-relaxed text-white/35">A range is right when the post&rsquo;s result, against your usual on that platform, lands inside it. The rate counts your last 50 checked posts.</p>
    </div>
  );
}
