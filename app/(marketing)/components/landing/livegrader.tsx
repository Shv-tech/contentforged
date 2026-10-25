'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Loader2, ArrowUp } from 'lucide-react';
import { LIVE_GRADER, GRADER_DEMO } from '../../lib/landing-data';
import { Heading, Plate, focusRing, pillWhite } from './forge-art';

const ease = [0.16, 1, 0.3, 1] as any;

interface GradeResult {
  score: number;
  verdict: string;
  weakest?: string;
  rewrite?: string;
  breakdown?: { label: string; score: number }[];
}

type State =
  | { kind: 'example' }
  | { kind: 'loading' }
  | { kind: 'result'; hook: string; result: GradeResult }
  | { kind: 'limit' }
  | { kind: 'error' };

const EXAMPLE: GradeResult = {
  score: GRADER_DEMO.scores.reduce((sum, s) => sum + parseFloat(s.score), 0),
  verdict: GRADER_DEMO.verdict,
  breakdown: GRADER_DEMO.scores.map((s) => ({ label: s.label, score: parseFloat(s.score) })),
};

/**
 * The product, on the landing page, for real. Visitors paste a hook and get
 * an actual grade from the API in LIVE_GRADER.endpoint. Until that route is
 * wired, failures fall back to the free hook tool instead of a dead end.
 */
export default function LiveGrader() {
  const [hook, setHook] = useState('');
  const [state, setState] = useState<State>({ kind: 'example' });

  const grade = async () => {
    const text = hook.trim();
    if (!text || state.kind === 'loading') return;
    setState({ kind: 'loading' });
    try {
      const res = await fetch(LIVE_GRADER.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hook: text.slice(0, 500) }),
      });
      if (res.status === 429) return setState({ kind: 'limit' });
      if (!res.ok) return setState({ kind: 'error' });
      const result: GradeResult = await res.json();
      if (typeof result.score !== 'number') return setState({ kind: 'error' });
      setState({ kind: 'result', hook: text, result });
    } catch {
      setState({ kind: 'error' });
    }
  };

  const shownHook = state.kind === 'result' ? state.hook : GRADER_DEMO.hookText;
  const shownResult = state.kind === 'result' ? state.result : EXAMPLE;
  const isExample = state.kind !== 'result';

  return (
    <section id="try" className="mx-auto max-w-[1240px] scroll-mt-24 px-5 sm:px-8">
      <Heading lines={LIVE_GRADER.heading} lead={LIVE_GRADER.subheading} />

      <form
        onSubmit={(e) => { e.preventDefault(); grade(); }}
        className="mt-12 flex items-end gap-3 rounded-[28px] border border-white/10 bg-[#0E0E0E] p-3 pl-6 focus-within:border-white/25"
      >
        <label htmlFor="hook" className="sr-only">Your hook</label>
        <textarea
          id="hook" rows={1} value={hook} maxLength={500}
          onChange={(e) => setHook(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); grade(); } }}
          placeholder={LIVE_GRADER.placeholder}
          className="min-h-[52px] flex-1 resize-none bg-transparent py-3.5 text-[18px] leading-snug text-white placeholder:text-white/35 outline-none [field-sizing:content] sm:text-[20px]"
        />
        <button type="submit" disabled={!hook.trim() || state.kind === 'loading'} className={`${pillWhite} shrink-0 !py-3.5`}>
          {state.kind === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span className="hidden sm:inline">{LIVE_GRADER.cta}</span><ArrowUp className="h-4 w-4 sm:hidden" /></>}
        </button>
      </form>

      <AnimatePresence mode="wait">
        {state.kind === 'limit' || state.kind === 'error' ? (
          <motion.div key="notice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="mt-5 rounded-[24px] border border-white/10 bg-[#0E0E0E] px-6 py-5 text-[16px] leading-relaxed text-white/75">
            {state.kind === 'limit'
              ? <>That’s the free limit for now. <Link href="/signup" className="text-white underline underline-offset-4">Create a free account</Link> to keep grading.</>
              : <>The grader is busy right now. <Link href={LIVE_GRADER.fallbackHref} className="text-white underline underline-offset-4">Try the free hook tool</Link> instead, no account needed.</>}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <ResultCard hook={shownHook} result={shownResult} isExample={isExample} loading={state.kind === 'loading'} />
    </section>
  );
}

function ResultCard({ hook, result, isExample, loading }: { hook: string; result: GradeResult; isExample: boolean; loading: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={hook}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: loading ? 0.4 : 1, y: 0 }}
      transition={{ duration: 0.5, ease }}
      className="mt-5 grid overflow-hidden rounded-[36px] bg-[#0E0E0E] lg:grid-cols-[1.05fr_0.95fr]"
    >
      <Plate name="molten" className="flex min-h-[340px] flex-col justify-between p-8 sm:p-10" sizes="(max-width: 1024px) 100vw, 55vw">
        <span className="relative self-start rounded-full bg-black/40 px-3 py-1.5 text-[13px] text-white/85 backdrop-blur-md">
          {isExample ? 'Example' : 'Your hook'}
        </span>
        <p className="relative mt-10 text-[24px] font-semibold leading-[1.22] tracking-[-0.025em] text-white sm:text-[30px]">“{hook}”</p>
      </Plate>

      <div className="flex flex-col p-8 sm:p-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[14px] text-white/45">Stop-scroll score</div>
            <div className="mt-1 text-[76px] font-semibold leading-none tracking-[-0.05em] tabular-nums">
              {Math.round(result.score * 10) / 10}<span className="text-[28px] text-white/35">/50</span>
            </div>
          </div>
          <span className="mb-2 rounded-full bg-white px-4 py-1.5 text-[14px] font-semibold text-black">{result.verdict}</span>
        </div>

        {result.breakdown && (
          <div className="mt-9 space-y-4">
            {result.breakdown.map((b, i) => (
              <div key={b.label}>
                <div className="mb-2 flex justify-between text-[14px]">
                  <span className="text-white/60">{b.label}</span>
                  <span className="tabular-nums text-white">{b.score}/10</span>
                </div>
                <div className="h-[3px] overflow-hidden rounded-full bg-white/[0.08]">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-[#FF8A2B] to-[#FFD3A1]"
                    initial={reduce ? false : { width: 0 }}
                    whileInView={{ width: `${Math.min(100, b.score * 10)}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.9, delay: 0.1 + i * 0.08, ease }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {result.weakest && (
          <div className="mt-8 border-t border-white/[0.07] pt-6">
            <div className="text-[14px] text-white/45">Weakest part</div>
            <p className="mt-1 text-[16px] text-white/85">{result.weakest}</p>
          </div>
        )}
        {result.rewrite && (
          <div className="mt-5">
            <div className="text-[14px] text-white/45">Try this instead</div>
            <p className="mt-1 text-[17px] font-medium leading-snug text-white">{result.rewrite}</p>
          </div>
        )}
        {isExample && <p className="mt-auto pt-8 text-[14px] leading-relaxed text-white/45">{GRADER_DEMO.caption}</p>}
      </div>
    </motion.div>
  );
}
