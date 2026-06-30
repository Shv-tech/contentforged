'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion, Variants } from 'framer-motion';
import { ArrowRight, Crosshair, ChevronLeft, ChevronRight } from 'lucide-react';
import { TOOL_ARSENAL_SECTION, TOOL_CATEGORIES } from '../../lib/landing-data';

const customEase = [0.16, 1, 0.3, 1] as any;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 1, ease: customEase },
  },
};

const FLAT_TOOLS = TOOL_CATEGORIES.flatMap((cat) =>
  cat.tools.map((tool) => ({ ...tool, category: cat.name }))
);

const CATEGORY_FILTERS = ['ALL', ...TOOL_CATEGORIES.map((c) => c.name)];

export default function ToolArsenal() {
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [activeIndex, setActiveIndex] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  const visibleTools = activeCategory === 'ALL' 
    ? FLAT_TOOLS 
    : FLAT_TOOLS.filter((t) => t.category === activeCategory);

  // Reset index when category changes
  useEffect(() => {
    setActiveIndex(0);
  }, [activeCategory]);

  const nextTool = () => setActiveIndex((prev) => (prev + 1) % visibleTools.length);
  const prevTool = () => setActiveIndex((prev) => (prev - 1 + visibleTools.length) % visibleTools.length);

  const scrollToPricing = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="tools" className="py-40 bg-[#000000] border-t border-white/[0.02] relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-[#d18a5e] opacity-[0.02] blur-[120px] rounded-[100%] pointer-events-none" />

      <div className="max-w-[1200px] mx-auto px-6 relative z-10">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          className="text-center mb-20"
        >
           
           {/* Drop this inside a relative section wrapper, behind the content */}
<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px] bg-[radial-gradient(ellipse_at_center,rgba(209,138,94,0.05)_0%,transparent_70%)] pointer-events-none blur-[80px] -z-10" />

          <motion.h2 variants={fadeUp} className="font-medium text-[44px] md:text-[64px] tracking-[-0.04em] leading-[1.05] mb-8 text-white/95">
            <span className="block">{TOOL_ARSENAL_SECTION.heading[0]}</span>
            <span className="block text-white/30">{TOOL_ARSENAL_SECTION.heading[1]}</span>
          </motion.h2>

          {/* Category filter pills - ultra minimal */}
          <motion.div variants={fadeUp} className="flex flex-wrap justify-center items-center gap-2 mt-12">
            {CATEGORY_FILTERS.map((cat) => {
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-5 py-2.5 rounded-full text-[11px] font-mono uppercase tracking-[0.15em] transition-all duration-500 ${
                    isActive
                      ? 'bg-white/[0.08] text-white/90 border border-white/[0.1] shadow-[0_0_20px_rgba(255,255,255,0.03)]'
                      : 'bg-transparent text-white/40 border border-transparent hover:text-white/70'
                  }`}
                >
                  {cat === 'ALL' ? `All Tools` : cat}
                </button>
              );
            })}
          </motion.div>
        </motion.div>

        {/* ─── THE FOCAL CAROUSEL ─── */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: customEase }}
          className="relative w-full h-[400px] flex items-center justify-center mt-10"
        >
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <AnimatePresence mode="popLayout">
              {visibleTools.map((tool, index) => {
                // Calculate spatial distance from active item
                let distance = index - activeIndex;
                // Handle wrap-around math for smooth infinite visual
                if (distance > visibleTools.length / 2) distance -= visibleTools.length;
                if (distance < -visibleTools.length / 2) distance += visibleTools.length;

                const isActive = distance === 0;
                const isCommandCenter = tool.category === 'COMMAND CENTER';

                // Physics logic
                const xOffset = distance * 320; // Distance between cards
                const scale = isActive ? 1 : Math.max(0.75, 1 - Math.abs(distance) * 0.15);
                const opacity = isActive ? 1 : Math.max(0, 0.4 - Math.abs(distance) * 0.2);
                const blur = isActive ? '0px' : `${Math.abs(distance) * 4}px`;
                const zIndex = 50 - Math.abs(distance);

                if (Math.abs(distance) > 2) return null; // Only render visible cards

                return (
                  <motion.div
                    key={tool.number}
                    layout={!prefersReducedMotion}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ 
                      x: xOffset, 
                      scale, 
                      opacity, 
                      filter: `blur(${blur})`,
                      zIndex 
                    }}
                    transition={{ duration: 0.7, ease: customEase }}
                    className={`absolute w-[340px] h-[280px] p-8 rounded-[24px] pointer-events-auto cursor-pointer transition-colors duration-500 flex flex-col ${
                      isActive 
                        ? (isCommandCenter ? 'bg-[#050505] border border-[#d18a5e]/30 shadow-[0_0_40px_rgba(209,138,94,0.1)]' : 'bg-[#050505] border border-white/[0.1] shadow-[0_20px_40px_rgba(0,0,0,0.8)]')
                        : 'bg-black border border-white/[0.02]'
                    }`}
                    onClick={() => setActiveIndex(index)}
                  >
                    <div className={`absolute -top-6 -right-2 font-mono font-medium text-[80px] leading-none select-none transition-colors duration-500 ${
                      isActive ? (isCommandCenter ? 'text-[#d18a5e]/10' : 'text-white/[0.03]') : 'text-transparent'
                    }`}>
                      {tool.number}
                    </div>

                    <div className="relative z-10 flex-1 flex flex-col">
                      <div className="flex items-center gap-2 mb-4">
                        <span className={`text-[10px] font-mono uppercase tracking-[0.2em] ${isActive ? (isCommandCenter ? 'text-[#d18a5e]' : 'text-white/40') : 'text-white/20'}`}>
                          {tool.category}
                        </span>
                        {isCommandCenter && isActive && <Crosshair className="w-3 h-3 text-[#d18a5e] opacity-80" />}
                      </div>
                      <h3 className={`font-medium text-[20px] mb-3 tracking-[-0.02em] transition-colors ${isActive ? 'text-white/95' : 'text-white/40'}`}>
                        {tool.name}
                      </h3>
                      <p className={`text-[14px] leading-[1.6] font-light transition-colors ${isActive ? 'text-white/50' : 'text-white/20'}`}>
                        {tool.description}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Controls */}
          <div className="absolute bottom-0 w-full flex justify-center gap-4 z-50">
             <button onClick={prevTool} className="w-12 h-12 rounded-full border border-white/[0.05] bg-white/[0.02] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.05] transition-all backdrop-blur-md">
               <ChevronLeft className="w-5 h-5" />
             </button>
             <button onClick={nextTool} className="w-12 h-12 rounded-full border border-white/[0.05] bg-white/[0.02] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.05] transition-all backdrop-blur-md">
               <ChevronRight className="w-5 h-5" />
             </button>
          </div>
        </motion.div>

        {/* See Pricing CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1 }}
          className="flex flex-col items-center mt-32"
        >
          <a
            href="#pricing"
            onClick={scrollToPricing}
            className="group flex items-center gap-3 text-[13px]  text-white/45 hover:text-white/90 transition-colors"
          >
            Access the Full Arsenal
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}