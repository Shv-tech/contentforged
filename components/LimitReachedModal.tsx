'use client';

// components/LimitReachedModal.tsx
//
// Shown when the chat route returns 429.
//
// The alternative, which is what happened before, is rendering the raw error
// into the transcript. That gives a user who has simply used their allowance
// the same experience as a user who hit a decommissioned model: a red error
// message implying the product is broken. One of those is a normal state with
// an obvious next step, and it should not look like a failure.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Zap, Clock } from 'lucide-react';

export interface QuotaSnapshot {
  windowUsed: number;
  windowBudget: number;
  windowResetsAt: string | null;
  monthlyUsed: number;
  monthlyBudget: number;
}

interface LimitReachedModalProps {
  open: boolean;
  onClose: () => void;
  /** 'window_exceeded' is temporary; 'monthly_exceeded' needs an upgrade. */
  reason: 'window_exceeded' | 'monthly_exceeded' | 'no_profile' | null;
  quota: QuotaSnapshot | null;
  upgradeRequired?: boolean;
}

/**
 * Live countdown to the reset.
 *
 * The specific time matters more than the fact of the limit. "You are out of
 * generations" prompts a support message; "resets in 42 minutes" prompts
 * waiting 42 minutes.
 */
function useCountdown(target: string | null): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setLabel(null);
      return;
    }

    const tick = () => {
      const remaining = new Date(target).getTime() - Date.now();

      if (remaining <= 0) {
        setLabel('any moment now');
        return;
      }

      const minutes = Math.ceil(remaining / 60000);
      if (minutes < 60) {
        setLabel(`${minutes} minute${minutes === 1 ? '' : 's'}`);
        return;
      }

      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      setLabel(rest > 0 ? `${hours}h ${rest}m` : `${hours} hour${hours === 1 ? '' : 's'}`);
    };

    tick();
    // Every 30s rather than every second. A ticking clock on a blocked state
    // reads as pressure, and nobody needs second-level precision on a wait
    // measured in tens of minutes.
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [target]);

  return label;
}

export function LimitReachedModal({
  open,
  onClose,
  reason,
  quota,
  upgradeRequired,
}: LimitReachedModalProps) {
  const router = useRouter();
  const resetsIn = useCountdown(quota?.windowResetsAt ?? null);

  // Escape closes. A modal that traps someone who has already hit a wall is
  // the wrong place to be precious about the CTA.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isMonthly = reason === 'monthly_exceeded' || upgradeRequired;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] bg-[#0d0d0d] border border-[#242424] rounded-t-2xl md:rounded-2xl p-7 shadow-[0_20px_60px_rgba(0,0,0,0.6)] animate-in slide-in-from-bottom md:zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between mb-5">
          <div className="w-10 h-10 rounded-full bg-[#d18a5e]/10 border border-[#d18a5e]/20 flex items-center justify-center">
            {isMonthly ? (
              <Zap className="w-[18px] h-[18px] text-[#d18a5e]" />
            ) : (
              <Clock className="w-[18px] h-[18px] text-[#d18a5e]" />
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[#666] hover:text-white transition-colors p-1.5 -m-1.5"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/*
          Two genuinely different situations, so two different messages.
          A window limit clears by itself and upgrading is optional. A monthly
          limit does not clear until the billing period rolls, and upgrading
          is the only way to continue now. Telling someone to upgrade when
          waiting 40 minutes would do reads as a shakedown.
        */}
        {isMonthly ? (
          <>
            <h2 className="text-[19px] font-semibold text-white mb-2.5 tracking-[-0.01em]">
              You've used this month's allowance
            </h2>
            <p className="text-[14px] leading-[1.65] text-[#999] mb-6">
              Your plan resets at the start of your next billing period. Upgrading raises the limit
              straight away, and everything you've made stays where it is.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-[19px] font-semibold text-white mb-2.5 tracking-[-0.01em]">
              Taking a short break
            </h2>
            <p className="text-[14px] leading-[1.65] text-[#999] mb-6">
              You've used the generations in this window.{' '}
              {resetsIn ? (
                <>
                  It resets in <span className="text-white font-medium">{resetsIn}</span>, and
                  nothing is lost in the meantime.
                </>
              ) : (
                'It resets shortly, and nothing is lost in the meantime.'
              )}
            </p>
          </>
        )}

        {quota && quota.monthlyBudget > 0 && (
          <div className="mb-6">
            <div className="flex justify-between text-[12px] text-[#666] mb-2">
              <span>This month</span>
              <span>
                {Math.min(100, Math.round((quota.monthlyUsed / quota.monthlyBudget) * 100))}% used
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[#1e1e1e] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#d18a5e] transition-all duration-700"
                style={{
                  width: `${Math.min(100, (quota.monthlyUsed / quota.monthlyBudget) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => router.push('/account')}
            className="flex-1 py-3 rounded-xl text-[14px] font-medium bg-white text-black hover:bg-[#e8e8e8] transition-colors"
          >
            {isMonthly ? 'See plans' : 'Upgrade for more'}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-3 rounded-xl text-[14px] font-medium bg-transparent border border-[#2a2a2a] text-[#999] hover:text-white hover:border-[#3a3a3a] transition-colors"
          >
            {isMonthly ? 'Not now' : 'Wait it out'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Turns any thrown chat error into something worth showing a user.
 *
 * Provider errors in particular must never reach the transcript. A message
 * naming a decommissioned model tells the user nothing they can act on, and
 * tells anyone else reading over their shoulder which vendor sits behind the
 * product.
 */
export function friendlyChatError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('decommissioned') || lower.includes('no longer supported') || lower.includes('model')) {
    return 'Something went wrong on our side generating that. Please try again in a moment.';
  }
  if (lower.includes('unauthorized') || lower.includes('401')) {
    return 'Your session expired. Please sign in again.';
  }
  if (lower.includes('timeout') || lower.includes('aborted')) {
    return 'That took too long and was stopped. Try a shorter request.';
  }
  if (lower.includes('overloaded') || lower.includes('rate limit') || lower.includes('529')) {
    return 'The model is busy right now. Give it a few seconds and try again.';
  }

  return 'Something went wrong. Please try again.';
}