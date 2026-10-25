'use client';

/**
 * Before posting: the grade, how the draft is likely to do against the
 * author's usual (and how often those ranges have been right), and tracked
 * links for anything the post sends people to. After posting: the
 * prediction that was made, what actually happened, and the results.
 */

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api, useDraftStore } from '@/lib/forge/client';
import { describeHitRate, describeRange } from '@/lib/forge/prediction-format';
import type { DraftRecord } from '@/lib/forge/types';
import { GradeStrip } from '@/components/forge/drafts/GradeStrip';
import { ResultsStrip } from '@/components/forge/drafts/ResultsStrip';
import { Button, IconButton, LoadingRow, Tag, copyText, inputClass } from '@/components/forge/ui';

interface PredictionResponse {
  prediction: { expected: number; low: number; high: number; basisCount: number } | null;
  label: string | null;
  actual: number | null;
  landed: boolean | null;
  hitRate: { evaluated: number; landed: number; rate: number | null };
  minBasis: number;
}

interface TrackedLink {
  code: string;
  destination: string;
  click_count: number;
  created_at: string;
  url: string;
}

export function ResultsPanel({ draft, canEdit, onUpdated }: { draft: DraftRecord; canEdit: boolean; onUpdated: (draft: DraftRecord) => void }) {
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [grading, setGrading] = useState(false);
  const upsert = useDraftStore((s) => s.upsert);

  useEffect(() => {
    let cancelled = false;
    api<PredictionResponse>(`/api/drafts/${draft.id}/prediction`)
      .then((data) => !cancelled && setPrediction(data))
      .catch(() => !cancelled && setPrediction(null));
    return () => {
      cancelled = true;
    };
    // A new prediction only means something once the saved text changes.
  }, [draft.id, draft.updated_at]);

  async function regrade() {
    setGrading(true);
    try {
      const { draft: updated } = await api<{ draft: DraftRecord }>(`/api/drafts/${draft.id}/grade`, { method: 'POST' });
      upsert(updated);
      onUpdated(updated);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Grading failed.');
    } finally {
      setGrading(false);
    }
  }

  const hit = prediction ? describeHitRate(prediction.hitRate) : null;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/35">Opening</h3>
        <GradeStrip grade={draft.grade} grading={grading} onGrade={regrade} />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/35">{draft.status === 'posted' ? 'Predicted and actual' : 'Likely result'}</h3>
        {!prediction ? (
          <LoadingRow label="Comparing with your posts" />
        ) : !prediction.prediction ? (
          <p className="rounded-[16px] bg-white/[0.03] p-4 text-[13.5px] leading-relaxed text-white/55">
            Forge predicts once you have {prediction.minBasis} or more posts with results on this platform. Until then any number would be a guess.
          </p>
        ) : (
          <div className="rounded-[18px] border border-white/[0.07] bg-white/[0.02] p-4">
            <p className="text-[22px] font-semibold tracking-[-0.02em] text-white">{describeRange(prediction.prediction)}</p>
            <RangeBar low={prediction.prediction.low} high={prediction.prediction.high} expected={prediction.prediction.expected} actual={prediction.actual} />
            <p className="mt-3 text-[12.5px] leading-relaxed text-white/45">
              From the {prediction.prediction.basisCount} posts of yours most like this one: same kind of opening, length, format and time of day.
            </p>
            {prediction.actual !== null && (
              <p className="mt-3 flex items-center gap-2 text-[13px] text-white/75">
                <Tag tone={prediction.landed ? 'good' : 'warn'} dot>
                  {prediction.landed ? 'Landed in range' : 'Outside the range'}
                </Tag>
                Actual: {prediction.actual.toFixed(1)}x your usual
              </p>
            )}
            {hit && <p className="mt-3 text-[12px] text-white/35">{hit}.</p>}
          </div>
        )}
      </section>

      <TrackedLinks draft={draft} canEdit={canEdit} />

      {draft.status === 'posted' && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/35">Results</h3>
          <ResultsStrip draft={draft} />
        </section>
      )}
    </div>
  );
}

/** The likely range on a log scale from a third of usual to three times usual, with the actual result marked once known. */
function RangeBar({ low, high, expected, actual }: { low: number; high: number; expected: number; actual: number | null }) {
  const min = Math.log(1 / 3);
  const max = Math.log(3);
  const at = (value: number) => `${Math.max(0, Math.min(100, ((Math.log(Math.max(value, 0.01)) - min) / (max - min)) * 100))}%`;
  return (
    <div className="relative mt-4 h-8" aria-hidden>
      <div className="absolute inset-x-0 top-3 h-1.5 rounded-full bg-white/[0.06]" />
      <div className="absolute top-3 h-1.5 rounded-full bg-gradient-to-r from-forge-ember2 to-forge-gold" style={{ left: at(low), width: `calc(${at(high)} - ${at(low)})` }} />
      <div className="absolute top-1.5 h-4 w-0.5 rounded-full bg-white" style={{ left: at(expected) }} />
      <div className="absolute top-0 h-7 w-px bg-white/25" style={{ left: at(1) }} />
      {actual !== null && <div className="absolute top-2 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-forge-card bg-forge-good" style={{ left: at(actual) }} />}
      <span className="absolute top-[26px] -translate-x-1/2 text-[10.5px] text-white/30" style={{ left: at(1) }}>
        usual
      </span>
    </div>
  );
}

function TrackedLinks({ draft, canEdit }: { draft: DraftRecord; canEdit: boolean }) {
  const [links, setLinks] = useState<TrackedLink[] | null>(null);
  const [destination, setDestination] = useState('');
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    try {
      setLinks((await api<{ links: TrackedLink[] }>(`/api/drafts/${draft.id}/link`)).links);
    } catch {
      setLinks([]);
    }
  }, [draft.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    try {
      const { link } = await api<{ link: TrackedLink }>(`/api/drafts/${draft.id}/link`, { method: 'POST', json: { destination: destination.trim() } });
      setLinks((current) => [link, ...(current ?? [])]);
      setDestination('');
      if (await copyText(link.url)) toast.success('Tracked link copied. Paste it in the post instead of the plain link.');
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) setLocked(true);
      toast.error(error instanceof ApiError ? error.message : 'Could not create the link.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/35">Tracked links</h3>
      <p className="text-[12.5px] leading-relaxed text-white/45">Clicks, bookings and sign-ups from this post are counted as its results.</p>
      {canEdit && draft.status !== 'posted' && !locked && (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <input value={destination} onChange={(e) => setDestination(e.target.value)} type="url" placeholder="https://cal.com/you/intro" className={inputClass} spellCheck={false} />
          <Button type="submit" variant="secondary" size="md" loading={busy} disabled={destination.trim().length < 8}>
            Create
          </Button>
        </form>
      )}
      {links && links.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {links.map((link) => (
            <li key={link.code} className="flex items-center gap-2 rounded-[12px] bg-white/[0.03] px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-white/85">{link.url.replace(/^https?:\/\//, '')}</p>
                <p className="truncate text-[11.5px] text-white/35">{link.destination}</p>
              </div>
              <span className="shrink-0 text-[12px] tabular-nums text-white/55">
                {link.click_count} {link.click_count === 1 ? 'click' : 'clicks'}
              </span>
              <IconButton
                label="Copy link"
                onClick={async () => {
                  if (await copyText(link.url)) toast.success('Copied.');
                }}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <rect x="8" y="8" width="12" height="12" rx="2.5" />
                  <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
                </svg>
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
