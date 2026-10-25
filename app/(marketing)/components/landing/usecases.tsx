'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { USE_CASES_SECTION, USE_CASES, UseCaseTab } from '../../lib/landing-data';
import { Plate, PlateName, Heading, focusRing } from './forge-art';

const PLATE_FOR: Record<string, PlateName> = { creators: 'ingot', ghostwriters: 'quench', founders: 'molten', enterprise: 'steel' };

export default function UseCases() {
  const [activeId, setActiveId] = useState<string>(USE_CASES[0].id);
  const active = USE_CASES.find((t) => t.id === activeId) as UseCaseTab;
  const reduce = useReducedMotion();

  return (
    <section className="mx-auto max-w-[1240px] px-5 sm:px-8">
      <Heading lines={USE_CASES_SECTION.heading} />

      <div role="tablist" aria-label="Who it's for" className="mt-12 flex flex-wrap gap-2">
        {USE_CASES.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeId}
            onClick={() => setActiveId(tab.id)}
            className={`relative rounded-full px-4 py-2 text-[14px] transition-colors ${tab.id === activeId ? 'text-black' : 'text-white/60 hover:text-white'} ${focusRing}`}
          >
            {tab.id === activeId && <motion.span layoutId="usecase-pill" className="absolute inset-0 rounded-full bg-white" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            <span className="relative">{tab.audience}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={active.id}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? undefined : { opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="mt-8 grid overflow-hidden rounded-[36px] bg-[#0E0E0E] lg:grid-cols-[1.1fr_0.9fr]"
        >
          <Plate name={PLATE_FOR[active.id] ?? 'slag'} className="flex min-h-[380px] items-end p-8 sm:p-12" sizes="(max-width: 1024px) 100vw, 55vw">
            <h3 className="relative max-w-[560px] text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] text-white sm:text-[40px]">
              {active.headline}
            </h3>
          </Plate>
          <div className="p-8 sm:p-12">
            <p className="text-[17px] leading-[1.65] text-white/65">{active.body}</p>
            <ul className="mt-8 space-y-4 border-t border-white/[0.07] pt-8">
              {active.features.map((f) => (
                <li key={f} className="flex gap-3 text-[16px] leading-snug text-white/80">
                  <Check className="mt-0.5 h-[18px] w-[18px] shrink-0 text-white" strokeWidth={2.25} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
