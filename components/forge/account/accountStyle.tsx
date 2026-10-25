'use client';

/**
 * The account page's editorial look, shared by every section on it: large
 * headings, pill buttons and rounded fields on near-black panels.
 */

import { cn, focusRing } from '@/components/forge/ui';

export const pillWhite = cn(
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-[14px] font-medium text-black transition hover:bg-white/85 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40',
  focusRing
);

export const pillGhost = cn(
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-white/15 px-5 py-2.5 text-[14px] font-medium text-white transition hover:border-white/30 hover:bg-white/[0.04] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40',
  focusRing
);

export const fieldDark = cn(
  'w-full rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-[16px] text-white placeholder:text-white/30 transition focus:border-white/30 focus:bg-white/[0.06] sm:text-[15px]',
  focusRing
);

export const panel = 'rounded-[32px] bg-[#0E0E0E] p-7 sm:p-9';

export function SectionHead({ title, lead, aside }: { title: string; lead?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div className="max-w-[660px]">
        <h2 className="text-[38px] font-semibold leading-[1.02] tracking-[-0.035em] text-white sm:text-[54px]">{title}</h2>
        {lead && <p className="mt-5 max-w-[540px] text-[17px] leading-[1.55] text-white/55">{lead}</p>}
      </div>
      {aside}
    </div>
  );
}
