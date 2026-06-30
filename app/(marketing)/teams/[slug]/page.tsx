'use client';

import { notFound } from 'next/navigation';
import { motion } from 'framer-motion';
import { TEAMS_DATA } from '../../lib/teams-data';

export default function TeamPage({ params }: { params: { slug: string } }) {
  const data = TEAMS_DATA[params.slug];

  if (!data) {
    notFound();
  }

  const Icon = data.icon;

  return (
    <div className="min-h-screen bg-black text-white selection:bg-[#d18a5e]/30 pt-32 pb-24 relative overflow-hidden flex flex-col items-center">
      
      {/* Structural Background Graphic (The Deep-Tech Grid) */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)] pointer-events-none -z-10" />
      
      {/* Ambient Copper Light */}
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(209,138,94,0.08)_0%,transparent_70%)] pointer-events-none blur-[80px] -z-10" />

      <main className="w-full max-w-[1000px] px-6 relative z-10 flex flex-col items-center text-center">
        
        {/* Eyebrow & Icon */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-3 mb-8"
        >
          <div className="w-8 h-8 rounded-full border border-[#d18a5e]/30 bg-[#d18a5e]/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-[#d18a5e]" />
          </div>
          
        </motion.div>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-[800px] mb-8"
        >
          <h1 className="text-5xl md:text-7xl font-medium tracking-tight text-white leading-[1.1]">
            {data.headline}
          </h1>
        </motion.div>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="text-lg md:text-xl text-white/50 max-w-[650px] leading-relaxed mb-20 font-light"
        >
          {data.subheadline}
        </motion.p>

        {/* Architectural Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left">
          {data.features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 + (i * 0.1), ease: [0.16, 1, 0.3, 1] }}
              className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.05] p-8 rounded-[24px] hover:bg-white/[0.04] transition-colors duration-500 flex flex-col justify-between group"
            >
              <div>
                <div className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/[0.08] flex items-center justify-center mb-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
                  <span className="text-white/40 font-mono text-xs">0{i + 1}</span>
                </div>
                <h3 className="text-xl font-medium text-white mb-3 tracking-tight">
                  {feature.title}
                </h3>
                <p className="text-sm text-white/40 leading-relaxed font-light group-hover:text-white/60 transition-colors duration-500">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Call to Action Wrapper */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.8 }}
          className="mt-24"
        >
          <button className="h-12 px-8 rounded-full bg-white/[0.03] border border-white/[0.08] text-sm text-white hover:bg-white/[0.08] transition-all duration-300 flex items-center gap-3 backdrop-blur-md">
            Start Forging 
            <span className="text-white/30 group-hover:translate-x-1 transition-transform">→</span>
          </button>
        </motion.div>

      </main>
    </div>
  );
}