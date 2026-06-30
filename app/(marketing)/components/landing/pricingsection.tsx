'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useMotionTemplate, useMotionValue, Variants } from 'framer-motion';
import { MouseEvent } from 'react';
import { Zap, ShieldCheck, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import Script from 'next/script';
import { CheckoutModal } from '@/components/CheckoutModal';
import { useAppStore } from '@/lib/store';
import { PRICING_SECTION, PRICING_TIERS, PricingTier } from '../../lib/landing-data';

const customEase = [0.16, 1, 0.3, 1] as any;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 1, ease: customEase } },
};

function PricingCard({ tier, onCta }: { tier: PricingTier; onCta: (t: PricingTier) => void }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  // Handle font sizing for text-based prices like "Custom"
  const isCustomPrice = typeof tier.price === 'string';

  return (
    <motion.div
      variants={fadeUp}
      onMouseMove={handleMouseMove}
      className={`group relative rounded-[24px] p-8 lg:p-6 xl:p-8 flex flex-col overflow-hidden transition-all duration-500 ${
        tier.highlighted ? 'md:-translate-y-4 z-10' : ''
      }`}
    >
      {/* Background base */}
      <div className="absolute inset-0 bg-[#020202] border border-white/[0.03] rounded-[24px] pointer-events-none" />

      {/* Persistent Glow for Highlighted Tier */}
      {tier.highlighted && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(209,138,94,0.06)_0%,transparent_70%)] pointer-events-none" />
      )}

      {/* Mouse Spotlight (Border & Inner Glow) */}
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-[24px] opacity-0 transition duration-500 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(400px circle at ${mouseX}px ${mouseY}px, rgba(255,255,255,0.02), transparent 80%)
          `,
        }}
      />
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-[24px] opacity-0 transition duration-500 group-hover:opacity-100"
        style={{
          border: `1px solid ${tier.highlighted ? 'rgba(209,138,94,0.3)' : 'rgba(255,255,255,0.1)'}`,
          maskImage: useMotionTemplate`
            radial-gradient(300px circle at ${mouseX}px ${mouseY}px, black, transparent 70%)
          `,
        }}
      />

      <div className="relative z-10 flex flex-col h-full">
        {tier.badge && (
          <div className="absolute -top-2 right-0 bg-[#d18a5e]/[0.05] border border-[#d18a5e]/20 text-[#d18a5e] text-[9px] font-mono font-bold uppercase tracking-[0.2em] px-3 py-1.5 rounded-full backdrop-blur-md">
            {tier.badge}
          </div>
        )}

        <h3 className="font-mono text-[11px] text-white/40 uppercase tracking-[0.2em] mb-3">
          {tier.name}
        </h3>
        
        <div className="mb-8 flex items-baseline gap-2">
          <span className={`font-medium tracking-[-0.04em] text-white/95 leading-none ${isCustomPrice ? 'text-[36px]' : 'text-[48px]'}`}>
            {!isCustomPrice && '$'}{tier.price}
          </span>
          <span className="text-[12px] text-white/30 font-light whitespace-nowrap">
            {tier.billingNote}
          </span>
        </div>
        
        <p className="text-[13px] text-white/40 mb-10 leading-[1.6] font-light min-h-[60px]">{tier.tagline}</p>

        <ul className="space-y-4 flex-1 mb-12">
          {tier.features.map((feature) => (
            <li key={feature} className="flex items-start gap-3 text-[13px] text-white/60 font-light leading-[1.6]">
              <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 opacity-60 ${tier.highlighted ? 'bg-[#d18a5e] shadow-[0_0_8px_rgba(209,138,94,0.6)]' : 'bg-white/20'}`} />
              {feature}
            </li>
          ))}
        </ul>

        {/* Anti-Button CTA */}
        <button
          onClick={() => onCta(tier)}
          className={`group/btn relative flex items-center justify-center gap-3 w-full py-4 rounded-full font-medium text-[13px] transition-all duration-500 backdrop-blur-md ${
            tier.highlighted
              ? 'bg-white/[0.04] border border-white/[0.1] text-white hover:bg-white/[0.08]'
              : 'bg-transparent border border-white/[0.05] text-white/60 hover:text-white hover:bg-white/[0.03]'
          }`}
        >
          {tier.ctaLabel}
          <ArrowRight className="w-4 h-4 text-white/40 transition-transform group-hover/btn:translate-x-1 group-hover/btn:text-white" />
          {tier.highlighted && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-[1px] bg-gradient-to-r from-transparent via-[#d18a5e]/50 to-transparent opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500" />
          )}
        </button>

        <p className="text-[11px] text-white/20 text-center mt-6 font-mono tracking-wide">{tier.finePrint}</p>
      </div>
    </motion.div>
  );
}

export default function PricingSection() {
  const router = useRouter();
  const { user, setPlan } = useAppStore();
  const [checkoutPlan, setCheckoutPlan] = useState<{ id: string; name: string; price: number } | null>(null);

  const handleCta = (tier: PricingTier) => {
    if (tier.ctaType === 'contact') {
      window.location.href = `mailto:contact@shvgroups.com?subject=Inquiry:%20ContentForge%20${tier.name}%20Plan`;
      return;
    }
    
    if (!user) {
      toast.error('Please create your account to upgrade.');
      router.push('/signup');
      return;
    }
    
    // Safety check: ensure price is a number before passing to checkout
    const numericPrice = typeof tier.price === 'number' ? tier.price : 0;
    setCheckoutPlan({ id: tier.id, name: tier.name, price: numericPrice });
  };

  return (
    <section id="pricing" className="py-40 bg-[#000000] border-t border-white/[0.02] relative">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      {checkoutPlan && (
        <CheckoutModal
          planId={checkoutPlan.id}
          planName={checkoutPlan.name}
          basePrice={checkoutPlan.price}
          onClose={() => setCheckoutPlan(null)}
          onSuccess={() => {
            setPlan(checkoutPlan.id as any);
            setCheckoutPlan(null);
          }}
        />
      )}

      <div className="max-w-[1200px] mx-auto px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          className="text-center max-w-[700px] mx-auto mb-24"
        >
          <motion.div variants={fadeUp} className="inline-flex items-center gap-3 text-[10px] font-mono text-[#d18a5e] uppercase tracking-[0.2em] bg-[#d18a5e]/[0.02] border border-[#d18a5e]/10 px-4 py-2 rounded-full mb-10">
            <span className="w-1.5 h-1.5 rounded-full bg-[#d18a5e] animate-pulse" />
            {PRICING_SECTION.saleBanner}
          </motion.div>

          <motion.h2 variants={fadeUp} className="font-medium text-[44px] md:text-[64px] tracking-[-0.04em] leading-[1.05] text-white/95 mb-8">
            <span className="block">{PRICING_SECTION.heading[0]}</span>
            <span className="block text-white/30">{PRICING_SECTION.heading[1]}</span>
          </motion.h2>

          <motion.p variants={fadeUp} className="text-[18px] text-white/40 leading-[1.7] font-light">
            {PRICING_SECTION.subheading}
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={{ visible: { transition: { staggerChildren: 0.15 } } }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 w-full"
        >
          {PRICING_TIERS.map((tier) => (
            <PricingCard key={tier.id} tier={tier} onCta={handleCta} />
          ))}
        </motion.div>

        {/* Guarantee Block */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: customEase, delay: 0.4 }}
          className="max-w-[600px] mx-auto mt-32 text-center"
        >
          <ShieldCheck className="w-6 h-6 text-white/20 mx-auto mb-6" strokeWidth={1.5} />
          <h3 className="font-medium text-[16px] text-white/80 mb-4 tracking-[-0.02em]">
            {PRICING_SECTION.guarantee.title}
          </h3>
          <p className="text-[14px] text-white/40 leading-[1.7] font-light">
            {PRICING_SECTION.guarantee.body}
          </p>
        </motion.div>
      </div>
    </section>
  );
}