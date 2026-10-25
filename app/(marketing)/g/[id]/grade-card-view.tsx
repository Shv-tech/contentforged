'use client';

/**
 * A shared hook grade. The page someone lands on from "my hook scored
 * 44/50": the line, its score, the five dimensions, and a way to grade
 * their own.
 */

import Link from 'next/link';
import type { GradeCard } from '@/lib/forge/grade-cards';
import { Plate, pillGhost, pillWhite } from '../../components/landing/forge-art';
import { SiteFooter, SiteNav } from '../../components/site-chrome';

function plateFor(score: number): 'molten' | 'ingot' | 'steel' {
  if (score >= 40) return 'molten';
  if (score >= 30) return 'ingot';
  return 'steel';
}

export function GradeCardView({ card }: { card: GradeCard }) {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-black font-sans text-white antialiased">
      <SiteNav links={[{ label: 'Grade yours', href: '/#try' }, { label: 'Free audit', href: '/audit' }]} />

      <section className="mx-auto max-w-[1040px] px-5 pt-28 sm:px-8 sm:pt-32">
        <Plate name={plateFor(card.score)} className="flex min-h-[480px] flex-col justify-end rounded-[40px] px-6 py-12 sm:px-12" sizes="100vw" position="50% 60%">
          <div className="relative">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/70">Stop-Scroll Grade</p>
            <div className="mt-4 flex items-end gap-3">
              <span className="text-[96px] font-semibold leading-none tracking-[-0.05em] tabular-nums sm:text-[128px]">{card.score}</span>
              <span className="pb-3 text-[24px] font-medium text-white/60 sm:pb-5">/50</span>
            </div>
            <p className="mt-2 text-[18px] font-medium text-white/85">{card.verdict}</p>
            <blockquote className="mt-8 max-w-[760px] border-l-2 border-white/40 pl-5 text-[20px] leading-snug text-white sm:text-[24px]">
              {card.hook}
            </blockquote>
          </div>
        </Plate>

        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-5">
          {card.breakdown.map((dimension) => (
            <li key={dimension.key} className="rounded-[20px] border border-white/[0.07] bg-[#0B0B0B] p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-white/60">{dimension.label}</span>
                <span className="text-[17px] font-semibold tabular-nums">{dimension.score}</span>
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-[#E0570A] to-[#FFB067]" style={{ width: `${dimension.score * 10}%` }} />
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-12 flex flex-col items-start gap-4 rounded-[32px] border border-white/[0.07] bg-[#0B0B0B] p-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[24px] font-semibold tracking-[-0.02em]">How does yours score?</h2>
            <p className="mt-2 max-w-[520px] text-[15px] leading-relaxed text-white/55">
              Paste your opening line. The same grader scores it on pattern interrupt, curiosity, emotion, specificity and shareability, and tells you the one fix.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link href="/#try" className={`${pillWhite} px-6 py-3`}>
              Grade my hook
            </Link>
            <Link href="/methodology" className={`${pillGhost} px-6 py-3`}>
              How it works
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
