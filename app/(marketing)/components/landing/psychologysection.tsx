'use client';

import { motion, useReducedMotion, Variants } from 'framer-motion';
import { Sparkles, Terminal } from 'lucide-react';
import { PSYCHOLOGY_SECTION, PSYCHOLOGY_MECHANISMS, GRADER_DEMO } from '../../lib/landing-data';

const customEase = [0.16, 1, 0.3, 1] as any;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 1, ease: customEase } },
};

export default function PsychologySection() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="py-40 bg-[#000000] border-t border-white/[0.02] relative overflow-hidden">
      
      <div className="max-w-[1200px] mx-auto px-6 relative z-10">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          className="text-center max-w-[700px] mx-auto mb-32"
        >
          
          
          <motion.h2 variants={fadeUp} className="font-medium text-[44px] md:text-[64px] tracking-[-0.04em] leading-[1.05] text-white/95 mb-8">
            {PSYCHOLOGY_SECTION.heading}
          </motion.h2>
          
          <motion.p variants={fadeUp} className="text-[18px] text-white/40 leading-[1.7] font-light">
            {PSYCHOLOGY_SECTION.subheading}
          </motion.p>
        </motion.div>

        <div className="grid lg:grid-cols-12 gap-16 items-start">
          
          {/* Left: The Sleek Mechanisms List */}
          <motion.div 
            initial="hidden" 
            whileInView="visible" 
            viewport={{ once: true }} 
            variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
            className="lg:col-span-5 flex flex-col gap-8"
          >
            {PSYCHOLOGY_MECHANISMS.map((item, i) => (
              <motion.div key={item.name} variants={fadeUp} className="group relative pl-6 cursor-default">
                <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-white/[0.05] group-hover:bg-[#d18a5e]/50 transition-colors duration-500" />
                <div className="flex items-baseline gap-4 mb-2">
                  <span className="font-mono text-[10px] text-white/20 group-hover:text-[#d18a5e]/70 transition-colors">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="font-medium text-[16px] text-white/70 group-hover:text-white/95 transition-colors">
                    {item.name}
                  </h3>
                </div>
                <p className="text-[14px] text-white/30 leading-[1.6] font-light group-hover:text-white/50 transition-colors">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </motion.div>

          {/* Right: The Stop-Scroll Grader Glass Terminal */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 1.2, ease: customEase }}
            className="lg:col-span-7 sticky top-32"
          >
            <div className="bg-[#030303] border border-white/[0.05] rounded-[24px] p-10 shadow-[0_40px_80px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.05)] relative overflow-hidden">
              
              {/* Terminal Header */}
              <div className="flex items-center gap-3 border-b border-white/[0.03] pb-6 mb-8">
                <Terminal className="w-4 h-4 text-[#d18a5e]" />
                <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/40">
                  {GRADER_DEMO.cardLabel}
                </span>
                <div className="ml-auto flex gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-white/[0.05]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-white/[0.05]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-white/[0.05]" />
                </div>
              </div>

              {/* Verdict Stamp */}
              <motion.div
                initial={{ opacity: 0, scale: 1.1 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.6, duration: 0.8, ease: customEase }}
                className="absolute top-10 right-10 border border-[#d18a5e]/30 text-[#d18a5e] px-4 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-[0.2em] bg-[#d18a5e]/[0.02]"
              >
                {GRADER_DEMO.verdict}
              </motion.div>

              <p className="font-serif italic text-[22px] md:text-[26px] text-white/90 leading-[1.5] mb-8 pr-12">
                "{GRADER_DEMO.hookText}"
              </p>

              <div className="inline-flex items-center gap-2 bg-white/[0.03] border border-white/[0.05] text-white/50 text-[10px] font-mono uppercase tracking-[0.15em] px-4 py-2 rounded-full mb-12">
                <Sparkles className="w-3 h-3 text-[#d18a5e]" />
                {GRADER_DEMO.badge}
              </div>

              {/* Progress Bars */}
              <div className="space-y-6">
                {GRADER_DEMO.scores.map((stat, i) => (
                  <div key={stat.label} className="group">
                    <div className="flex justify-between text-[12px] font-medium text-white/40 mb-2">
                      <span>{stat.label}</span>
                      <span className="text-white/80">{stat.score}</span>
                    </div>
                    <div className="w-full h-[3px] bg-white/[0.03] rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: stat.width }}
                        viewport={{ once: true }}
                        transition={prefersReducedMotion ? { duration: 0 } : { duration: 1.2, delay: 0.2 + (i * 0.1), ease: customEase }}
                        className="h-full bg-[#d18a5e] rounded-full opacity-60 group-hover:opacity-100 transition-opacity shadow-[0_0_10px_rgba(209,138,94,0.4)]"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-10 pt-8 border-t border-white/[0.03] flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                <p className="text-[12px] text-white/30 font-mono tracking-wide">
                  {GRADER_DEMO.caption}
                </p>
              </div>

            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}