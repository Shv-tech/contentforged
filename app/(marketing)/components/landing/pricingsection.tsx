// app/(marketing)/components/landing/pricingsection.tsx

'use client';

import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore } from '@/lib/store';
import { useSubscriptionCheckout } from '@/lib/billing/use-subscription-checkout';
import { isPlanId } from '@/lib/billing/plans';
import { PRICING_SECTION, PRICING_TIERS, PricingTier } from '../../lib/landing-data';
import { Plate, PlateName, Heading, pillWhite, pillGhost } from './forge-art';

/**
 * Checkout logic is unchanged from the previous version: Razorpay
 * Subscriptions via useSubscriptionCheckout, entitlement granted only by the
 * signature-verified webhook. Only the presentation changed.
 */

const PLATE_FOR: Record<string, PlateName> = { starter: 'ingot', pro: 'molten', agency: 'quench', enterprise: 'slag' };

function PricingCard({ tier, onCta, isBusy }: { tier: PricingTier; onCta: (t: PricingTier) => void; isBusy: boolean }) {
  const isCustomPrice = typeof tier.price === 'string';
  return (
    <article className={`flex flex-col overflow-hidden rounded-[32px] bg-[#0E0E0E] ${tier.highlighted ? 'ring-1 ring-white/25' : ''}`}>
      <Plate name={PLATE_FOR[tier.id] ?? 'slag'} className="aspect-[16/11] p-6" sizes="(max-width: 768px) 100vw, 25vw">
        <div className="relative flex h-full flex-col justify-between">
          <div className="text-[15px] font-medium text-white/85">{tier.name}</div>
          <div className={isCustomPrice ? '' : 'flex items-baseline gap-1.5'}>
            <span className={`block font-semibold leading-none tracking-[-0.05em] tabular-nums text-white ${isCustomPrice ? 'text-[44px]' : 'text-[60px]'}`}>
              {!isCustomPrice && '$'}{tier.price}
            </span>
            <span className={`text-[14px] text-white/70 ${isCustomPrice ? 'mt-2 block' : ''}`}>{tier.billingNote}</span>
          </div>
        </div>
      </Plate>
      <div className="flex flex-1 flex-col p-7">
        <p className="min-h-[48px] text-[16px] leading-snug text-white/80">{tier.tagline}</p>
        <ul className="mt-6 flex-1 space-y-3">
          {tier.features.map((feature) => (
            <li key={feature} className="flex gap-3 text-[15px] leading-snug text-white/60">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-white/85" strokeWidth={2.25} />
              {feature}
            </li>
          ))}
        </ul>
        <button
          onClick={() => onCta(tier)}
          disabled={isBusy}
          className={`${tier.highlighted ? pillWhite : pillGhost} mt-8 w-full`}
        >
          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : tier.ctaLabel}
        </button>
        <p className="mt-4 text-center text-[13px] leading-snug text-white/35">{tier.finePrint}</p>
      </div>
    </article>
  );
}

export default function PricingSection() {
  const router = useRouter();
  const { user } = useAppStore();
  const { startCheckout, isStarting, isConfirming } = useSubscriptionCheckout();

  const busy = isStarting || isConfirming;

  const handleCta = (tier: PricingTier) => {
    if (tier.ctaType === 'contact') {
      window.location.href = `mailto:support@forgeyourway.dev?subject=Inquiry:%20Forge%20${tier.name}%20Plan`;
      return;
    }

    if (!user) {
      // Route to signup rather than opening checkout. A subscription must be
      // attached to an account, since entitlement is granted against a user id
      // by the webhook.
      toast.error('Create your account first, then choose a plan.');
      router.push('/signup');
      return;
    }

    if (!user.email) {
      toast.error('Your account has no email address. Sign in again.');
      return;
    }

    // Guards against a tier id that is not a real plan (Enterprise, or a typo
    // in landing-data). Without this the request reaches the API and fails
    // with a generic 400 the customer cannot act on.
    if (!isPlanId(tier.id) || tier.id === 'free') {
      toast.error('That plan is not available for self-serve checkout.');
      return;
    }

    startCheckout({
      planId: tier.id,
      email: user.email,
      // The plan is granted by the webhook, not here. This only refreshes the
      // view once entitlement is confirmed server-side.
      onActivated: () => router.push('/dashboard'),
    });
  };

  return (
    <section id="pricing" className="mx-auto max-w-[1240px] scroll-mt-24 px-5 sm:px-8">
      <Heading lines={PRICING_SECTION.heading} lead={PRICING_SECTION.subheading} />
      <p className="mt-6 text-[15px] text-[#FFB067]">{PRICING_SECTION.saleBanner}</p>

      <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {PRICING_TIERS.map((tier) => (
          <PricingCard key={tier.id} tier={tier} onCta={handleCta} isBusy={busy} />
        ))}
      </div>

      <div className="mt-10 max-w-[620px]">
        <h3 className="text-[17px] font-semibold text-white">{PRICING_SECTION.guarantee.title}</h3>
        <p className="mt-2 text-[16px] leading-[1.6] text-white/55">{PRICING_SECTION.guarantee.body}</p>
      </div>
    </section>
  );
}
