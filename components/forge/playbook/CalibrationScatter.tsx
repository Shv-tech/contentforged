'use client';

/**
 * Grade before posting against how the post actually ranked among the
 * user's own posts. If the grader is useful for this person, dots climb to
 * the right.
 */

import { useState } from 'react';

export interface CalibrationPoint {
  id: string;
  grade: number;
  percentile: number;
  opening: string;
}

const W = 360;
const H = 220;
const PAD = { top: 10, right: 10, bottom: 30, left: 48 };

export function CalibrationScatter({ points }: { points: CalibrationPoint[] }) {
  const [hover, setHover] = useState<CalibrationPoint | null>(null);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (grade: number) => PAD.left + (grade / 50) * plotW;
  const y = (pct: number) => PAD.top + plotH - pct * plotH;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Grade against actual rank" onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-white/[0.07]" />
            <text x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end" className="fill-white/40 text-[10px]">
              {t === 0 ? 'Worst' : t === 1 ? 'Best' : 'Middle'}
            </text>
          </g>
        ))}
        {[0, 25, 40, 50].map((g) => (
          <text key={g} x={x(g)} y={H - 14} textAnchor="middle" className="fill-white/40 text-[10px]">
            {g}
          </text>
        ))}
        <text x={PAD.left + plotW / 2} y={H - 2} textAnchor="middle" className="fill-white/35 text-[10px]">
          Grade before posting
        </text>
        {points.map((p) => (
          <circle
            key={p.id}
            cx={x(p.grade)}
            cy={y(p.percentile)}
            r={hover?.id === p.id ? 6 : 4.5}
            className="fill-[#FFB067] stroke-[#0E0E0E]"
            strokeWidth={2}
            onMouseEnter={() => setHover(p)}
          />
        ))}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute left-1/2 top-0 w-[240px] -translate-x-1/2 rounded-[12px] border border-white/[0.1] bg-[#111] p-2.5 text-[12px] shadow-[0_12px_32px_rgba(0,0,0,0.6)]">
          <p className="line-clamp-2 text-white">{hover.opening}</p>
          <p className="mt-1 text-white/50">
            Graded {hover.grade}/50, beat {Math.round(hover.percentile * 100)}% of your posts
          </p>
        </div>
      )}
    </div>
  );
}
