'use client';

import Link from 'next/link';
import { motion, useScroll, useTransform, useReducedMotion, Variants, useMotionValue, useSpring } from 'framer-motion';
import { 
  ArrowRight, 
  Menu, 
  MessageSquarePlus, 
  Search, 
  Book, 
  Calendar, 
  Settings, 
  Plus, 
  ArrowUp, 
  PanelRight 
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { HERO } from '../../lib/landing-data';
import { MouseEvent } from 'react';

// Cinematic cubic-bezier easing
const customEase = [0.16, 1, 0.3, 1] as any;

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 1, ease: customEase },
  },
};

const lineReveal: Variants = {
  hidden: { opacity: 0, y: '0.6em', filter: 'blur(8px)', clipPath: 'inset(0 0 100% 0)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    clipPath: 'inset(0 0 -100% 0)',
    transition: { duration: 1.2, ease: customEase },
  },
};

export default function HeroSection() {
  const { user } = useAppStore();
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  
  // Fade out the hero core on scroll
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 150]);

  // 3D Tilt Logic for the Dashboard
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const mouseXSpring = useSpring(mouseX, { stiffness: 100, damping: 30 });
  const mouseYSpring = useSpring(mouseY, { stiffness: 100, damping: 30 });
  
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ['4deg', '-4deg']);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ['-4deg', '4deg']);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (prefersReducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mouseX.set(x / width - 0.5);
    mouseY.set(y / height - 0.5);
  };

  const scrollToHow = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative pt-40 px-6 flex flex-col items-center text-center max-w-[1200px] mx-auto z-10 overflow-hidden">
      
      {/* --- THE OMNI-CORE (Video Background) --- */}
<motion.div
  style={{ y: heroY, opacity: heroOpacity }}
  className="absolute inset-0 pointer-events-none -z-10 flex justify-center items-center overflow-hidden"
>
  <video 
  autoPlay 
  loop 
  muted 
  playsInline 
  // Changed positioning here to pull it UP behind the headline
  className="w-[1200px] h-[1200px] max-w-none object-cover opacity-55 mix-blend-screen absolute top-[30%] left-1/2 -translate-x-1/2 -translate-y-[30%]"
  style={{ 
    maskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
    WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 70%)'
  }} 
>
  <source src="/assets/video4.mp4" type="video/mp4" />
</video>

        {/* Fallback ambient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#d18a5e] rounded-full opacity-[0.03] blur-[100px]" />
      </motion.div>

      {/* --- HEADLINE BLOCK --- */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="flex flex-col items-center relative z-20"
      >
        

        <h1 className="font-medium text-[52px] md:text-[90px] tracking-[-0.04em] text-white/95 leading-[1.05] mb-8 max-w-[1000px]">
          {HERO.headlineLines.map((line, i) => (
            <motion.span
              key={line}
              variants={lineReveal}
              className={
                i === HERO.headlineLines.length - 1
                  ? 'block text-[#d18a5e] drop-shadow-[0_0_30px_rgba(209,138,94,0.15)]'
                  : 'block'
              }
            >
              {line}
            </motion.span>
          ))}
        </h1>

        <motion.p
          variants={fadeUp}
          className="text-[18px] md:text-[20px] text-white/95 max-w-[680px] leading-relaxed mb-14 font-light"
        >
          {HERO.subheadline}
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="flex flex-col sm:flex-row items-center justify-center gap-6 relative z-10 mb-12"
        >
          <Link
            href={user ? '/dashboard' : '/signup'}
            className="group relative inline-flex items-center gap-3 bg-white/[0.03] border border-white/[0.08] text-white font-medium px-8 py-4 rounded-full hover:bg-white/[0.08] transition-colors duration-300 backdrop-blur-md"
          >
            <span>{user ? 'Enter Workspace' : HERO.ctaPrimary}</span>
            <ArrowRight className="w-4 h-4 text-white/60 transition-transform group-hover:translate-x-1 group-hover:text-white" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-[1px] bg-gradient-to-r from-transparent via-[#d18a5e]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          </Link>

          <a
            href="#how"
            onClick={scrollToHow}
            className="inline-flex items-center gap-2 text-[14px] font-medium text-white/40 hover:text-white/80 transition-colors px-2 py-4"
          >
            {HERO.ctaSecondary}
          </a>
        </motion.div>
      </motion.div>

      

      {/* --- 3D FLOATING DASHBOARD SHOWCASE --- */}
      <motion.div
        initial={{ opacity: 0, y: 80 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 1.2, ease: customEase }}
        className="w-full max-w-[1200px] relative pb-40 perspective-[2000px]"
        onMouseMove={handleMouseMove}
      >
        <motion.div 
          style={{ rotateX, rotateY }}
          className="w-full h-[700px] bg-black/40 backdrop-blur-2xl border border-white/[0.08] rounded-[24px] shadow-[0_40px_80px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.1)] flex overflow-hidden relative text-left font-sans"
        >{/* The "Glass" shine: A subtle top-border highlight */}
           <div className="absolute inset-10 bg-gradient-to-b from-white/[20] to-transparent pointer-events-none" />
          
          {/* Sidebar */}
          <div className="w-[280px] bg-[#050505] border-r border-white/[0.04] hidden md:flex flex-col z-10 shrink-0">
            <div className="p-6 flex justify-end">
              <Menu className="w-5 h-5 text-white/40" />
            </div>
            
            <div className="px-4 space-y-1.5">
              <div className="flex items-center gap-3 px-3 py-2.5 bg-white/[0.06] rounded-[8px] text-white/90 text-[13px] font-medium border border-white/[0.02]">
                <MessageSquarePlus className="w-4 h-4 text-white/70" />
                New chat
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5 text-white/50 text-[13px] hover:text-white/80 transition-colors">
                <Search className="w-4 h-4" /> Search chat
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5 text-white/50 text-[13px] hover:text-white/80 transition-colors">
                <Book className="w-4 h-4" /> My Ebooks
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5 text-white/50 text-[13px] hover:text-white/80 transition-colors">
                <Calendar className="w-4 h-4" /> Calendar
              </div>
            </div>

            <div className="mt-8 px-7">
              <span className="text-[10px] text-white/30 uppercase tracking-[0.1em] font-medium">Recents</span>
            </div>
            
            <div className="mt-3 px-4 flex-1 overflow-hidden space-y-1">
              {[
                'New Workspace', 
                'hey how are youDocument ...', 
                'heyDocument Analysis', 
                'Is A/B testing really worth it...', 
                'New Workspace', 
                'say sorry to me mDocumen...', 
                'make ebook how to find a g...'
              ].map((item, i) => (
                 <div key={i} className="px-3 py-2 text-[12px] text-white/40 whitespace-nowrap overflow-hidden text-ellipsis hover:text-white/80 cursor-default">
                   {item}
                 </div>
              ))}
            </div>

            {/* User Profile Footer */}
            <div className="p-4">
              <div className="flex items-center gap-3 bg-[#0a0a0a] border border-white/[0.04] p-3 rounded-[12px]">
                <div className="w-9 h-9 rounded-[8px] bg-[#d18a5e]/10 text-[#d18a5e] flex items-center justify-center text-[13px] font-medium shrink-0">
                  C
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="text-[13px] text-white/90 font-medium truncate">YOU</div>
                  <div className="text-[10px] text-white/40 tracking-wider uppercase mt-0.5">PRO</div>
                </div>
                <Settings className="w-4 h-4 text-white/40 shrink-0" />
              </div>
            </div>
          </div>

          {/* Main Canvas Area */}
          <div className="flex-1 bg-[#000] relative flex flex-col items-center justify-center overflow-hidden">
            
            {/* Immersive Center Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-[#d18a5e] opacity-[0.07] blur-[120px] rounded-full pointer-events-none" />
            
            {/* Top Right Panel Icon */}
            <div className="absolute top-6 right-6 w-9 h-9 rounded-full border border-white/[0.05] flex items-center justify-center bg-white/[0.02]">
              <PanelRight className="w-4 h-4 text-white/50" />
            </div>

            {/* Center Text */}
            <h2 className="text-[28px] md:text-[34px] text-white/95 font-medium tracking-tight mb-[140px] relative z-10">
              The canvas is yours, Yes YOU!
            </h2>

            {/* Bottom Input UI */}
            <div className="absolute bottom-12 w-full max-w-[640px] px-6">
              <div className="flex items-center gap-3 mb-5">
                <button className="w-11 h-11 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0">
                  <Plus className="w-5 h-5" />
                </button>
                <div className="flex-1 h-12 bg-white/[0.03] border border-white/[0.06] rounded-full flex items-center px-5 relative group transition-colors hover:border-white/[0.1]">
                  <span className="text-white/40 text-[14px]">Ask Forge...</span>
                  <button className="absolute right-1.5 w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center text-white/50 group-hover:text-white transition-colors">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-center gap-8 text-[12.5px] text-white/40">
                <span className="hover:text-white/80 transition-colors cursor-default">Write Ebook</span>
                <span className="hover:text-white/80 transition-colors cursor-default">Content Analysis</span>
                <span className="hover:text-white/80 transition-colors cursor-default">Linkedin post</span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>


        {/* --- SOCIAL PROOF MARQUEE --- */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, ease: customEase }}
        className="w-full max-w-[1200px] mb-32 relative z-10"
      >
        <p className="text-[11px] text-white/30 font-mono uppercase tracking-[0.2em] mb-8">
          {HERO.socialProofLabel}
        </p>
        <div
  className="relative overflow-hidden flex items-center"
  style={{
    maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
    WebkitMaskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
  }}
>
  <div className="flex animate-[cf-marquee_40s_linear_infinite] whitespace-nowrap gap-24 items-center opacity-40">
    {[...HERO.logos, ...HERO.logos].map((logo, i) => (
      <div key={`${logo.name}-${i}`} className="flex items-center gap-3">
        <img 
          src={logo.src} 
          alt={logo.name} 
          className="h-6 w-auto object-contain brightness-0 invert opacity-70 hover:opacity-100 transition-opacity duration-300" 
        />
        <span className="text-[16px] font-medium text-white tracking-tight">
          {logo.displayName}
        </span>
      </div>
    ))}
  </div>
</div>
      </motion.div>


      <style jsx global>{`
        @keyframes cf-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </section>
  );
}