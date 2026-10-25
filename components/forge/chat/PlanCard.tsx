'use client';

/**
 * An outline to approve before a long generation runs: an ebook, a long
 * thread, a campaign. Items can be edited, reordered, removed and added; the
 * approved list is sent back verbatim, so Forge writes exactly what was
 * agreed.
 */

import { useState } from 'react';
import type { PlanProposal } from '@/lib/forge/types';
import { Button, IconButton, Tag, cn } from '../ui';

export const PLAN_OPEN = '[APPROVED PLAN';
export const PLAN_CLOSE = '[/APPROVED PLAN]';

export function formatApprovedPlan(plan: PlanProposal, items: string[]): string {
  return `${PLAN_OPEN}: ${plan.title} | ${plan.kind}]\n${items.map((item, i) => `${i + 1}. ${item}`).join('\n')}\n${PLAN_CLOSE}\nWrite it exactly to this plan.`;
}

export function parseApprovedPlan(content: string): { title: string; kind: string; items: string[] } | null {
  const match = content.match(/\[APPROVED PLAN: (.+?) \| (\w+)\]\n([\s\S]*?)\n\[\/APPROVED PLAN\]/);
  if (!match) return null;
  return {
    title: match[1],
    kind: match[2],
    items: match[3]
      .split('\n')
      .map((line) => line.replace(/^\d+\.\s*/, '').trim())
      .filter(Boolean),
  };
}

const KIND_LABEL: Record<PlanProposal['kind'], string> = {
  ebook: 'Ebook outline',
  thread: 'Thread outline',
  campaign: 'Campaign plan',
  series: 'Series plan',
};

export function PlanCard({
  plan,
  answered,
  disabled,
  onApprove,
}: {
  plan: PlanProposal;
  answered: boolean;
  disabled: boolean;
  onApprove: (plan: PlanProposal, items: string[]) => void;
}) {
  const [items, setItems] = useState(plan.items);
  const locked = answered || disabled;

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
  };

  return (
    <div className={cn('my-5 w-full max-w-[640px] rounded-[24px] border border-white/[0.08] bg-forge-card p-5', locked && 'opacity-70')}>
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone="ember">{KIND_LABEL[plan.kind]}</Tag>
        <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-white">{plan.title}</h3>
      </div>
      {plan.note && <p className="mt-2 text-[13.5px] text-white/55">{plan.note}</p>}

      <ol className="mt-4 flex flex-col gap-1.5">
        {items.map((item, index) => (
          <li key={index} className="group flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-white/[0.03]">
            <span className="w-6 shrink-0 text-right text-[12px] font-semibold text-white/35 tabular-nums">{index + 1}</span>
            <input
              value={item}
              disabled={locked}
              onChange={(e) => setItems(items.map((it, i) => (i === index ? e.target.value : it)))}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-[14.5px] text-white outline-none disabled:text-white/70"
              aria-label={`Item ${index + 1}`}
            />
            {!locked && (
              <span className="flex opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <IconButton label="Move up" onClick={() => move(index, -1)} disabled={index === 0}>
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="m6 15 6-6 6 6" />
                  </svg>
                </IconButton>
                <IconButton label="Move down" onClick={() => move(index, 1)} disabled={index === items.length - 1}>
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </IconButton>
                <IconButton label="Remove" onClick={() => setItems(items.filter((_, i) => i !== index))} disabled={items.length <= 2}>
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </IconButton>
              </span>
            )}
          </li>
        ))}
      </ol>

      {!locked ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Button variant="quiet" size="sm" onClick={() => setItems([...items, ''])}>
            Add an item
          </Button>
          <Button variant="primary" size="sm" onClick={() => onApprove(plan, items.map((i) => i.trim()).filter(Boolean))}>
            Approve and write
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-[12.5px] text-white/40">Approved</p>
      )}
    </div>
  );
}
