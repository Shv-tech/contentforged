'use client';

import { ARCHITECTURE_SECTION, ARCHITECTURE_PILLARS } from '../../lib/landing-data';
import { Artwork, Heading, Tag, Scene, sentence } from './forge-art';

const PILLAR_SCENES: Scene[] = ['forge', 'deep', 'tide'];
const PILLAR_DOTS = ['#FFB067', '#8FA2FF', '#B7E39A'];

export default function ArchitectureSection() {
  return (
    <section id="product" className="mx-auto max-w-[1240px] scroll-mt-24 px-5 sm:px-8">
      <Heading lines={ARCHITECTURE_SECTION.heading} lead={ARCHITECTURE_SECTION.subheading} />

      <div className="mt-16 grid gap-5 lg:grid-cols-3">
        {ARCHITECTURE_PILLARS.map((pillar, i) => (
          <article key={pillar.title} className="flex flex-col overflow-hidden rounded-[32px] bg-[#0E0E0E]">
            <Artwork scene={PILLAR_SCENES[i % 3]} className="aspect-[4/3]">
              <div className="absolute left-6 top-6">
                <Tag dot={PILLAR_DOTS[i % 3]}>{sentence(pillar.iconLabel)}</Tag>
              </div>
              <h3 className="absolute inset-x-6 bottom-6 text-[30px] font-semibold leading-[1.05] tracking-[-0.035em] text-white">
                {pillar.title}
              </h3>
            </Artwork>
            <div className="flex flex-1 flex-col p-7">
              <p className="text-[16px] leading-[1.65] text-white/60">{pillar.body}</p>
              <p className="mt-8 border-t border-white/[0.07] pt-5 text-[15px] font-medium text-white/85">{pillar.proofLine}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
