// components/blog/BlogBlocks.tsx

'use client';

import { useEffect, useRef, useState } from 'react';
import type { Block, ChartBlock } from '@/lib/blog/posts';

/**
 * Animated bar chart, built from divs rather than a charting library.
 *
 * Recharts and friends add well over 100KB to a page whose job is to be
 * crawled and read. These charts are a label, a bar and a number, which CSS
 * transitions handle exactly as well, and the text stays in the DOM where a
 * crawler can read it. A canvas-based chart is invisible to search engines.
 */
function Chart({ block }: { block: ChartBlock }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Animates on scroll into view rather than on mount. A chart that has
    // already finished animating before the reader reaches it may as well be
    // static, and animating everything at once on load is just jitter.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const max = block.max ?? Math.max(...block.series.map((s) => s.value)) * 1.1;

  return (
    <figure ref={ref} className="my-12">
      <figcaption className="mb-6">
        <h3 className="text-[15px] font-semibold text-white/90 tracking-[-0.01em] mb-1">
          {block.title}
        </h3>
      </figcaption>

      <div className="space-y-5">
        {block.series.map((s, i) => {
          const pct = Math.min(100, (s.value / max) * 100);
          return (
            <div key={s.label}>
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-[13px] text-white/50 font-light">{s.label}</span>
                <span
                  className="text-[15px] font-medium tabular-nums"
                  style={{ color: s.color ?? 'rgba(255,255,255,0.85)' }}
                >
                  {s.value}
                  {block.unit ?? ''}
                </span>
              </div>
              <div className="h-[6px] w-full bg-white/[0.04] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: visible ? `${pct}%` : '0%',
                    backgroundColor: s.color ?? 'rgba(255,255,255,0.35)',
                    // Staggered so the bars read as a sequence rather than a
                    // single block expanding. 700ms is slow enough to notice
                    // and fast enough not to be waiting for it.
                    transition: `width 700ms cubic-bezier(0.16,1,0.3,1) ${i * 90}ms`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {block.takeaway && (
        <p className="mt-6 text-[14px] leading-[1.7] text-white/60 font-light border-l border-white/10 pl-4">
          {block.takeaway}
        </p>
      )}

      {/* Source under every chart, always. A number without a source is a
          claim, and this post is specifically about not doing that. */}
      <p className="mt-4 text-[11px] leading-[1.6] text-white/25 font-light">
        Source:{' '}
        {block.sourceUrl ? (
          <a
            href={block.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-white/15 hover:decoration-white/40 hover:text-white/40 transition-colors"
          >
            {block.source}
          </a>
        ) : (
          block.source
        )}
      </p>
    </figure>
  );
}

export function BlogBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'heading':
            return (
              <h2
                key={i}
                id={block.id}
                className="text-[24px] md:text-[28px] font-medium text-white/95 tracking-[-0.02em] leading-[1.25] mt-16 mb-6 scroll-mt-24"
              >
                {block.text}
              </h2>
            );

          case 'prose':
            return (
              <div
                key={i}
                className="blog-prose text-[17px] leading-[1.75] text-white/60 font-light [&>p]:mb-6 [&_strong]:text-white/90 [&_strong]:font-medium [&_a]:text-white/80 [&_a]:underline [&_a]:decoration-white/20 hover:[&_a]:decoration-white/50"
                dangerouslySetInnerHTML={{ __html: block.html }}
              />
            );

          case 'chart':
            return <Chart key={i} block={block} />;

          case 'quote':
            return (
              <blockquote key={i} className="my-10 border-l-2 border-[#d18a5e]/40 pl-6">
                <p className="text-[19px] leading-[1.6] text-white/85 font-light tracking-[-0.01em] mb-3">
                  {block.text}
                </p>
                <cite className="text-[13px] text-white/35 not-italic font-light">
                  {block.url ? (
                    <a
                      href={block.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-white/15 hover:text-white/60"
                    >
                      {block.attribution}
                    </a>
                  ) : (
                    block.attribution
                  )}
                </cite>
              </blockquote>
            );

          case 'code':
            return (
              <figure key={i} className="my-10">
                <pre className="bg-[#0a0a0a] border border-white/[0.06] rounded-xl p-6 overflow-x-auto">
                  <code className="text-[13px] leading-[1.75] text-white/70 font-mono whitespace-pre">
                    {block.code}
                  </code>
                </pre>
                {block.caption && (
                  <figcaption className="mt-3 text-[12px] text-white/30 font-light">
                    {block.caption}
                  </figcaption>
                )}
              </figure>
            );

          case 'callout':
            return (
              <aside
                key={i}
                className={`my-10 rounded-xl border p-6 ${
                  block.tone === 'warning'
                    ? 'border-[#d18a5e]/20 bg-[#d18a5e]/[0.03]'
                    : 'border-white/[0.06] bg-white/[0.015]'
                }`}
              >
                <h4
                  className={`text-[12px] font-semibold uppercase tracking-[0.12em] mb-3 ${
                    block.tone === 'warning' ? 'text-[#d18a5e]/80' : 'text-white/40'
                  }`}
                >
                  {block.title}
                </h4>
                <div
                  className="text-[15px] leading-[1.7] text-white/55 font-light [&>p]:mb-3 [&>p:last-child]:mb-0"
                  dangerouslySetInnerHTML={{ __html: block.html }}
                />
              </aside>
            );

          default:
            return null;
        }
      })}
    </>
  );
}