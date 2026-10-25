'use client';

/**
 * How a draft is likely to do, against the author's own usual. A range,
 * never a single number, and it says what it rests on. Hidden when there is
 * not enough history to say anything honest.
 */

import { describeRange, rangeTone, type RangeLike } from '@/lib/forge/prediction-format';
import { cn } from '@/components/forge/ui';

export interface PredictionLike extends RangeLike {
  basisCount: number;
}

export function PredictionChip({ prediction, className, detailed = false }: { prediction: PredictionLike | null | undefined; className?: string; detailed?: boolean }) {
  if (!prediction) return null;
  const tone = rangeTone(prediction);
  return (
    <span
      title={`Based on ${prediction.basisCount} of your posts most like this one`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium leading-none',
        tone === 'good' ? 'bg-forge-good/12 text-forge-good' : tone === 'warn' ? 'bg-forge-warn/12 text-forge-warn' : 'bg-white/[0.06] text-white/70',
        className
      )}
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
        <path d="M2 12 6 8l3 2.5L14 4" />
        <path d="M10.5 4H14v3.5" />
      </svg>
      Likely {describeRange(prediction)}
      {detailed && <span className="font-normal opacity-70">· {prediction.basisCount} posts</span>}
    </span>
  );
}
