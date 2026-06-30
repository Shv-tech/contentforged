'use client';

import { motion, useMotionTemplate, useMotionValue, Variants } from 'framer-motion';
import { MouseEvent } from 'react';
import { PROBLEM_SECTION, PROBLEMS } from '../../lib/landing-data';

const customEase = [0.16, 1, 0.3, 1] as any;

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 1, ease: customEase },
  },
};

// Spotlight Card Component
function SpotlightCard({ num, title, body }: { num: string; title: string; body: string }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  return (
    <motion.div
      variants={fadeUp}
      onMouseMove={handleMouseMove}
      className="group relative rounded-[20px] bg-black p-10 overflow-hidden border border-white/[0.03]"
    >
      {/* Spotlight Effect */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition duration-500 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              400px circle at ${mouseX}px ${mouseY}px,
              rgba(209,138,94,0.1),
              transparent 80%
            )
          `,
        }}
      />
      {/* Dynamic Border Reveal */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition duration-500 group-hover:opacity-100"
        style={{
          border: '1px solid rgba(209,138,94,0.2)',
          maskImage: useMotionTemplate`
            radial-gradient(
              300px circle at ${mouseX}px ${mouseY}px,
              black,
              transparent 70%
            )
          `,
        }}
      />

      <div className="relative z-10 flex flex-col h-full">
        <div className="font-mono text-[11px] text-white/30 tracking-[0.2em] mb-6 group-hover:text-[#d18a5e]/70 transition-colors duration-500">
          {num}
        </div>
        <h3 className="font-medium text-[22px] text-white/95 mb-4 leading-tight tracking-[-0.02em]">
          {title}
        </h3>
        <p className="text-[15px] text-white/40 leading-[1.7] font-light">
          {body}
        </p>
      </div>
    </motion.div>
  );
}

export default function ProblemSection() {
  return (
    <section className="py-40 bg-[#000000] border-t border-white/[0.02] relative">
      <div className="max-w-[1200px] mx-auto px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={staggerContainer}
        >

          <motion.h2
            variants={fadeUp}
            className="font-medium text-[44px] md:text-[64px] tracking-[-0.04em] leading-[1.05] mb-24 max-w-[800px]"
          >
            <span className="block text-white/95">{PROBLEM_SECTION.heading[0]}</span>
            <span className="block text-white/30">{PROBLEM_SECTION.heading[1]}</span>
          </motion.h2>

          <div className="grid md:grid-cols-2 gap-6">
            {PROBLEMS.map((prob) => (
              <SpotlightCard key={prob.num} num={prob.num} title={prob.title} body={prob.body} />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}