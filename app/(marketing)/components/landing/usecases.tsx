'use client';

import { useState } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { User, Users, Rocket, Building2 } from 'lucide-react';
import { USE_CASES_SECTION, USE_CASES, UseCaseTab } from '../../lib/landing-data';

const customEase = [0.16, 1, 0.3, 1] as any;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 1, ease: customEase } },
};

const TAB_ICONS: Record<string, React.ElementType> = {
  creators: User,
  ghostwriters: Users,
  founders: Rocket,
  enterprise: Building2,
};

export default function UseCases() {
  const [activeId, setActiveId] = useState<string>(USE_CASES[0].id);
  const active = USE_CASES.find((t) => t.id === activeId) as UseCaseTab;

  return (
    <section className="py-40 bg-[#000000] border-t border-white/[0.02] relative">
      <div className="max-w-[1200px] mx-auto px-6 relative z-10">
        
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          className="mb-20"
        >
          
          
          <motion.h2 variants={fadeUp} className="font-medium text-[44px] md:text-[64px] tracking-[-0.04em] leading-[1.05] text-white/95 max-w-[800px]">
            <span className="block">{USE_CASES_SECTION.heading[0]}</span> 
            <span className="block text-white/30">{USE_CASES_SECTION.heading[1]}</span>
          </motion.h2>
        </motion.div>

        {/* Spatial Tab Selector */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: customEase }}
          className="flex flex-wrap gap-4 mb-16 border-b border-white/[0.05] pb-4"
        >
          {USE_CASES.map((tab) => {
            const Icon = TAB_ICONS[tab.id] ?? User;
            const isActive = tab.id === activeId;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveId(tab.id)}
                className={`relative flex items-center gap-3 px-2 py-3 text-[14px] font-medium transition-colors duration-500 ${
                  isActive ? 'text-white/95' : 'text-white/30 hover:text-white/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#d18a5e]' : ''}`} />
                {tab.audience}
                {isActive && (
                  <motion.span
                    layoutId="use-case-spatial-underline"
                    className="absolute left-0 right-0 -bottom-[17px] h-[2px] bg-[#d18a5e] shadow-[0_0_12px_rgba(209,138,94,0.8)]"
                    transition={{ duration: 0.6, ease: customEase }}
                  />
                )}
              </button>
            );
          })}
        </motion.div>

        {/* Spatial Content Panel */}
        <div className="relative min-h-[300px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={active.id}
              initial={{ opacity: 0, y: 15, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -15, filter: 'blur(4px)' }}
              transition={{ duration: 0.5, ease: customEase }}
              className="grid lg:grid-cols-12 gap-16 items-start"
            >
              <div className="lg:col-span-5">
                <h3 className="font-medium text-[28px] md:text-[34px] text-white/95 leading-[1.1] tracking-[-0.02em] mb-6">
                  {active.headline}
                </h3>
                <p className="text-[16px] text-white/40 leading-[1.7] font-light pr-8">
                  {active.body}
                </p>
              </div>

              <div className="lg:col-span-7 bg-white/[0.02] border border-white/[0.04] rounded-[24px] p-10 relative overflow-hidden group">
                {/* Subtle corner light catch */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-white/[0.03] blur-[40px] rounded-full group-hover:bg-[#d18a5e]/10 transition-colors duration-700 pointer-events-none" />
                
                <div className="text-[10px] font-mono text-white/30 uppercase tracking-[0.2em] mb-8">
                  The Architecture
                </div>
                <ul className="space-y-5">
                  {active.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-4 text-[15px] text-white/70 font-light leading-[1.6]">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#d18a5e] mt-2 shrink-0 opacity-60 shadow-[0_0_8px_rgba(209,138,94,0.6)]" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}