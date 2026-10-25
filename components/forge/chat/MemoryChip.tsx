'use client';

/**
 * "Saved to your Story Bank" and "Saved to your rules", with Undo.
 * Memory the user can see is memory they trust.
 */

import { useState } from 'react';
import { api } from '@/lib/forge/client';
import { useVoiceStore } from '@/lib/forge/client';
import { cn } from '../ui';

export function MemoryChip({ kind, id, label }: { kind: 'rule' | 'story'; id: string; label: string }) {
  const [state, setState] = useState<'saved' | 'undoing' | 'removed'>('saved');

  const undo = async () => {
    setState('undoing');
    try {
      await api(kind === 'rule' ? `/api/rules/${id}` : `/api/stories/${id}`, { method: 'DELETE' });
      if (kind === 'rule') useVoiceStore.getState().load(true);
      setState('removed');
    } catch {
      setState('saved');
    }
  };

  return (
    <div className="my-2 inline-flex max-w-full items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] py-1.5 pl-3 pr-1.5 text-[12.5px]">
      <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', state === 'removed' ? 'bg-white/30' : 'bg-forge-ember')} />
      <span className="shrink-0 text-white/50">{state === 'removed' ? 'Removed' : kind === 'rule' ? 'Saved to your rules' : 'Saved to Story Bank'}</span>
      <span className={cn('min-w-0 truncate text-white/85', state === 'removed' && 'line-through text-white/40')}>{label}</span>
      {state !== 'removed' && (
        <button
          type="button"
          onClick={undo}
          disabled={state === 'undoing'}
          className="shrink-0 rounded-full px-2.5 py-0.5 text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
        >
          Undo
        </button>
      )}
    </div>
  );
}
