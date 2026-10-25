'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Plus, Minus } from 'lucide-react';
import { TOOL_ARSENAL_SECTION, TOOL_CATEGORIES, FEATURED_TOOLS } from '../../lib/landing-data';
import { Heading, Plate, PlateName, focusRing } from './forge-art';

const ALL = TOOL_CATEGORIES.flatMap((c) => c.tools.map((t) => ({ ...t, category: c.name })));
const FEATURED = FEATURED_TOOLS.map((n) => ALL.find((t) => t.number === n)!).filter(Boolean);
const PLATE_ORDER: PlateName[] = ['molten', 'sparks', 'ingot', 'quench', 'steel', 'slag'];

/** Six tools carry the section; the full list is one click away, not a carousel to dig through. */
export default function ToolArsenal() {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  return (
    <section id="tools" className="mx-auto max-w-[1240px] scroll-mt-24 px-5 sm:px-8">
      <Heading lines={TOOL_ARSENAL_SECTION.heading} lead={TOOL_ARSENAL_SECTION.subheading} />

      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURED.map((tool, i) => (
          <article key={tool.number} className="flex flex-col overflow-hidden rounded-[28px] bg-[#0E0E0E]">
            <Plate name={PLATE_ORDER[i % PLATE_ORDER.length]} className="h-[150px]" sizes="(max-width: 640px) 100vw, 33vw" position={`${20 + i * 12}% 60%`}>
              <span className="absolute bottom-4 left-5 text-[13px] text-white/80">{tool.category}</span>
            </Plate>
            <div className="p-6">
              <h3 className="text-[21px] font-semibold tracking-[-0.025em] text-white">{tool.name}</h3>
              <p className="mt-2 text-[16px] leading-[1.55] text-white/60">{tool.description}</p>
            </div>
          </article>
        ))}
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`mt-8 inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-[15px] text-white transition hover:bg-white/[0.04] ${focusRing}`}
      >
        {open ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {open ? 'Show fewer' : `See all ${ALL.length} tools`}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="grid gap-x-10 gap-y-12 pt-12 sm:grid-cols-2 lg:grid-cols-4">
              {TOOL_CATEGORIES.map((cat) => (
                <div key={cat.name}>
                  <h3 className="text-[15px] font-semibold text-white">{cat.name}</h3>
                  <ul className="mt-4 space-y-4">
                    {cat.tools.map((t) => (
                      <li key={t.number}>
                        <div className="text-[15px] text-white/90">{t.name}</div>
                        <div className="mt-0.5 text-[14px] leading-snug text-white/45">{t.description}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
