'use client';

/**
 * Approve, skip and undo for weekly-plan drafts, optimistic so a swipe never
 * waits on the network. A failure puts the draft back as it was and says so.
 */

import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api, useDraftStore } from '@/lib/forge/client';
import type { DraftRecord } from '@/lib/forge/types';

export type ReviewAction = 'approve' | 'skip' | 'undo';

export function useReview(setDrafts: (update: (drafts: DraftRecord[]) => DraftRecord[]) => void) {
  const upsert = useDraftStore((s) => s.upsert);

  return useCallback(
    async (draft: DraftRecord, action: ReviewAction, options: { autoPublish?: boolean } = {}): Promise<DraftRecord | null> => {
      const optimistic: DraftRecord = { ...draft, review_status: action === 'approve' ? 'approved' : action === 'skip' ? 'skipped' : 'pending' };
      setDrafts((drafts) => drafts.map((d) => (d.id === draft.id ? optimistic : d)));
      try {
        const { draft: updated } = await api<{ draft: DraftRecord }>('/api/plan/review', {
          method: 'POST',
          json: { draftId: draft.id, action, autoPublish: options.autoPublish },
        });
        setDrafts((drafts) => drafts.map((d) => (d.id === draft.id ? updated : d)));
        upsert(updated);
        return updated;
      } catch (error) {
        setDrafts((drafts) => drafts.map((d) => (d.id === draft.id ? draft : d)));
        toast.error(error instanceof ApiError ? error.message : 'Could not save that. Try again.');
        return null;
      }
    },
    [setDrafts, upsert]
  );
}
