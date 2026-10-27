'use client';

/**
 * Swipe review: the week's drafts as a stack of cards. Right approves (it is
 * scheduled for the slot the plan picked), left skips (its idea goes back in
 * the queue), and Undo takes back the last decision. Arrow keys do the same
 * on a keyboard.
 *
 * Approving never posts to X. LinkedIn, Threads and Bluesky drafts publish
 * themselves only when that account is connected and the toggle is on.
 */

import Link from 'next/link';
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { draftText } from '@/lib/forge/draft-text';
import { PLATFORM_NAMES, type DraftRecord } from '@/lib/forge/types';
import { PlatformLabel } from '@/components/forge/icons';
import { PredictionChip, type PredictionLike } from '@/components/forge/drafts/PredictionChip';
import { Tag, Toggle, cn } from '@/components/forge/ui';
import { SELF_PUBLISHING, slotLabel } from './planTypes';
import type { ReviewAction } from './useReview';

const THRESHOLD = 110;

export function SwipeDeck({
  drafts,
  predictions,
  timezone,
  connected,
  onReview,
  onFinished,
}: {
  drafts: DraftRecord[];
  predictions: Record<string, PredictionLike | null>;
  timezone: string;
  /** Platforms with a connected account, so approving can publish. */
  connected: ReadonlySet<string>;
  onReview: (draft: DraftRecord, action: ReviewAction, options?: { autoPublish?: boolean }) => Promise<DraftRecord | null>;
  onFinished?: () => void;
}) {
  const queue = useMemo(() => drafts.filter((d) => !d.review_status || d.review_status === 'pending'), [drafts]);
  const [history, setHistory] = useState<string[]>([]);
  const [exit, setExit] = useState<1 | -1>(1);
  const [autoPublish, setAutoPublish] = useState(true);
  const current = queue[0];

  const decide = async (action: 'approve' | 'skip') => {
    if (!current) return;
    setExit(action === 'approve' ? 1 : -1);
    setHistory((h) => [...h, current.id]);
    const canPublish = SELF_PUBLISHING.has(current.platform) && connected.has(current.platform);
    await onReview(current, action, action === 'approve' ? { autoPublish: canPublish && autoPublish } : {});
  };

  const undo = async () => {
    const last = history[history.length - 1];
    const draft = drafts.find((d) => d.id === last);
    if (!draft) return;
    setHistory((h) => h.slice(0, -1));
    await onReview(draft, 'undo');
  };

  // Rebound every render so the handler always sees the current card.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === 'ArrowRight') void decide('approve');
      if (event.key === 'ArrowLeft') void decide('skip');
      if ((event.key === 'z' || event.key === 'Z') && !event.metaKey && !event.ctrlKey) void undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!current && history.length > 0) onFinished?.();
  }, [current, history.length, onFinished]);

  const reviewed = drafts.length - queue.length;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex w-full max-w-[520px] items-center justify-between text-[12.5px] text-white/45">
        <span className="tabular-nums">
          {Math.min(reviewed + 1, drafts.length)} of {drafts.length}
        </span>
        <div className="mx-4 flex h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden>
          <div className="h-full rounded-full bg-gradient-to-r from-forge-ember2 to-forge-gold transition-[width] duration-500" style={{ width: `${(reviewed / Math.max(drafts.length, 1)) * 100}%` }} />
        </div>
        <button type="button" onClick={undo} disabled={history.length === 0} className="font-medium text-white/70 hover:text-white disabled:text-white/25">
          Undo
        </button>
      </div>

      <div className="relative h-[min(560px,64dvh)] w-full max-w-[520px]">
        <AnimatePresence custom={exit} initial={false}>
          {queue.slice(0, 3).map((draft, index) =>
            index === 0 ? (
              <TopCard
                key={draft.id}
                draft={draft}
                prediction={predictions[draft.id] ?? null}
                timezone={timezone}
                exit={exit}
                canPublish={SELF_PUBLISHING.has(draft.platform) && connected.has(draft.platform)}
                autoPublish={autoPublish}
                onAutoPublish={setAutoPublish}
                onDecide={decide}
              />
            ) : (
              <motion.div
                key={draft.id}
                className="absolute inset-0 rounded-[28px] border border-white/[0.06] bg-forge-card"
                initial={false}
                animate={{ scale: 1 - index * 0.04, y: index * 14, opacity: 1 - index * 0.35 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                style={{ zIndex: 10 - index }}
                aria-hidden
              />
            )
          )}
        </AnimatePresence>

        {!current && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[28px] border border-dashed border-white/[0.1] p-8 text-center">
            <p className="text-[20px] font-semibold tracking-[-0.02em] text-white">Week reviewed</p>
            <p className="max-w-[320px] text-[14px] leading-relaxed text-white/50">Approved drafts are scheduled. Skipped ideas go back in the queue for another week.</p>
          </div>
        )}
      </div>

      {current && (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => decide('skip')}
            aria-label="Skip"
            className="flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.12] text-white/70 transition-colors hover:border-white/30 hover:text-white active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <Link href={`/drafts/${current.id}`} className="flex h-11 items-center rounded-full px-4 text-[13.5px] font-medium text-white/60 transition-colors hover:bg-white/[0.05] hover:text-white">
            Edit
          </Link>
          <button
            type="button"
            onClick={() => decide('approve')}
            aria-label="Approve"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-forge-gold to-forge-ember2 text-black shadow-[0_14px_40px_-10px_rgba(255,138,43,0.7)] transition-transform active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </button>
        </div>
      )}
      <p className="hidden text-[12px] text-white/30 sm:block">Right arrow approves, left skips, Z undoes.</p>
    </div>
  );
}

function TopCard({
  draft,
  prediction,
  timezone,
  exit,
  canPublish,
  autoPublish,
  onAutoPublish,
  onDecide,
}: {
  draft: DraftRecord;
  prediction: PredictionLike | null;
  timezone: string;
  exit: 1 | -1;
  canPublish: boolean;
  autoPublish: boolean;
  onAutoPublish: (value: boolean) => void;
  onDecide: (action: 'approve' | 'skip') => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-9, 9]);
  const approveOpacity = useTransform(x, [30, THRESHOLD], [0, 1]);
  const skipOpacity = useTransform(x, [-THRESHOLD, -30], [1, 0]);
  const slot = slotLabel(draft.suggested_for ?? draft.scheduled_for, timezone);
  const text = draftText(draft);
  const missing = /\[[^\]]{2,80}\]/.test(text);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > THRESHOLD || info.velocity.x > 650) onDecide('approve');
    else if (info.offset.x < -THRESHOLD || info.velocity.x < -650) onDecide('skip');
  };

  return (
    <motion.article
      className="absolute inset-0 z-20 flex cursor-grab flex-col overflow-hidden rounded-[28px] border border-white/[0.1] bg-forge-card shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)] active:cursor-grabbing"
      style={{ x, rotate }}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.7}
      onDragEnd={onDragEnd}
      initial={{ scale: 0.96, y: 14, opacity: 0.6 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{ x: exit * 560, opacity: 0, rotate: exit * 14, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      aria-label={`${PLATFORM_NAMES[draft.platform]} draft`}
    >
      <motion.span style={{ opacity: approveOpacity }} className="pointer-events-none absolute left-6 top-6 z-10 rounded-full border-2 border-forge-good px-3 py-1 text-[13px] font-bold uppercase tracking-[0.12em] text-forge-good">
        Approve
      </motion.span>
      <motion.span style={{ opacity: skipOpacity }} className="pointer-events-none absolute right-6 top-6 z-10 rounded-full border-2 border-white/60 px-3 py-1 text-[13px] font-bold uppercase tracking-[0.12em] text-white/80">
        Skip
      </motion.span>

      <header className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-6 py-4">
        <span className="flex items-center gap-2 text-[13.5px] font-semibold text-white">
          <PlatformLabel platform={draft.platform} />
          {draft.kind !== 'post' && <span className="font-normal text-white/45">{draft.kind}</span>}
        </span>
        {slot && <span className="text-[12.5px] text-white/45">{slot}</span>}
        <span className="ml-auto flex flex-wrap gap-1.5">
          {draft.experiment_arm && <Tag tone="steel">Experiment {draft.experiment_arm.toUpperCase()}</Tag>}
          <PredictionChip prediction={prediction} />
        </span>
      </header>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {draft.title && <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/30">{draft.title}</p>}
        <p dir="auto" className="whitespace-pre-wrap text-[15.5px] leading-[1.6] text-white/90">{text}</p>
      </div>

      <footer className={cn('flex flex-wrap items-center gap-3 border-t border-white/[0.06] px-6 py-4 text-[12.5px]', missing ? 'text-forge-warn' : 'text-white/45')}>
        {missing ? (
          <span>Has a [bracket] to fill in. Edit before approving.</span>
        ) : canPublish ? (
          <label className="flex items-center gap-3">
            <Toggle checked={autoPublish} onChange={onAutoPublish} label="Publish automatically" />
            {autoPublish ? 'Publishes itself at its slot' : 'Reminder at its slot, you post it'}
          </label>
        ) : (
          <span>{draft.platform === 'x' ? 'Approving schedules a reminder. Forge never posts to X.' : 'Approving schedules a reminder to post it.'}</span>
        )}
      </footer>
    </motion.article>
  );
}

export function ReviewSummary({ drafts }: { drafts: DraftRecord[] }) {
  const approved = drafts.filter((d) => d.review_status === 'approved').length;
  const skipped = drafts.filter((d) => d.review_status === 'skipped').length;
  return (
    <div className="flex gap-2">
      <Tag tone="good">{approved} approved</Tag>
      <Tag>{skipped} skipped</Tag>
    </div>
  );
}

