'use client';

import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { FINAL_CTA } from '../../lib/landing-data';
import { Plate, pillWhite } from './forge-art';
import { SiteFooter } from '../site-chrome';

export default function FinalCTA() {
  const { user } = useAppStore();

  return (
    <>
      <section className="mx-auto mt-40 max-w-[1240px] px-5 sm:mt-56 sm:px-8">
        <Plate name="molten" className="flex min-h-[640px] flex-col items-center justify-center rounded-[44px] px-6 py-24 text-center" sizes="100vw" position="50% 80%">
          <h2 className="relative max-w-[900px] text-[48px] font-semibold leading-[0.98] tracking-[-0.05em] text-white sm:text-[88px]">
            {FINAL_CTA.heading.map((l, i) => (
              <span key={i} className="block">{l}</span>
            ))}
          </h2>
          <p className="relative mt-8 max-w-[600px] text-[18px] leading-[1.55] text-white/75 sm:text-[20px]">{FINAL_CTA.subheading}</p>
          <Link href={user ? '/dashboard' : '/signup'} className={`${pillWhite} relative mt-12 px-8 py-4 text-[17px]`}>
            {user ? 'Open your workspace' : FINAL_CTA.ctaPrimary}
          </Link>
        </Plate>
      </section>

      <SiteFooter />
    </>
  );
}
