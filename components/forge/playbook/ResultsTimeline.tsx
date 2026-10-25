'use client';

/**
 * Every measured post in time order, as a bar of how it did against the
 * user's own median on that platform. The baseline is "your usual" (1x), so
 * a bar above the line beat it and a bar below fell short. One series, one
 * hue; the tooltip carries the post's opening and its numbers.
 */

import { useMemo, useRef, useState } from 'react';
import { PLATFORM_NAMES, type DraftPlatform } from '@/lib/forge/types';
import { compactNumber } from '../ui';

export interface TimelinePoint {
  id: string;
  platform: DraftPlatform;
  postedAt: string;
  opening: string;
  relative: number;
  impressions: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number;
  url: string | null;
}

const HEIGHT = 200;
const PAD = { top: 12, right: 8, bottom: 22, left: 34 };

export function ResultsTimeline({ points }: { points: TimelinePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const width = 720;

  const { max, ticks } = useMemo(() => {
    const top = Math.max(2, ...points.map((p) => p.relative));
    const ceiling = top <= 2 ? 2 : top <= 4 ? 4 : Math.ceil(top / 2) * 2;
    return { max: ceiling, ticks: ceiling <= 2 ? [0, 1, 2] : [0, 1, ceiling / 2, ceiling] };
  }, [points]);

  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(points.length, 1);
  const barW = Math.max(3, Math.min(18, slot - 2));
  const y = (v: number) => PAD.top + plotH - (Math.min(v, max) / max) * plotH;

  const active = hover !== null ? points[hover] : null;
  const firstDate = points[0] ? new Date(points[0].postedAt) : null;
  const lastDate = points.length > 0 ? new Date(points[points.length - 1].postedAt) : null;

  return (
    <div ref={frame} className="relative">
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Each post's engagement against your usual"
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(t)}
              y2={y(t)}
              className={t === 1 ? 'stroke-white/35' : 'stroke-white/[0.07]'}
              strokeDasharray={t === 1 ? '3 3' : undefined}
            />
            <text x={PAD.left - 8} y={y(t) + 3.5} textAnchor="end" className="fill-white/40 text-[10px]">
              {t}x
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const top = y(p.relative);
          const h = Math.max(PAD.top + plotH - top, 2);
          return (
            <g
              key={p.id}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={0}
              role="listitem"
              aria-label={`${p.opening}: ${p.relative} times your usual`}
            >
              {/* Hit target taller and wider than the bar. */}
              <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} fill="transparent" />
              <rect
                x={x}
                y={PAD.top + plotH - h}
                width={barW}
                height={h}
                rx={Math.min(4, barW / 2)}
                className={p.relative >= 1 ? 'fill-[#FF8A2B]' : 'fill-[#FF8A2B]/35'}
                opacity={hover === null || hover === i ? 1 : 0.45}
              />
            </g>
          );
        })}
        {firstDate && lastDate && (
          <>
            <text x={PAD.left} y={HEIGHT - 4} className="fill-white/35 text-[10px]">
              {firstDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </text>
            <text x={width - PAD.right} y={HEIGHT - 4} textAnchor="end" className="fill-white/35 text-[10px]">
              {lastDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </text>
          </>
        )}
      </svg>

      <p className="mt-2 flex items-center gap-2 text-[11.5px] text-white/40">
        <svg width="18" height="2" aria-hidden>
          <line x1="0" x2="18" y1="1" y2="1" className="stroke-white/50" strokeDasharray="3 3" />
        </svg>
        Your usual (1x)
      </p>

      {active && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-[260px] rounded-[14px] border border-white/[0.1] bg-[#111] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
          style={{ left: `clamp(0px, calc(${((PAD.left + hover * slot + slot / 2) / width) * 100}% - 130px), calc(100% - 260px))` }}
        >
          <p className="text-[11.5px] text-white/45">
            {PLATFORM_NAMES[active.platform]} · {new Date(active.postedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </p>
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-white">{active.opening}</p>
          <p className="mt-2 text-[12px] font-medium text-white/85">{active.relative}x your usual</p>
          <p className="mt-0.5 text-[11.5px] text-white/45 tabular-nums">
            {active.impressions !== null ? `${compactNumber(active.impressions)} views · ` : ''}
            {compactNumber(active.likes)} likes · {compactNumber(active.replies)} replies · {compactNumber(active.reposts)} reposts
          </p>
        </div>
      )}
    </div>
  );
}
