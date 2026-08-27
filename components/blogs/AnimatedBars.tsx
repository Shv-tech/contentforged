'use client';

// components/blog/AnimatedBars.tsx
//
// A bar chart that fills as it scrolls into view.
//
// Deliberately not a charting library. Recharts and its peers pull 100kb+ for
// what is, on a blog, six bars and a label. This renders as plain divs, works
// without JavaScript (bars simply appear at full width), and inherits the
// site's type and colour rather than fighting a library's defaults.

import { useEffect, useRef, useState } from 'react';

export interface BarDatum {
  label: string;
  /** Any unit. Scaling is relative to the largest value in the set. */
  value: number;
  /** Rendered as-is, e.g. "+5%" or "23% lower". Falls back to the number. */
  display?: string;
  /** Marks the bar the argument hangs on. One per chart, at most. */
  highlight?: boolean;
  /** Negative values render in the warning colour automatically. */
}

interface AnimatedBarsProps {
  data: BarDatum[];
  /** Shown above the chart. State the finding, not the axis. */
  caption?: string;
  /** Attribution. Always cite; an uncited chart is decoration. */
  source?: string;
}

export function AnimatedBars({ data, caption, source }: AnimatedBarsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Animating on scroll rather than on mount means the reader actually sees
    // the fill happen. A chart that animated while off-screen is just a
    // static chart by the time it matters.
    //
    // Falls back to visible immediately where IntersectionObserver is absent,
    // so the data is never hidden by a missing API.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            // Once only. Re-animating on every scroll past is a distraction
            // in a long article.
            observer.disconnect();
          }
        }
      },
      { threshold: 0.35 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Scale against the largest magnitude so a single negative bar does not
  // compress everything else into invisibility.
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);

  return (
    <figure ref={ref} className="my-12">
      {caption && (
        <figcaption className="mb-6 text-[15px] leading-relaxed text-white/60 font-normal">
          {caption}
        </figcaption>
      )}

      <div className="space-y-5">
        {data.map((d, i) => {
          const pct = (Math.abs(d.value) / max) * 100;
          const negative = d.value < 0;

          return (
            <div key={d.label}>
              <div className="flex items-baseline justify-between mb-2 gap-4">
                <span className="text-[14px] text-white/80 leading-snug">{d.label}</span>
                <span
                  className={`text-[14px] font-medium tabular-nums shrink-0 ${
                    negative ? 'text-[#e07a5f]' : d.highlight ? 'text-[#d18a5e]' : 'text-white/70'
                  }`}
                >
                  {d.display ?? d.value}
                </span>
              </div>

              <div className="h-[6px] w-full rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: visible ? `${pct}%` : '0%',
                    background: negative
                      ? '#e07a5f'
                      : d.highlight
                      ? 'linear-gradient(90deg,#d18a5e,#e39a6e)'
                      : 'rgba(255,255,255,0.28)',
                    // Staggered so the bars read as a sequence rather than
                    // everything moving at once, which is harder to follow.
                    transition: `width 900ms cubic-bezier(0.16,1,0.3,1) ${i * 90}ms`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {source && (
        <p className="mt-6 text-[12px] text-white/30 leading-relaxed">{source}</p>
      )}
    </figure>
  );
}

/**
 * A single large figure with supporting text.
 *
 * For the one number an article is built around. Breaking it out of the prose
 * makes it quotable and gives the eye somewhere to land in a long read.
 */
export function StatCallout({
  value,
  label,
  source,
}: {
  value: string;
  label: string;
  source?: string;
}) {
  return (
    <div className="my-12 border-l-2 border-[#d18a5e]/40 pl-6">
      <div className="text-[44px] leading-none font-medium tracking-tight text-white mb-3">
        {value}
      </div>
      <div className="text-[16px] leading-relaxed text-white/60 max-w-[520px]">{label}</div>
      {source && <div className="mt-3 text-[12px] text-white/30">{source}</div>}
    </div>
  );
}