'use client';

/**
 * The "Sounds like you" meter. Scored locally from the stored fingerprint,
 * so it moves as the user types.
 */

import { useMemo } from 'react';
import { scoreVoice, type VoiceScore } from '@/lib/forge/voice';
import { useVoiceStore } from '@/lib/forge/client';
import { cn } from '../ui';

export function useVoiceScore(text: string): VoiceScore & { needsSamples: boolean } {
  const fingerprint = useVoiceStore((s) => s.fingerprint);
  const banned = useVoiceStore((s) => s.bannedPhrases);
  return useMemo(() => {
    const result = scoreVoice(text, fingerprint?.profile ?? null, banned);
    return { ...result, needsSamples: result.score === null };
  }, [text, fingerprint, banned]);
}

export function VoiceMeter({ score, needsSamples, compact = false }: { score: number | null; needsSamples: boolean; compact?: boolean }) {
  if (needsSamples || score === null) {
    return (
      <span className="text-[12px] text-white/40" title="Add five or more of your own posts in Brand to measure your voice.">
        Voice not measured yet
      </span>
    );
  }

  const tone = score >= 80 ? 'bg-forge-good' : score >= 60 ? 'bg-forge-warn' : 'bg-forge-bad';
  const text = score >= 80 ? 'text-forge-good' : score >= 60 ? 'text-forge-warn' : 'text-forge-bad';

  return (
    <span className="inline-flex items-center gap-2" title="How closely this draft matches your measured voice">
      {!compact && <span className="text-[12px] text-white/50">Sounds like you</span>}
      <span className="relative h-1 w-14 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <span className={cn('absolute inset-y-0 left-0 rounded-full transition-[width] duration-500', tone)} style={{ width: `${score}%` }} />
      </span>
      <span className={cn('text-[12px] font-semibold tabular-nums', text)}>{score}%</span>
    </span>
  );
}
