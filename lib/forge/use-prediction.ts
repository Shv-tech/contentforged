'use client';

/**
 * lib/forge/use-prediction.ts
 *
 * A draft's prediction, fetched once per saved version of the draft and
 * shared by every card that shows it. Draft lists render many cards, so
 * requests are cached by id and updated_at and never repeated.
 */

import { useEffect, useState } from 'react';
import { api } from './client';
import type { PredictionLike } from '@/components/forge/drafts/PredictionChip';

const cache = new Map<string, Promise<PredictionLike | null>>();

export function usePrediction(draft: { id: string; updated_at: string; status: string } | null): PredictionLike | null {
  const [prediction, setPrediction] = useState<PredictionLike | null>(null);
  const key = draft ? `${draft.id}:${draft.updated_at}` : null;

  useEffect(() => {
    if (!draft || !key || draft.status === 'archived') return;
    let cancelled = false;
    let request = cache.get(key);
    if (!request) {
      request = api<{ prediction: PredictionLike | null }>(`/api/drafts/${draft.id}/prediction`)
        .then((data) => data.prediction)
        .catch(() => null);
      cache.set(key, request);
    }
    void request.then((value) => !cancelled && setPrediction(value));
    return () => {
      cancelled = true;
    };
    // The key captures everything about the draft that matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return prediction;
}
