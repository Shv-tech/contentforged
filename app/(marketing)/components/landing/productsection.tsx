'use client';

import { PRODUCT_SECTION, PILLARS } from '../../lib/landing-data';
import { Heading, Plate, PlateName, Tag } from './forge-art';

const PLATES: PlateName[] = ['steel', 'sparks', 'quench'];

/** The problem and the answer in one place: what other tools do, and what Forge does instead. */
export default function ProductSection() {
  return (
    <section id="product" className="mx-auto max-w-[1240px] scroll-mt-24 px-5 sm:px-8">
      <Heading lines={PRODUCT_SECTION.heading} lead={PRODUCT_SECTION.subheading} />

      <div className="mt-16 grid gap-5 lg:grid-cols-3">
        {PILLARS.map((p, i) => (
          <article key={p.title} className="flex flex-col overflow-hidden rounded-[32px] bg-[#0E0E0E]">
            <Plate name={PLATES[i % 3]} className="aspect-[4/3]" sizes="(max-width: 1024px) 100vw, 33vw">
              <div className="absolute left-6 top-6"><Tag dot="#FFB067">{p.label}</Tag></div>
              <h3 className="absolute inset-x-6 bottom-6 text-[34px] font-semibold leading-[1.02] tracking-[-0.04em] text-white">
                {p.title}
              </h3>
            </Plate>
            <div className="flex flex-1 flex-col p-7">
              <p className="text-[15px] text-white/40 line-through decoration-white/25">{p.instead}</p>
              <p className="mt-4 text-[17px] leading-[1.6] text-white/70">{p.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
