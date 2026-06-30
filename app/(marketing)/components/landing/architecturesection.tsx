'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform, Variants } from 'framer-motion';
import { ARCHITECTURE_SECTION, ARCHITECTURE_PILLARS, ArchitecturePillar } from '../../lib/landing-data';

const customEase = [0.16, 1, 0.3, 1] as any;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 1, ease: customEase },
  },
};

// Abstract minimalist geometries replace generic icons
function AbstractGeometry({ index }: { index: number }) {
  if (index === 0) {
    // Memory: Concentric ripples
    return (
      <svg className="w-12 h-12 absolute -top-4 -right-4 opacity-40 group-hover:opacity-100 transition-opacity duration-700" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="20" stroke="#d18a5e" strokeWidth="1" opacity="0.3" />
        <circle cx="50" cy="50" r="30" stroke="#d18a5e" strokeWidth="1" opacity="0.15" />
        <circle cx="50" cy="50" r="40" stroke="#d18a5e" strokeWidth="1" strokeDasharray="4 4" opacity="0.1" />
      </svg>
    );
  }
  if (index === 1) {
    // Intelligence: Precise sine curve
    return (
      <svg className="w-16 h-12 absolute -top-4 -right-4 opacity-40 group-hover:opacity-100 transition-opacity duration-700" viewBox="0 0 100 50" fill="none">
        <path d="M0,25 Q25,0 50,25 T100,25" stroke="#d18a5e" strokeWidth="1.5" opacity="0.3" fill="none" />
      </svg>
    );
  }
  // Agency: Minimal node connection
  return (
    <svg className="w-12 h-12 absolute -top-4 -right-4 opacity-40 group-hover:opacity-100 transition-opacity duration-700" viewBox="0 0 100 100" fill="none">
      <circle cx="20" cy="50" r="3" fill="#d18a5e" opacity="0.6" />
      <circle cx="80" cy="20" r="3" fill="#d18a5e" opacity="0.3" />
      <circle cx="80" cy="80" r="3" fill="#d18a5e" opacity="0.3" />
      <path d="M20,50 L80,20 M20,50 L80,80" stroke="#d18a5e" strokeWidth="1" opacity="0.2" />
    </svg>
  );
}

export default function ArchitectureSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // The Neural Spine logic
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start center', 'end center'],
  });

  const spineHeight = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  return (
    <section ref={containerRef} id="how" className="py-40 bg-[#000000] relative overflow-hidden">
      
      {/* THE NEURAL SPINE */}
      <div className="absolute top-0 bottom-0 left-12 md:left-1/2 md:-translate-x-1/2 w-px bg-white/[0.02]">
        <motion.div
          style={{ height: spineHeight }}
          className="w-full bg-gradient-to-b from-[#d18a5e] to-transparent shadow-[0_0_15px_rgba(209,138,94,0.6)]"
        />
      </div>

      <div className="max-w-[1200px] mx-auto px-6 pl-24 md:pl-6 relative z-10">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.15 } }
          }}
        >
          <div className="text-center md:mb-32 mb-20">
            

            <motion.h2
              variants={fadeUp}
              className="font-medium text-[44px] md:text-[64px] tracking-[-0.04em] leading-[1.05] max-w-[800px] mx-auto"
            >
              <span className="block text-white/95">{ARCHITECTURE_SECTION.heading[0]}</span>
              <span className="block text-white/30">{ARCHITECTURE_SECTION.heading[1]}</span>
            </motion.h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {ARCHITECTURE_PILLARS.map((pillar, i) => (
              <motion.div
                key={pillar.title}
                variants={fadeUp}
                className="group relative p-10 bg-black border border-white/[0.03] rounded-[20px] overflow-hidden flex flex-col hover:border-white/[0.08] transition-colors duration-500"
              >
                {/* Node connection line (desktop only) */}
                <div className="hidden md:block absolute top-10 -left-8 w-8 h-px bg-white/[0.05]" />
                
                <AbstractGeometry index={i} />

                <div className="relative z-10 flex flex-col flex-1">
                  <div className="text-[10px] font-mono text-white/30 uppercase tracking-[0.2em] mb-4">
                    {pillar.iconLabel}
                  </div>
                  <h3 className="font-medium text-[20px] text-white/95 mb-4 tracking-[-0.02em]">{pillar.title}</h3>
                  <p className="text-[15px] text-white/40 leading-[1.7] font-light mb-10">{pillar.body}</p>

                  <div className="mt-auto pt-6 border-t border-white/[0.03] flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#d18a5e] opacity-50 group-hover:opacity-100 transition-opacity" />
                    <span className="text-[12px] text-white/50 font-mono tracking-wide group-hover:text-white/80 transition-colors">
                      {pillar.proofLine}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}