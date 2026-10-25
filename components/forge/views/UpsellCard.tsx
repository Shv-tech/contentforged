'use client';

/**
 * Shown in place of a feature the plan does not include. Calm by design: it
 * says what the feature does and which plan has it, and nothing else.
 */

import Link from 'next/link';
import { planName, type FeatureId, FEATURE_MIN_PLAN, FEATURE_NAMES } from '@/lib/forge/entitlements';
import { Plate } from '../ui';

export function UpsellCard({ feature, body }: { feature: FeatureId; body: string }) {
  return (
    <Plate name="sparks" className="flex min-h-[280px] flex-col justify-end rounded-[26px] p-7 sm:p-9" dim={0.6}>
      <div className="relative max-w-[480px]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/60">On {planName(FEATURE_MIN_PLAN[feature])}</p>
        <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-white">{FEATURE_NAMES[feature]}</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-white/75">{body}</p>
        <Link
          href="/account?tab=billing"
          className="mt-5 inline-flex h-9 items-center rounded-full bg-white px-4 text-[13.5px] font-medium text-black hover:bg-white/85"
        >
          Compare plans
        </Link>
      </div>
    </Plate>
  );
}
