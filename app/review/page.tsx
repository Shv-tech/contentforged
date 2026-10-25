'use client';

/**
 * /review: the week's drafts as a swipe deck, full screen. This is where
 * the Monday notification lands, so the whole review fits on a phone in a
 * minute or two.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api, useActiveBrand, useConnectionsStore } from '@/lib/forge/client';
import type { DraftRecord } from '@/lib/forge/types';
import { StandaloneShell } from '@/components/forge/StandaloneShell';
import { SwipeDeck } from '@/components/forge/plan/SwipeDeck';
import { useReview } from '@/components/forge/plan/useReview';
import type { PlanResponse } from '@/components/forge/plan/planTypes';
import { LoadingRow } from '@/components/forge/ui';

export default function ReviewPage() {
  const brand = useActiveBrand();
  const [data, setData] = useState<PlanResponse | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const { connections, load: loadConnections } = useConnectionsStore();

  const load = useCallback(async () => {
    try {
      setData(await api<PlanResponse>('/api/plan'));
    } catch (error) {
      setFailed(error instanceof ApiError ? error.message : 'Could not load this week.');
    }
  }, []);

  useEffect(() => {
    void load();
    void loadConnections();
  }, [load, loadConnections]);

  const setDrafts = useCallback((update: (drafts: DraftRecord[]) => DraftRecord[]) => setData((current) => (current ? { ...current, drafts: update(current.drafts) } : current)), []);
  const review = useReview(setDrafts);
  const connected = useMemo(() => new Set<string>(connections.map((c) => c.platform)), [connections]);
  const onFinished = useCallback(() => toast.success('Week reviewed.'), []);

  return (
    <StandaloneShell title="Review this week" surface="review">
      {failed ? (
        <p className="py-16 text-center text-[14px] text-white/55">{failed}</p>
      ) : !data ? (
        <LoadingRow label="Loading this week" />
      ) : data.drafts.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <p className="text-[20px] font-semibold tracking-[-0.02em]">Nothing to review</p>
          <p className="max-w-[340px] text-[14px] leading-relaxed text-white/50">This week has no plan yet. Plan it from the workspace, or record a voice note so the next one has more to draw on.</p>
          <div className="mt-2 flex gap-3">
            <Link href="/capture?record=1" className="inline-flex h-10 items-center rounded-full bg-white px-5 text-[14px] font-medium text-black">
              Record a note
            </Link>
            <Link href="/dashboard?view=plan" className="inline-flex h-10 items-center rounded-full border border-white/[0.12] px-5 text-[14px] font-medium text-white">
              Open this week
            </Link>
          </div>
        </div>
      ) : !brand.canEdit ? (
        <p className="py-16 text-center text-[14px] text-white/55">Your role in {brand.name} can read drafts but not approve them.</p>
      ) : (
        <SwipeDeck drafts={data.drafts} predictions={data.predictions} timezone={data.timezone} connected={connected} onReview={review} onFinished={onFinished} />
      )}
    </StandaloneShell>
  );
}
