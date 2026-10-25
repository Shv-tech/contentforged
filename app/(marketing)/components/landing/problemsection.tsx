'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { PROBLEM_SECTION, PROBLEMS } from '../../lib/landing-data';
import { Heading } from './forge-art';

/**
 * The problem is read, not browsed: each statement brightens as it reaches the
 * middle of the screen, so the reader takes them one at a time.
 */
export default function ProblemSection() {
  return (
    <section className="mx-auto max-w-[1240px] px-5 sm:px-8">
      <Heading lines={PROBLEM_SECTION.heading} lead={PROBLEM_SECTION.subheading} />
      <div className="mt-20 sm:mt-28">
        {PROBLEMS.map((p) => (
          <ProblemRow key={p.num} title={p.title} body={p.body} />
        ))}
      </div>
    </section>
  );
}

function ProblemRow({ title, body }: { title: string; body: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 85%', 'start 45%'] });
  const opacity = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [0.18, 1]);

  return (
    <motion.div
      ref={ref}
      style={{ opacity }}
      className="grid gap-5 border-t border-white/[0.08] py-12 sm:py-16 lg:grid-cols-12 lg:gap-12"
    >
      <h3 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.035em] text-white sm:text-[44px] lg:col-span-7">
        {title}
      </h3>
      <p className="text-[17px] leading-[1.65] text-white/55 lg:col-span-5 lg:pt-2">{body}</p>
    </motion.div>
  );
}
