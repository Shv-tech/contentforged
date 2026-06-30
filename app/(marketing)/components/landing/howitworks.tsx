'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform, Variants } from 'framer-motion';
import { HOW_IT_WORKS_SECTION, HOW_IT_WORKS_STEPS } from '../../lib/landing-data';

const customEase = [0.16, 1, 0.3, 1] as any;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 1, ease: customEase } },
};

export default function HowItWorks() {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Vertical line draw effect based on scroll
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start center', 'end center'],
  });
  
  const lineHeight = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  return (
    <section ref={containerRef} className="py-40 bg-[#000000] border-t border-white/[0.02] relative overflow-hidden">
      <div className="max-w-[1000px] mx-auto px-6 relative z-10">
        
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          className="text-center mb-32"
        >
          
          <motion.h2 variants={fadeUp} className="font-medium text-[44px] md:text-[64px] tracking-[-0.04em] leading-[1.05] text-white/95">
            <span className="block">{HOW_IT_WORKS_SECTION.heading[0]}</span>
            <span className="block text-white/30">{HOW_IT_WORKS_SECTION.heading[1]}</span>
          </motion.h2>
        </motion.div>

        <div className="relative">
          {/* Background empty spine track */}
          <div className="absolute top-0 bottom-0 left-[23px] md:left-1/2 md:-translate-x-1/2 w-px bg-white/[0.05]" />
          
          {/* Active drawing spine */}
          <div className="absolute top-0 bottom-0 left-[23px] md:left-1/2 md:-translate-x-1/2 w-px">
            <motion.div 
              style={{ height: lineHeight }} 
              className="w-full bg-[#d18a5e] shadow-[0_0_15px_rgba(209,138,94,0.8)]"
            />
          </div>

          <div className="space-y-24">
            {HOW_IT_WORKS_STEPS.map((step, i) => {
              const isEven = i % 2 === 0;
              return (
                <motion.div 
                  key={step.number}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-100px' }}
                  transition={{ duration: 1, ease: customEase }}
                  className={`relative flex items-center ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'} flex-row`}
                >
                  {/* Spine Node point */}
                  <div className="absolute left-[19px] md:left-1/2 md:-translate-x-1/2 w-[9px] h-[9px] rounded-full bg-black border-2 border-[#d18a5e] shadow-[0_0_10px_rgba(209,138,94,0.6)] z-10" />

                  {/* Empty space for the opposite side on desktop */}
                  <div className="hidden md:block md:w-1/2" />

                  {/* Content Box */}
                  <div className={`md:w-1/2 pl-12 md:pl-0 ${isEven ? 'md:pr-16 md:text-right' : 'md:pl-16 md:text-left'}`}>
                    <div className="font-mono text-[10px] text-white/20 tracking-[0.2em] mb-4">
                      PHASE {step.number}
                    </div>
                    <h3 className="font-medium text-[24px] text-white/95 mb-4 tracking-[-0.02em]">
                      {step.title}
                    </h3>
                    <p className="text-[15px] text-white/40 leading-[1.7] font-light mb-6">
                      {step.body}
                    </p>
                    <div className={`inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#d18a5e]/80 border border-[#d18a5e]/20 bg-[#d18a5e]/[0.03] px-3 py-1.5 rounded-full ${isEven ? 'md:ml-auto' : ''}`}>
                      {step.timeLabel}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}