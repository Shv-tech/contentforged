'use client';

/**
 * Grade display: the score chip, the compact strip on a draft card, and the
 * full grade reveal used by the grader tool and shared grade cards.
 *
 * The forging metaphor carries the meaning: a cold steel plate below 30, a
 * glowing ingot from 30, molten from 40. "This post is still cold" says more
 * than "Score: 27".
 */

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { composeIntent } from '@/lib/x/intent';
import { VERDICT_LABELS, type Grade } from '@/lib/forge/types';
import { Button, Meter, Plate, Spinner, cn, type PlateName } from '../ui';

export function heatOf(score: number): { plate: PlateName; line: string; tone: 'good' | 'warn' | 'bad' } {
  if (score >= 40) return { plate: 'molten', line: 'This one is ready.', tone: 'good' };
  if (score >= 30) return { plate: 'ingot', line: 'Almost there. One fix.', tone: 'warn' };
  return { plate: 'steel', line: 'This post is still cold.', tone: 'bad' };
}

export function ScoreChip({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const hot = score >= 40;
  const warm = score >= 30;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[10px] font-semibold tabular-nums',
        size === 'sm' && 'h-7 min-w-7 px-1.5 text-[12px]',
        size === 'md' && 'h-9 min-w-9 px-2 text-[14px]',
        size === 'lg' && 'h-12 min-w-12 px-3 text-[18px]',
        hot ? 'bg-gradient-to-b from-forge-gold to-forge-ember2 text-black' : warm ? 'bg-forge-warn/20 text-forge-warn' : 'bg-white/[0.08] text-white/70'
      )}
      aria-label={`Score ${score} out of 50`}
    >
      {score}
    </span>
  );
}

export function GradeStrip({
  grade,
  grading,
  onGrade,
  onUseRewrite,
}: {
  grade: Grade | null;
  grading: boolean;
  onGrade: () => void;
  onUseRewrite?: (rewrite: string) => void;
}) {
  if (!grade) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.03] px-3.5 py-2.5">
        <span className="flex items-center gap-2 text-[13px] text-white/50">
          {grading ? (
            <>
              <Spinner className="h-3.5 w-3.5" /> Grading the opening
            </>
          ) : (
            'Not graded yet'
          )}
        </span>
        {!grading && (
          <Button variant="quiet" size="xs" onClick={onGrade}>
            Grade it
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-white/[0.03] px-3.5 py-3">
      <div className="flex items-start gap-3">
        <ScoreChip score={grade.score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-[13px] font-medium text-white">
            {VERDICT_LABELS[grade.verdict]}
            <span className="text-white/35">{grade.score}/50</span>
          </div>
          {grade.weakest && <p className="mt-0.5 text-[13px] leading-snug text-white/60">{grade.weakest}</p>}
        </div>
        <Button variant="quiet" size="xs" onClick={onGrade} loading={grading} aria-label="Grade again">
          Regrade
        </Button>
      </div>
      {grade.rewrite && onUseRewrite && (
        <div className="flex items-start justify-between gap-3 border-t border-white/[0.06] pt-2.5">
          <p className="min-w-0 text-[13.5px] leading-snug text-white/85">
            <span className="text-white/40">Try: </span>
            {grade.rewrite}
          </p>
          <Button variant="secondary" size="xs" onClick={() => onUseRewrite(grade.rewrite!)}>
            Use it
          </Button>
        </div>
      )}
    </div>
  );
}

function useCountUp(target: number, durationMs = 900): number {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, reduce]);
  return value;
}

/**
 * The public link for a grade card. Built from the configured app URL, not
 * window.location, so the server render and the client render agree and a
 * score shared from a preview deployment still points at the real site.
 */
export function shareGradeUrl(cardId: string): string {
  const origin = (process.env.NEXT_PUBLIC_APP_URL || 'https://forgeyourway.dev').replace(/\/+$/, '');
  return `${origin}/g/${cardId}`;
}

export function GradeReveal({ grade, hook, cardId }: { grade: Grade; hook: string; cardId: string | null }) {
  const shown = useCountUp(grade.score);
  const heat = heatOf(grade.score);
  const [copied, setCopied] = useState(false);

  const shareText = `My opening line scored ${grade.score}/50 on the Forge grader.\n\n"${hook.length > 140 ? `${hook.slice(0, 137)}...` : hook}"`;

  return (
    <div className="my-5 w-full max-w-[640px] overflow-hidden rounded-[26px] border border-white/[0.08] bg-forge-card">
      <Plate name={heat.plate} className="flex min-h-[200px] flex-col justify-end p-6" dim={0.55}>
        <div className="relative flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-white/75">{heat.line}</p>
            <p className="mt-2 line-clamp-3 text-[19px] font-semibold leading-snug tracking-[-0.015em] text-white">&ldquo;{hook}&rdquo;</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[64px] font-semibold leading-none tracking-[-0.05em] text-white tabular-nums">{shown}</div>
            <div className="text-[13px] text-white/60">out of 50</div>
          </div>
        </div>
      </Plate>

      <div className="grid gap-x-8 gap-y-3.5 p-6 sm:grid-cols-2">
        {grade.dimensions.map((dimension) => (
          <div key={dimension.key}>
            <div className="mb-1.5 flex justify-between text-[12.5px]">
              <span className="text-white/60">{dimension.label}</span>
              <span className="font-medium text-white tabular-nums">{dimension.score}/10</span>
            </div>
            <Meter value={dimension.score} max={10} tone={dimension.score >= 8 ? 'ember' : dimension.score >= 6 ? 'warn' : 'bad'} label={dimension.label} />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 border-t border-white/[0.06] p-6">
        {grade.weakest && (
          <div>
            <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-white/40">The one fix</div>
            <p className="mt-1.5 text-[15px] leading-relaxed text-white/85">{grade.weakest}</p>
          </div>
        )}
        {grade.rewrite && (
          <div>
            <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-white/40">Try this</div>
            <p className="mt-1.5 text-[16px] font-medium leading-snug text-white">{grade.rewrite}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {grade.rewrite && (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(grade.rewrite!);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
            >
              {copied ? 'Copied' : 'Copy the rewrite'}
            </Button>
          )}
          {cardId && (
            <a
              href={composeIntent(`${shareText}\n\n${shareGradeUrl(cardId)}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center rounded-full bg-white px-3.5 text-[13px] font-medium text-black transition-colors hover:bg-white/85"
            >
              Share the score
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
