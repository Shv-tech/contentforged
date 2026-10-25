'use client';

import { useEffect, useState } from 'react';
import { FOUNDER_NOTE } from '../../lib/landing-data';
import { Plate, pillWhite, pillGhost, focusRing } from './forge-art';

/**
 * Real proof instead of testimonials: the public challenge, counting down
 * live, and a note from the person running it.
 *
 * Pass `signups` once you have a real count wired in; until then the section
 * shows only the clock, which is always true.
 */
const START = new Date('2026-10-21T00:00:00+05:30').getTime();
const DEADLINE = new Date('2026-11-19T23:59:00+05:30').getTime();
const GOAL = 30000;

function remaining(now: number) {
  const ms = Math.max(0, DEADLINE - now);
  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms % 86_400_000) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
    day: Math.min(30, Math.max(1, Math.floor((now - START) / 86_400_000) + 1)),
  };
}

export default function BuildInPublic({ signups }: { signups?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (now > DEADLINE + 7 * 86_400_000) return null; // retire a week after the deadline
  const r = remaining(now);
  const over = now >= DEADLINE;

  return (
    <section className="mx-auto max-w-[1240px] px-5 sm:px-8">
      <Plate name="molten" className="rounded-[40px] px-7 py-14 sm:px-14 sm:py-20" sizes="100vw" position="50% 85%">
        <div className="relative max-w-[780px]">
          <p className="text-[15px] text-white/75">Day {r.day} of 30, in public</p>
          <h2 className="mt-4 text-[40px] font-semibold leading-[1.0] tracking-[-0.05em] text-white sm:text-[72px]">
            30,000 signups by November 19, or we shut Forge down.
          </h2>
          <p className="mt-6 max-w-[540px] text-[18px] leading-[1.55] text-white/80">
            No made-up numbers and no extensions. The real count is posted every day, good days and bad.
          </p>
        </div>

        <div className="relative mt-14 flex flex-wrap items-end gap-x-7 gap-y-8 sm:gap-x-12">
          {over ? (
            <Stat value="0" label="time left" />
          ) : (
            <>
              <Stat value={String(r.days)} label={r.days === 1 ? 'day' : 'days'} />
              <Stat value={String(r.hours).padStart(2, '0')} label="hours" />
              <Stat value={String(r.minutes).padStart(2, '0')} label="minutes" />
            </>
          )}
          {typeof signups === 'number' && <Stat value={signups.toLocaleString()} label={`of ${GOAL.toLocaleString()} signups`} />}
        </div>

        <div className="relative mt-14 flex flex-col gap-3 sm:flex-row">
          <a href="/signup" className={pillWhite}>Be one of the 30,000</a>
          <a href="https://x.com/forgeyourway" target="_blank" rel="noopener noreferrer" className={`${pillGhost} border-white/30 bg-black/25 backdrop-blur-md`}>
            Follow the count on X
          </a>
        </div>
      </Plate>

      <figure className="mx-auto mt-24 max-w-[820px] text-center">
        <blockquote className="text-[26px] font-medium leading-[1.4] tracking-[-0.02em] text-white sm:text-[34px]">
          “{FOUNDER_NOTE.text}”
        </blockquote>
        <figcaption className="mt-8 text-[15px] text-white/50">
          <a href={FOUNDER_NOTE.handle} target="_blank" rel="noopener noreferrer" className={`rounded-sm hover:text-white ${focusRing}`}>{FOUNDER_NOTE.signature}</a>
        </figcaption>
      </figure>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-[52px] font-semibold leading-none tracking-[-0.05em] tabular-nums text-white sm:text-[104px]">{value}</div>
      <div className="mt-2 text-[15px] text-white/75">{label}</div>
    </div>
  );
}
