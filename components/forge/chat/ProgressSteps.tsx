'use client';

/**
 * Visible progress while Forge works: "Reading your Brand DNA", "Checking
 * your Story Bank", "Drafting", "Grading". A wait with visible steps reads as
 * work; the same wait with an empty placeholder reads as broken.
 */

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Spinner, cn } from '../ui';

export interface StepState {
  id: string;
  label: string;
  state: 'active' | 'done';
}

export function ProgressSteps({ steps }: { steps: StepState[] }) {
  const reduce = useReducedMotion();
  if (steps.length === 0) return null;

  // Collapse duplicates by label (several tool calls of the same kind).
  const seen = new Map<string, StepState>();
  for (const step of steps) {
    const existing = seen.get(step.label);
    if (!existing || existing.state === 'done') seen.set(step.label, step);
  }
  const visible = Array.from(seen.values()).slice(-5);

  return (
    <ol className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-live="polite">
      <AnimatePresence initial={false}>
        {visible.map((step) => (
          <motion.li
            key={step.label}
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={cn('flex items-center gap-1.5 text-[13px]', step.state === 'active' ? 'text-white/85' : 'text-white/35')}
          >
            {step.state === 'active' ? (
              <Spinner className="h-3 w-3 text-forge-gold" />
            ) : (
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            )}
            {step.label}
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}
