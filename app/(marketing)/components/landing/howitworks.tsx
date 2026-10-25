'use client';

import { HOW_IT_WORKS_SECTION, HOW_IT_WORKS_STEPS } from '../../lib/landing-data';
import { Heading } from './forge-art';

/** Three real steps in order, so they are numbered and joined by one line. */
export default function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-[1240px] scroll-mt-24 px-5 sm:px-8">
      <Heading lines={HOW_IT_WORKS_SECTION.heading} />

      <ol className="relative mt-16 grid gap-12 lg:grid-cols-3 lg:gap-8">
        <div aria-hidden className="absolute left-0 right-0 top-[44px] hidden h-px bg-gradient-to-r from-[#FF8A2B]/70 via-white/15 to-white/5 lg:block" />
        {HOW_IT_WORKS_STEPS.map((step, i) => (
          <li key={step.number} className="relative">
            <div className="relative flex h-[88px] w-[88px] items-center justify-center rounded-full border border-white/10 bg-black text-[34px] font-semibold tracking-[-0.04em] text-white">
              {i + 1}
            </div>
            <h3 className="mt-8 text-[26px] font-semibold tracking-[-0.03em] text-white">{step.title}</h3>
            <p className="mt-3 text-[16px] leading-[1.65] text-white/55">{step.body}</p>
            <p className="mt-6 text-[15px] font-medium text-white/85">{step.timeLabel}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
