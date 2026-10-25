'use client';

/**
 * Three alternative openings, each graded, side by side. Picking one replaces
 * the first line of the draft; the choice is saved as the user's edit.
 */

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/forge/client';
import { VERDICT_LABELS, type Grade } from '@/lib/forge/types';
import { Button, Dialog, Spinner, cn } from '../ui';
import { ScoreChip } from './GradeStrip';

interface Variant {
  hook: string;
  approach: string;
  grade: Grade;
}

export function VariantsDialog({
  draftId,
  currentScore,
  open,
  onClose,
  onPick,
}: {
  draftId: string;
  currentScore: number | null;
  open: boolean;
  onClose: () => void;
  onPick: (hook: string) => void;
}) {
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setVariants(null);
    setError(null);
    api<{ variants: Variant[] }>(`/api/drafts/${draftId}/variants`, { method: 'POST' })
      .then((data) => setVariants(data.variants))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not write variants right now.'));
  }, [open, draftId]);

  return (
    <Dialog open={open} onClose={onClose} title="Other openings" className="max-w-[720px]">
      {currentScore !== null && <p className="mb-4 text-[13px] text-white/50">Your current opening scores {currentScore}/50.</p>}

      {error ? (
        <p className="rounded-2xl border border-forge-bad/20 bg-forge-bad/5 p-4 text-[14px] text-forge-bad">{error}</p>
      ) : variants === null ? (
        <div className="flex items-center gap-3 py-10 text-[14px] text-white/55">
          <Spinner /> Writing three different approaches and grading each
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-3">
          {variants.map((variant, index) => (
            <li key={index} className="flex flex-col rounded-[20px] border border-white/[0.08] bg-white/[0.02] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-white/40">{variant.approach || `Option ${index + 1}`}</span>
                <ScoreChip score={variant.grade.score} size="sm" />
              </div>
              <p className="mt-3 flex-1 whitespace-pre-wrap text-[15px] leading-snug text-white">{variant.hook}</p>
              <p className={cn('mt-3 text-[12px]', variant.grade.verdict === 'ready' ? 'text-forge-good' : 'text-white/45')}>
                {VERDICT_LABELS[variant.grade.verdict]}
              </p>
              <Button
                variant={index === 0 ? 'primary' : 'secondary'}
                size="sm"
                className="mt-3"
                onClick={() => {
                  onPick(variant.hook);
                  onClose();
                }}
              >
                Use this
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
