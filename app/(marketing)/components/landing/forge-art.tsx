// components/landing/forge-art.tsx
// Shared visual language for the landing page and the account page:
// generated artwork (layered light + film grain), small tags, section headings.

'use client';

import React from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';

export const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

export type Scene = 'forge' | 'dawn' | 'deep' | 'tide' | 'ink' | 'ember';

export const SCENES: Record<Scene, string[]> = {
  // Molten horizon, Forge's own colour.
  forge: [
    'radial-gradient(120% 70% at 50% 118%, #FFD3A1 0%, #FF8A2B 14%, #C2410C 30%, #3A0E02 52%, #070302 72%)',
    'radial-gradient(60% 30% at 50% 100%, rgba(255,240,220,0.9), rgba(255,180,90,0) 70%)',
    'linear-gradient(180deg, #05040A 0%, #0B0604 60%, #120703 100%)',
  ],
  // First light.
  dawn: [
    'radial-gradient(95% 75% at 20% 115%, #FBD3AE 0%, #E08452 22%, #7A3550 48%, #1E1230 75%)',
    'radial-gradient(50% 40% at 85% 15%, rgba(140,120,255,0.35), rgba(0,0,0,0) 70%)',
    'linear-gradient(160deg, #0E0B16, #1A1020)',
  ],
  // Deep blue, the colour of focus.
  deep: [
    'radial-gradient(70% 70% at 70% 30%, #4B5BFF 0%, #2A22B8 30%, #0E0A3A 60%, #04030F 85%)',
    'radial-gradient(40% 35% at 25% 80%, rgba(120,200,255,0.35), rgba(0,0,0,0) 70%)',
    'linear-gradient(180deg, #04030F, #07051A)',
  ],
  // Many voices: greens and golds.
  tide: [
    'radial-gradient(80% 60% at 30% 25%, #C8E6A0 0%, #4E9A6B 25%, #14453A 55%, #04130F 85%)',
    'radial-gradient(45% 40% at 80% 85%, rgba(255,200,110,0.45), rgba(0,0,0,0) 70%)',
    'linear-gradient(200deg, #04130F, #020806)',
  ],
  // Low light, for things that stay quiet.
  ink: [
    'radial-gradient(70% 60% at 50% 40%, #6B6B78 0%, #24242C 45%, #0A0A0E 80%)',
    'linear-gradient(180deg, #0A0A0E, #050507)',
  ],
  // A banked fire: darker, redder than forge.
  ember: [
    'radial-gradient(80% 65% at 75% 90%, #FF9D4D 0%, #D2461A 22%, #5C1407 50%, #120403 78%)',
    'radial-gradient(40% 35% at 15% 20%, rgba(255,120,60,0.25), rgba(0,0,0,0) 70%)',
    'linear-gradient(180deg, #0A0302, #140504)',
  ],
};

export function Artwork({
  scene, className = '', children, drift = false,
}: { scene: Scene; className?: string; children?: React.ReactNode; drift?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: SCENES[scene].join(',') }}>
      {drift && !reduce && (
        // Light that breathes, very slowly. Only used on the two hero moments.
        <motion.div
          aria-hidden
          className="absolute inset-[-20%]"
          style={{ background: 'radial-gradient(40% 30% at 50% 85%, rgba(255,214,170,0.35), rgba(0,0,0,0) 70%)' }}
          animate={{ x: ['-6%', '6%', '-6%'], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <div aria-hidden className="absolute inset-0 opacity-[0.22] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
      <div aria-hidden className="absolute inset-0 opacity-[0.10]" style={{ backgroundImage: GRAIN, backgroundSize: '140px' }} />
      {children}
    </div>
  );
}

export type PlateName = 'molten' | 'steel' | 'quench' | 'sparks' | 'ingot' | 'slag';

/**
 * The Forge plates: a series of generated material images (molten crust,
 * brushed steel, quench steam, sparks, liquid copper, slag) in
 * /public/assets/art. One visual world, used everywhere.
 */
export function Plate({
  name, className = '', children, priority = false, sizes = '(max-width: 768px) 100vw, 50vw', position = '50% 50%',
}: { name: PlateName; className?: string; children?: React.ReactNode; priority?: boolean; sizes?: string; position?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[#0A0605] ${className}`}>
      <Image src={`/assets/art/${name}.jpg`} alt="" fill sizes={sizes} priority={priority} className="object-cover" style={{ objectPosition: position }} />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/10" />
      {children}
    </div>
  );
}

export function Tag({ children, dot = '#FF8A2B' }: { children: React.ReactNode; dot?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-3 py-1.5 text-[12.5px] text-white/75 backdrop-blur-md">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      {children}
    </span>
  );
}

export const ink = 'text-[#0B0B0C]';
export const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black';
export const pillWhite =
  `inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] font-medium text-black transition hover:bg-white/85 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;
export const pillGhost =
  `inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3 text-[15px] font-medium text-white transition hover:border-white/30 hover:bg-white/[0.04] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;

/** Section heading: one confident line, an optional quieter second line, an optional lead. */
export function Heading({
  lines, lead, align = 'left', className = '',
}: { lines: string[]; lead?: string; align?: 'left' | 'center'; className?: string }) {
  return (
    <div className={`${align === 'center' ? 'mx-auto text-center' : ''} max-w-[1000px] ${className}`}>
      <h2 className="text-[40px] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-[64px]">
        {lines.map((l, i) => (
          <span key={i} className={`block ${i > 0 ? 'text-white/40' : ''}`}>{l}</span>
        ))}
      </h2>
      {lead && (
        <p className={`mt-6 text-[18px] leading-[1.55] text-white/55 sm:text-[20px] ${align === 'center' ? 'mx-auto' : ''} max-w-[620px]`}>
          {lead}
        </p>
      )}
    </div>
  );
}

/** Turns data labels like "PRO CREATOR" into "Pro creator" for display. */
export function sentence(s: string): string {
  const t = s.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
