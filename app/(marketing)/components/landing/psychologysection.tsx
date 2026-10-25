'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { PSYCHOLOGY_SECTION, PSYCHOLOGY_MECHANISMS, GRADER_DEMO } from '../../lib/landing-data';
import { Artwork, Heading, Tag, sentence } from './forge-art';

const ease = [0.16, 1, 0.3, 1] as any;

/**
 * A working demonstration, not a screenshot: when the card scrolls into view
 * the hook is typed out, graded line by line, and the verdict lands last.
 */
export default function PsychologySection() {
  return (
    <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
      <Heading lines={[PSYCHOLOGY_SECTION.heading]} lead={PSYCHOLOGY_SECTION.subheading} align="center" />
      <GraderDemo />
      <Mechanisms />
    </div>
  );
}

function GraderDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-20% 0px' });
  const reduce = useReducedMotion();
  const full = GRADER_DEMO.hookText;
  const [typed, setTyped] = useState(reduce ? full.length : 0);
  const done = typed >= full.length;

  useEffect(() => {
    if (!inView || reduce || done) return;
    const id = setInterval(() => setTyped((n) => Math.min(full.length, n + 2)), 28);
    return () => clearInterval(id);
  }, [inView, reduce, done, full.length]);

  // "44/50" in the caption is the real total; derive the headline number from the scores.
  const total = GRADER_DEMO.scores.reduce((sum, s) => sum + parseFloat(s.score), 0);

  return (
    <div ref={ref} className="mt-16 overflow-hidden rounded-[36px] bg-[#0E0E0E] lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <Artwork scene="ember" className="flex min-h-[360px] flex-col justify-between p-8 sm:p-10">
        <div className="self-start"><Tag dot="#FFB067">{sentence(GRADER_DEMO.cardLabel.split('·')[0].trim())}</Tag></div>
        <p className="mt-10 text-[26px] font-semibold leading-[1.22] tracking-[-0.025em] text-white sm:text-[32px]">
          “{full.slice(0, typed)}
          {!done && <span className="ml-0.5 inline-block h-[0.9em] w-[3px] translate-y-[0.12em] animate-pulse bg-white" />}
          {done && '”'}
        </p>
        <div className="mt-10 text-[14px] text-white/60">{sentence(GRADER_DEMO.badge)}</div>
      </Artwork>

      <div className="flex flex-col p-8 sm:p-10">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[14px] text-white/45">Stop-scroll score</div>
            <div className="mt-1 text-[72px] font-semibold leading-none tracking-[-0.05em] tabular-nums">
              {done ? Math.round(total * 10) / 10 : '—'}
              <span className="text-[28px] text-white/35">/50</span>
            </div>
          </div>
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={done ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.6, delay: 1.1, ease }}
            className="mb-2 rounded-full bg-white px-4 py-1.5 text-[14px] font-semibold text-black"
          >
            {sentence(GRADER_DEMO.verdict)}
          </motion.span>
        </div>

        <div className="mt-10 space-y-5">
          {GRADER_DEMO.scores.map((s, i) => (
            <div key={s.label}>
              <div className="mb-2 flex justify-between text-[14px]">
                <span className="text-white/60">{s.label}</span>
                <span className="tabular-nums text-white">{s.score}</span>
              </div>
              <div className="h-[3px] overflow-hidden rounded-full bg-white/[0.08]">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[#FF8A2B] to-[#FFD3A1]"
                  initial={{ width: 0 }}
                  animate={done ? { width: s.width } : {}}
                  transition={{ duration: 1, delay: 0.1 + i * 0.12, ease }}
                />
              </div>
            </div>
          ))}
        </div>

        <p className="mt-auto pt-10 text-[14px] leading-relaxed text-white/45">{GRADER_DEMO.caption}</p>
      </div>
    </div>
  );
}

function Mechanisms() {
  return (
    <div className="mt-24">
      <h3 className="max-w-[640px] text-[28px] font-semibold leading-tight tracking-[-0.03em] sm:text-[34px]">
        The nine mechanisms it writes with, named in every draft.
      </h3>
      <div className="mt-10 grid gap-px overflow-hidden rounded-[28px] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-3">
        {PSYCHOLOGY_MECHANISMS.map((m) => (
          <div key={m.name} className="bg-black p-7">
            <div className="text-[17px] font-semibold text-white">{m.name}</div>
            <p className="mt-2 text-[15px] leading-[1.6] text-white/50">{m.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
