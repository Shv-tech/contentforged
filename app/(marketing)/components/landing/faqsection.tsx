'use client';

import { useState } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { Plus } from 'lucide-react';
import { FAQ_SECTION, FAQS } from '../../lib/landing-data';

const customEase = [0.16, 1, 0.3, 1] as any;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 1, ease: customEase } },
};

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (i: number) => setOpenIndex((prev) => (prev === i ? null : i));

  return (
    <section className="py-40 bg-[#000000] border-t border-white/[0.02] relative">
      <div className="max-w-[800px] mx-auto px-6">
        
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          className="text-center mb-24"
        >
          <motion.div variants={fadeUp} className="text-white/40 text-[11px] font-mono tracking-[0.25em] uppercase font-bold mb-8 flex items-center justify-center gap-4">
            <span className="w-8 h-[1px] bg-white/20" />
            {FAQ_SECTION.eyebrow}
            <span className="w-8 h-[1px] bg-white/20" />
          </motion.div>
          <motion.h2 variants={fadeUp} className="font-medium text-[44px] md:text-[56px] tracking-[-0.04em] leading-[1.05] text-white/95">
            <span className="block">{FAQ_SECTION.heading[0]}</span>
            <span className="block text-white/30">{FAQ_SECTION.heading[1]}</span>
          </motion.h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          className="flex flex-col"
        >
          {FAQS.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <motion.div key={item.q} variants={fadeUp} className="border-b border-white/[0.04] last:border-0 relative">
                <button
                  onClick={() => toggle(i)}
                  aria-expanded={isOpen}
                  className="w-full flex items-start justify-between gap-8 py-8 text-left group focus-visible:outline-none"
                >
                  <span
                    className={`text-[18px] tracking-[-0.01em] transition-colors duration-500 font-light ${
                      isOpen ? 'text-white/95' : 'text-white/40 group-hover:text-white/70'
                    }`}
                  >
                    {item.q}
                  </span>
                  <motion.div
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={{ duration: 0.5, ease: customEase }}
                    className="shrink-0 mt-1"
                  >
                    <Plus className={`w-5 h-5 transition-colors duration-500 ${isOpen ? 'text-[#d18a5e]' : 'text-white/20 group-hover:text-white/50'}`} strokeWidth={1.5} />
                  </motion.div>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.6, ease: customEase }}
                      className="overflow-hidden"
                    >
                      <p className="text-[15px] text-white/40 leading-[1.7] font-light pb-10 pr-12 max-w-[700px]">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}