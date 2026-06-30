'use client';

import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';
import { TESTIMONIALS_SECTION, TESTIMONIALS } from '../../lib/landing-data';

const customEase = [0.16, 1, 0.3, 1] as any;

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('');
}

export default function Testimonials() {
  // Duplicate arrays to create the infinite scroll effect
  const rowOne = [...TESTIMONIALS, ...TESTIMONIALS];
  const rowTwo = [...TESTIMONIALS].reverse();
  const rowTwoDuplicated = [...rowTwo, ...rowTwo];

  return (
    <section className="py-40 bg-[#000000] border-t border-white/[0.02] relative overflow-hidden">
      
      <div className="max-w-[1200px] mx-auto px-6 relative z-10 mb-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 1, ease: customEase }}
          className="text-center"
        >
          
          <h2 className="font-medium text-[44px] md:text-[64px] tracking-[-0.04em] leading-[1.05] text-white/95">
            {TESTIMONIALS_SECTION.heading}
          </h2>
        </motion.div>
      </div>

      {/* ─── THE ENDLESS MARQUEES ─── */}
      <div className="relative w-full flex flex-col gap-12 group/marquee">
        
        {/* Massive fade masks on left and right to dissolve text into the void */}
        <div className="absolute inset-y-0 left-0 w-[20vw] bg-gradient-to-r from-black to-transparent z-20 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-[20vw] bg-gradient-to-l from-black to-transparent z-20 pointer-events-none" />

        {/* Row 1 (Moves Left) */}
        <div className="flex w-fit animate-[cf-marquee_60s_linear_infinite] hover:[animation-play-state:paused] gap-12 px-6">
          {rowOne.map((t, i) => (
            <div 
              key={`${t.name}-${i}`} 
              className="w-[500px] relative shrink-0 group/card opacity-40 hover:opacity-100 transition-opacity duration-500 cursor-default"
            >
              <Quote className="absolute -top-4 -left-4 w-12 h-12 text-[#d18a5e] opacity-20 pointer-events-none transition-opacity group-hover/card:opacity-40" />
              <p className="text-[18px] text-white/70 leading-[1.7] font-light mb-8 relative z-10 transition-colors group-hover/card:text-white/95">
                "{t.quote}"
              </p>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/[0.05] flex items-center justify-center text-white/50 font-mono text-[11px] uppercase tracking-wider">
                  {initials(t.name)}
                </div>
                <div>
                  <div className="font-medium text-[14px] text-white/80">{t.name}</div>
                  <div className="text-[12px] text-white/40">{t.title}</div>
                </div>
                <div className="ml-auto text-[11px] font-mono text-[#d18a5e] tracking-[0.1em] opacity-50 group-hover/card:opacity-100 transition-opacity">
                  {t.metric}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Row 2 (Moves Right) */}
        <div className="flex w-fit animate-[cf-marquee-reverse_70s_linear_infinite] hover:[animation-play-state:paused] gap-12 px-6 mt-4">
          {rowTwoDuplicated.map((t, i) => (
            <div 
              key={`rev-${t.name}-${i}`} 
              className="w-[500px] relative shrink-0 group/card opacity-40 hover:opacity-100 transition-opacity duration-500 cursor-default"
            >
              <Quote className="absolute -top-4 -left-4 w-12 h-12 text-[#d18a5e] opacity-20 pointer-events-none transition-opacity group-hover/card:opacity-40" />
              <p className="text-[18px] text-white/70 leading-[1.7] font-light mb-8 relative z-10 transition-colors group-hover/card:text-white/95">
                "{t.quote}"
              </p>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/[0.05] flex items-center justify-center text-white/50 font-mono text-[11px] uppercase tracking-wider">
                  {initials(t.name)}
                </div>
                <div>
                  <div className="font-medium text-[14px] text-white/80">{t.name}</div>
                  <div className="text-[12px] text-white/40">{t.title}</div>
                </div>
                <div className="ml-auto text-[11px] font-mono text-[#d18a5e] tracking-[0.1em] opacity-50 group-hover/card:opacity-100 transition-opacity">
                  {t.metric}
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>

      <style jsx global>{`
        @keyframes cf-marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes cf-marquee-reverse { 0% { transform: translateX(-50%); } 100% { transform: translateX(0); } }
      `}</style>
    </section>
  );
}