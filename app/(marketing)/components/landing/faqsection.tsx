'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { FAQ_SECTION, FAQS } from '../../lib/landing-data';
import { focusRing } from './forge-art';

const ease = [0.16, 1, 0.3, 1] as any;

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const reduce = useReducedMotion();
  const toggle = (i: number) => setOpenIndex((prev) => (prev === i ? null : i));

  return (
    <section className="mx-auto grid max-w-[1240px] gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
      <div className="lg:sticky lg:top-28 lg:self-start">
        <h2 className="text-[40px] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-[56px]">
          {FAQ_SECTION.heading.map((l, i) => (
            <span key={i} className={`block ${i > 0 ? 'text-white/40' : ''}`}>{l}</span>
          ))}
        </h2>
        <p className="mt-6 text-[16px] text-white/50">
          Something else? <a href="mailto:support@forgeyourway.dev" className={`rounded-sm text-white underline decoration-white/30 underline-offset-4 hover:decoration-white ${focusRing}`}>support@forgeyourway.dev</a>
        </p>
      </div>

      <div className="border-t border-white/[0.08]">
        {FAQS.map((item, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={item.q} className="border-b border-white/[0.08]">
              <button
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
                className={`flex w-full items-start justify-between gap-8 rounded-sm py-7 text-left ${focusRing}`}
              >
                <span className={`text-[19px] leading-snug tracking-[-0.01em] transition-colors ${isOpen ? 'text-white' : 'text-white/70 hover:text-white'}`}>
                  {item.q}
                </span>
                <motion.span animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.4, ease }} className="mt-1 shrink-0">
                  <Plus className={`h-5 w-5 ${isOpen ? 'text-white' : 'text-white/40'}`} strokeWidth={1.75} />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={reduce ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={reduce ? undefined : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.45, ease }}
                    className="overflow-hidden"
                  >
                    <p className="max-w-[680px] pb-8 pr-10 text-[16px] leading-[1.7] text-white/55">{item.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}
