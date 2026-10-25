'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, useScroll, useTransform, useReducedMotion, useInView, AnimatePresence } from 'framer-motion';
import { MessageSquarePlus, Search, Book, Calendar, Plus, ArrowUp, Check } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { HERO, HERO_DEMO } from '../../lib/landing-data';
import { pillWhite, focusRing } from './forge-art';

const ease = [0.16, 1, 0.3, 1] as any;

/**
 * The hero is the page's one orchestrated moment: the headline arrives, then
 * the workspace rises out of molten light and settles flat as you scroll.
 * Inside it, Forge is shown working (typed, written, graded, scheduled) until
 * a real screen recording is dropped into HERO.recordingSrc.
 */
export default function HeroSection() {
  const { user } = useAppStore();
  const reduce = useReducedMotion();
  const frameRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({ target: frameRef, offset: ['start end', 'center center'] });
  const rotateX = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [22, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [0.88, 1]);

  const goToGrader = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById('try')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[900px] overflow-hidden">
        <video
          autoPlay loop muted playsInline preload="metadata"
          className="absolute left-1/2 top-[-120px] h-[1100px] w-[1100px] max-w-none -translate-x-1/2 object-cover opacity-35 mix-blend-screen"
          style={{ maskImage: 'radial-gradient(circle, black 25%, transparent 65%)', WebkitMaskImage: 'radial-gradient(circle, black 25%, transparent 65%)' }}
        >
          <source src="/assets/video4.mp4" type="video/mp4" />
        </video>
      </div>

      <div className="relative z-10 mx-auto max-w-[1240px] px-5 pt-40 text-center sm:px-8 sm:pt-52">
        <h1 className="mx-auto max-w-[1200px] text-[50px] font-semibold leading-[0.96] tracking-[-0.055em] text-white sm:text-[80px] lg:text-[100px] xl:text-[108px]">
          {HERO.headlineLines.map((line, i) => (
            <motion.span
              key={line}
              className="block"
              initial={reduce ? false : { opacity: 0, y: 28, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 1.1, delay: 0.1 + i * 0.12, ease }}
            >
              {line}
            </motion.span>
          ))}
        </h1>

        <motion.p
          className="mx-auto mt-8 max-w-[560px] text-[19px] leading-[1.5] text-white/60 sm:text-[22px]"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4, ease }}
        >
          {HERO.subheadline}
        </motion.p>

        <motion.div
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-5"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.55, ease }}
        >
          <Link href={user ? '/dashboard' : '/signup'} className={`${pillWhite} px-7 py-3.5 text-[16px]`}>
            {user ? 'Open your workspace' : HERO.ctaPrimary}
          </Link>
          <a href="#try" onClick={goToGrader} className={`rounded-full px-4 py-3 text-[16px] text-white/70 transition hover:text-white ${focusRing}`}>
            {HERO.ctaSecondary}
          </a>
        </motion.div>
      </div>

      <div ref={frameRef} className="relative mx-auto mt-20 max-w-[1240px] px-5 pb-16 sm:px-8" style={{ perspective: 1600 }}>
        {/* Molten light behind the workspace */}
        <div aria-hidden className="pointer-events-none absolute inset-x-[-12%] top-[-140px] bottom-[-60px]"
          style={{ maskImage: 'radial-gradient(62% 58% at 50% 42%, black 30%, transparent 78%)', WebkitMaskImage: 'radial-gradient(62% 58% at 50% 42%, black 30%, transparent 78%)' }}>
          <Image src="/assets/art/molten.jpg" alt="" fill sizes="100vw" className="object-cover" style={{ objectPosition: '50% 80%' }} priority />
        </div>
        <motion.div
          style={{ rotateX, scale, transformOrigin: '50% 100%' }}
          className="relative overflow-hidden rounded-[22px] border border-white/[0.1] bg-[#050505] shadow-[0_60px_140px_-30px_rgba(0,0,0,1)]"
        >
          {HERO.recordingSrc ? (
            <video src={HERO.recordingSrc} autoPlay loop muted playsInline className="block h-auto w-full" aria-label="Forge workspace demo" />
          ) : (
            <WorkspaceFilm />
          )}
        </motion.div>
      </div>
    </section>
  );
}

// ─── The coded demo ──────────────────────────────────────────────────────────

const LOOP = 15000;

function useClock(active: boolean) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0; const start = performance.now();
    const tick = (now: number) => { setT((now - start) % LOOP); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return t;
}

function WorkspaceFilm() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-10% 0px' });
  const reduce = useReducedMotion();
  const t = useClock(inView && !reduce);
  const time = reduce ? 13000 : t;

  const prompt = HERO_DEMO.prompt;
  const typed = Math.min(prompt.length, Math.floor(Math.max(0, time - 600) / 45));
  const sent = time > 3400;
  const fullResponse = HERO_DEMO.response.join('\n\n');
  const streamed = Math.min(fullResponse.length, Math.floor(Math.max(0, time - 4200) / 22));
  const graded = time > 9400;
  const scheduled = time > 11000;

  return (
    <div ref={ref} className="flex h-[440px] text-left sm:h-[640px]" aria-label="Forge writing, grading and scheduling a post" role="img">
      <div className="hidden w-[240px] shrink-0 flex-col border-r border-white/[0.05] bg-[#070707] md:flex">
        <div className="flex items-center gap-2.5 px-5 pt-5">
          <Image src="/logos/forge.svg" alt="" width={20} height={20} />
          <span className="text-[13px] font-semibold tracking-[0.16em] text-white/85">FORGE</span>
        </div>
        <div className="mt-5 space-y-1 px-3">
          <div className="flex items-center gap-3 rounded-lg bg-white/[0.06] px-3 py-2.5 text-[13px] text-white/90">
            <MessageSquarePlus className="h-4 w-4 text-white/60" /> New chat
          </div>
          {[[Search, 'Search'], [Book, 'Ebooks'], [Calendar, 'Calendar']].map(([Icon, label]: any) => (
            <div key={label} className="flex items-center gap-3 px-3 py-2.5 text-[13px] text-white/45">
              <Icon className="h-4 w-4" /> {label}
            </div>
          ))}
        </div>
        <div className="mt-6 px-6 text-[11.5px] text-white/30">Recent</div>
        <div className="mt-2 space-y-0.5 px-3">
          {['Launch thread for Thursday', 'Why we price per seat', 'Hiring carousel', 'Newsletter intro, issue 14'].map((r) => (
            <div key={r} className="truncate px-3 py-1.5 text-[12.5px] text-white/40">{r}</div>
          ))}
        </div>
        <div className="mt-auto p-3">
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
            <div className="text-[11.5px] text-white/40">Brand DNA</div>
            <div className="mt-1 text-[12.5px] text-white/80">Direct, specific, a little dry</div>
          </div>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col overflow-hidden bg-black">
        <AnimatePresence>
          {scheduled && (
            <motion.div
              initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease }}
              className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-[#111]/90 px-3.5 py-2 text-[12.5px] text-white/85 backdrop-blur"
            >
              <Calendar className="h-3.5 w-3.5 text-[#FFB067]" /> {HERO_DEMO.scheduled}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 space-y-5 overflow-hidden px-5 pt-16 sm:px-12 sm:pt-20">
          {sent && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }}
              className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-white/[0.08] px-4 py-2.5 text-[14px] text-white/90 sm:text-[15px]">
              {prompt}
            </motion.div>
          )}
          {time > 3900 && (
            <div className="flex gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
                <Image src="/logos/forge.svg" alt="" width={16} height={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-line text-[15px] leading-[1.6] text-white/90 sm:text-[17px]">
                  {fullResponse.slice(0, streamed)}
                  {streamed < fullResponse.length && <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] bg-white/80" />}
                </p>
                {graded && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}
                    className="mt-5 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] py-2 pl-2 pr-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-[#FFB067] to-[#E0570A] text-[13px] font-semibold text-black tabular-nums">
                      {HERO_DEMO.score}
                    </span>
                    <span className="text-[13px] text-white/70">
                      Stop-scroll score out of 50.
                      <span className="ml-1.5 inline-flex items-center gap-1 text-white"><Check className="h-3.5 w-3.5" />{HERO_DEMO.verdict}</span>
                    </span>
                  </motion.div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pb-6 sm:px-12 sm:pb-10">
          <div className="flex items-center gap-3">
            <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.03] sm:flex">
              <Plus className="h-5 w-5 text-white/50" />
            </div>
            <div className="relative flex h-12 flex-1 items-center rounded-full border border-white/[0.09] bg-white/[0.03] pl-5 pr-14">
              <span className={`truncate text-[14px] ${sent ? 'text-white/35' : 'text-white/85'}`}>
                {sent ? 'Ask Forge anything' : prompt.slice(0, typed)}
                {!sent && typed < prompt.length && <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] bg-white/80" />}
              </span>
              <div className={`absolute right-1.5 flex h-9 w-9 items-center justify-center rounded-full transition ${typed >= prompt.length && !sent ? 'bg-white text-black' : 'bg-white/10 text-white/50'}`}>
                <ArrowUp className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
