'use client';

import Image from 'next/image';
import { VOICE_SECTION } from '../../lib/landing-data';

/**
 * The one light section on the page. A change of ground in the middle of a
 * long dark scroll, and the clearest possible demonstration of the promise:
 * the same idea, written twice.
 */
export default function VoiceSection() {
  return (
    <section className="bg-[#F3F2EF] py-28 text-[#0B0B0C] sm:py-40">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <div className="max-w-[900px]">
          <h2 className="text-[44px] font-semibold leading-[0.98] tracking-[-0.05em] sm:text-[80px]">{VOICE_SECTION.heading}</h2>
          <p className="mt-6 max-w-[560px] text-[18px] leading-[1.55] text-black/55 sm:text-[20px]">{VOICE_SECTION.subheading}</p>
        </div>

        <div className="mt-16 grid gap-5 lg:grid-cols-2">
          <figure className="flex flex-col rounded-[32px] bg-white p-8 shadow-[0_1px_0_rgba(0,0,0,0.04)] sm:p-10">
            <figcaption className="text-[14px] text-black/45">{VOICE_SECTION.before.label}</figcaption>
            <blockquote className="mt-6 text-[22px] leading-[1.45] text-black/40 sm:text-[26px]">{VOICE_SECTION.before.text}</blockquote>
          </figure>
          <figure className="flex flex-col rounded-[32px] bg-[#0B0B0C] p-8 text-white sm:p-10">
            <figcaption className="flex items-center gap-2.5 text-[14px] text-white/60">
              <Image src="/logos/forge.svg" alt="" width={18} height={18} />
              {VOICE_SECTION.after.label}
            </figcaption>
            <blockquote className="mt-6 text-[22px] font-medium leading-[1.45] tracking-[-0.01em] sm:text-[26px]">{VOICE_SECTION.after.text}</blockquote>
          </figure>
        </div>
      </div>
    </section>
  );
}
