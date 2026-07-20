"use client";

import { useEffect, useRef } from "react";

// Reserves fixed height BEFORE the ad loads (prevents layout shift / CLS penalty).
// Core Web Vitals treats CLS as a ranking signal — this ensures ad loading 
// doesn't tank the SEO this page relies on.

export default function AdSlot({ slotId }: { slotId: string }) {
  const isLoaded = useRef(false);

  useEffect(() => {
    // Prevent React 18 Strict Mode from double-pushing the ad in development
    if (isLoaded.current) return;
    
    try {
      // @ts-expect-error — adsbygoogle is injected by the global AdSense script tag
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      isLoaded.current = true;
    } catch {
      // Ad blocker active or script not loaded yet — fail silently, never break the page
    }
  }, []);

  return (
    <div
      className="relative flex min-h-[100px] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-neutral-200 bg-neutral-50"
      data-ad-slot={slotId}
    >
      {/* Subtle placeholder text that gets covered up once the ad actually loads */}
      <span className="absolute text-xs font-semibold uppercase tracking-widest text-neutral-300 pointer-events-none">
        Advertisement
      </span>
      
      <ins
        className="adsbygoogle relative z-10"
        style={{ display: "block", width: "100%", minHeight: "100px" }}
        data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}