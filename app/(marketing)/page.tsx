'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useScroll, useTransform, Variants } from 'framer-motion';
import { 
  Command, BrainCircuit, TrendingUp, GitBranch, AlertCircle, Sparkles, 
  Star, XCircle, CheckCircle2, LayoutDashboard, Type, Hash, FileText, 
  BarChart, Mail, Image as ImgIcon, Zap, Bot, User, Fingerprint, ArrowUp
} from 'lucide-react';
import toast from 'react-hot-toast';
import { CheckoutModal } from '@/components/CheckoutModal';
import Script from 'next/script';
import { useAppStore } from '@/lib/store';
import { PRICING } from '@/types';

// --- ANIMATION VARIANTS ---
const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.1 }
  }
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { type: "spring", stiffness: 100, damping: 20 } 
  }
};

const pulseRing: Variants = {
  hidden: { opacity: 0, scale: 0.5 },
  visible: { 
    opacity: [0, 0.5, 0], 
    scale: [0.8, 1.5, 2.5],
    transition: { repeat: Infinity, duration: 3, ease: "easeOut" }
  }
};

export default function LandingPage() {
  const router = useRouter();
  const [checkoutPlan, setCheckoutPlan] = useState<{ id: string, name: string, price: number } | null>(null);
  const { user, plan, setPlan } = useAppStore();
  const [mounted, setMounted] = useState(false);
  
  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const forgeOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-[#000000] text-[#a3a3a3] font-sans selection:bg-[#d18a5e]/30 overflow-x-hidden relative">
      
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

      {/* GLOBAL KEYFRAMES FOR MARQUEE & HOVER ANIMATIONS */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-marquee { display: flex; animation: marquee 30s linear infinite; white-space: nowrap; }
      `}} />

      {/* --- NAVIGATION --- */}
      <nav className="fixed top-0 w-full h-[72px] flex items-center justify-between px-6 md:px-12 z-50 bg-[#000000]/70 backdrop-blur-xl border-b border-[#222222]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[6px] bg-[#111111] border border-[#333333] flex items-center justify-center shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
            <Command className="w-4 h-4 text-[#d18a5e]" />
          </div>
          <span className="font-semibold text-[15px] text-[#ffffff] uppercase tracking-[0.15em]">
            ContentForge
          </span>
        </div>
        <div className="flex items-center gap-8">
          <a href="#how" className="text-[13px] font-medium text-[#888888] hover:text-[#ffffff] transition-colors hidden sm:block">Methodology</a>
          <a href="#pricing" className="text-[13px] font-medium text-[#888888] hover:text-[#ffffff] transition-colors hidden sm:block">Pricing</a>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <Link href="/account" className="text-[13px] font-medium text-[#a3a3a3] px-4 py-2 rounded-[4px] hover:bg-[#111111] hover:text-white transition-colors">
                  Account
                </Link>
                <Link href="/dashboard" className="bg-[#d18a5e] text-[#000000] text-[13px] font-bold px-5 py-2.5 rounded-[4px] hover:bg-[#e39a6e] transition-all shadow-[0_0_15px_rgba(209,138,94,0.3)]">
                  Workspace
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="text-[13px] font-medium text-[#a3a3a3] px-4 py-2 rounded-[4px] hover:bg-[#111111] hover:text-white transition-colors">
                  Log in
                </Link>
                <Link href="/signup" className="bg-[#d18a5e] text-[#000000] text-[13px] font-bold px-5 py-2.5 rounded-[4px] hover:bg-[#e39a6e] transition-all shadow-[0_0_15px_rgba(209,138,94,0.3)]">
                  Start Forging
                </Link>
              </>
            )}
          </div>
        </div>
        {/* Navigation Bottom Light Leak */}
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#333333] to-transparent opacity-50" />
      </nav>

      {/* --- HERO SECTION --- */}
      <section className="relative pt-32 pb-24 px-6 flex flex-col items-center text-center max-w-[1200px] mx-auto z-10 min-h-[90vh] justify-center">
        
        {/* Ambient "Forge" Glowing Background */}
        <motion.div 
          style={{ y: heroY, opacity: forgeOpacity }}
          className="absolute inset-0 pointer-events-none -z-10 flex justify-center items-center"
        >
          {/* Deep Core */}
          <motion.div 
            animate={{ scale: [1, 1.05, 1], opacity: [0.6, 0.8, 0.6] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="w-[600px] h-[600px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(209,138,94,0.15) 0%, rgba(0,0,0,0) 70%)', filter: 'blur(60px)' }}
          />
          {/* Blueprint Grid */}
          <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)', backgroundSize: '40px 40px', backgroundPosition: 'center top' }} />
        </motion.div>

        <motion.div 
          initial="hidden" animate="visible" variants={staggerContainer}
          className="flex flex-col items-center"
        >
          <motion.div variants={fadeUp} className="flex items-center gap-4 mb-8">
            <span className="w-12 h-[1px] bg-gradient-to-r from-transparent to-[#d18a5e]/50"></span>
            <div className="text-[#d18a5e] text-[12px] font-mono tracking-[0.2em] uppercase font-bold">
              The 1% Creator Command Center
            </div>
            <span className="w-12 h-[1px] bg-gradient-to-l from-transparent to-[#d18a5e]/50"></span>
          </motion.div>
          
          <motion.h1 variants={fadeUp} className="font-semibold text-[56px] md:text-[88px] tracking-tight text-[#ffffff] leading-[1.05] mb-8 max-w-[900px]">
            Your content is losing. <br />
            <span className="text-[#d18a5e] drop-shadow-[0_0_20px_rgba(209,138,94,0.4)]">Fix it.</span>
          </motion.h1>
          
          <motion.p variants={fadeUp} className="text-[18px] md:text-[20px] text-[#888888] max-w-[650px] leading-relaxed mb-12">
            Every other AI tool applauds your mediocre ideas. <strong className="text-[#e0e0e0] font-medium">ContentForge is the first one that won't.</strong> It diagnoses. It disagrees. It engineers virality.
          </motion.p>

          <motion.div variants={fadeUp} className="flex justify-center gap-4 relative z-10">
            <Link href={user ? "/dashboard" : "/signup"} className="group relative bg-[#d18a5e] text-[#000000] font-bold px-10 py-4 rounded-[4px] hover:bg-[#e39a6e] transition-all shadow-[0_0_30px_rgba(209,138,94,0.2)] text-[15px] overflow-hidden">
              <span className="relative z-10">{user ? "Enter Workspace" : "Start Forging"}</span>
              <div className="absolute inset-0 h-full w-full bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* --- DASHBOARD SHOWCASE (Overlapping Hero) --- */}
      <section className="relative pb-32 bg-transparent -mt-20 z-20">
        <motion.div 
          initial={{ opacity: 0, y: 100 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, type: "spring", bounce: 0.3 }}
          className="max-w-[1300px] mx-auto px-6 relative"
        >
          {/* EXACT DASHBOARD MOCKUP MATCHING THE SCREENSHOT */}
          <div className="w-full h-[750px] bg-[#050505] border border-[#222222] rounded-[16px] shadow-[0_40px_80px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(255,255,255,0.05)] flex overflow-hidden relative">
            
            {/* Dark Sidebar */}
            <div className="w-[280px] bg-[#000000] border-r border-[#1a1a1a] flex flex-col hidden md:flex z-10">
              <div className="h-20 flex items-center px-8 gap-4 border-b border-transparent">
                <div className="w-8 h-8 rounded-[6px] bg-[#111] border border-[#333] flex items-center justify-center shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
                  <Command className="w-4 h-4 text-[#d18a5e]" />
                </div>
                <span className="font-semibold text-[13px] text-[#ffffff] tracking-[0.15em] uppercase">ContentForge</span>
              </div>
              
              <div className="px-5 py-6">
                <div className="text-[10px] font-mono text-[#555] uppercase tracking-[0.2em] mb-4 pl-3">Pro Creator</div>
                <div className="flex items-center gap-4 px-3 py-3 rounded-[8px] text-[13px] font-medium text-[#888] hover:text-[#e0e0e0] hover:bg-[#111] transition-all cursor-pointer">
                  <BarChart className="w-4 h-4"/> Stop-Scroll Grader
                </div>
                <div className="flex items-center gap-4 px-3 py-3 rounded-[8px] text-[13px] font-medium text-[#888] hover:text-[#e0e0e0] hover:bg-[#111] transition-all cursor-pointer">
                  <Hash className="w-4 h-4"/> Shadowban Check
                </div>
              </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 bg-[#050505] flex flex-col relative overflow-hidden">
              
              {/* Deep Ambient Center Glow */}
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(209,138,94,0.07)_0%,transparent_60%)]" />

              {/* Top Header */}
              <div className="h-20 flex items-center px-8 z-10">
                <div className="flex items-center gap-3 bg-[#111] border border-[#222] px-4 py-2 rounded-[8px] shadow-sm">
                  <Sparkles className="w-4 h-4 text-[#d18a5e]"/>
                  <span className="text-[13px] font-medium text-[#ffffff]">Active Workspace</span>
                </div>
              </div>

              {/* Chat Thread */}
              <div className="flex-1 p-8 pt-4 relative z-10 flex flex-col gap-10">
                
                {/* User Message */}
                <div className="flex gap-4 max-w-3xl mx-auto w-full justify-end">
                  <div className="bg-[#111111] border border-[#222] text-[#a3a3a3] p-5 rounded-[12px] rounded-tr-[4px] text-[14px] leading-relaxed shadow-sm max-w-[85%]">
                    I want to announce my new AI model on LinkedIn. I want it to sound aggressive. Everyone is obsessed with scaling laws and compute, but I think they are dead wrong. Make it 2000 words.
                  </div>
                  <div className="w-9 h-9 rounded-full bg-[#111] border border-[#333] flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-[#666]"/>
                  </div>
                </div>

                {/* AI Message */}
                <div className="flex gap-4 max-w-3xl mx-auto w-full">
                  <div className="w-9 h-9 rounded-[8px] border border-[#d18a5e]/30 bg-[#d18a5e]/10 text-[#d18a5e] flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-4 h-4"/>
                  </div>
                  <div className="bg-transparent text-[15px] text-[#a3a3a3] leading-[1.6] p-1">
                    <strong className="text-[#ffffff] font-medium block mb-4 text-[16px]">Precision over verbosity.</strong>
                    2000 words is a manifesto, not a post. Start by refining your brand narrative. If you want to prove the maximalists wrong, you hit them with a sharp, information-theoretic hook.
                    
                    <div className="mt-6">
                      <span className="text-[#d18a5e] bg-[#d18a5e]/10 border border-[#d18a5e]/20 px-3 py-1.5 rounded-[6px] text-[12px] font-mono tracking-wide flex items-center gap-2 w-fit">
                        <Sparkles className="w-3 h-3" /> *Draft pushed to Live Canvas*
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Fake Input Bar */}
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-[700px] px-6 z-20">
                <div className="bg-[#0a0a0a] border border-[#222] rounded-full p-2 pl-6 flex items-center shadow-[0_20px_40px_rgba(0,0,0,0.8)]">
                  <div className="flex-1 text-[15px] text-[#555] font-medium">Ask Forge...</div>
                  <div className="flex items-center gap-4 pr-1">
                    <button className="w-8 h-8 flex items-center justify-center text-[#666]"><ImgIcon className="w-5 h-5"/></button>
                    <button className="w-10 h-10 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(209,138,94,0.3)]" style={{ background: 'radial-gradient(circle at center, #d18a5e 0%, #874e2b 100%)' }}>
                       <ArrowUp className="w-5 h-5 text-white stroke-[2.5px]"/>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* FLOATING CARD 1: Hook Analysis */}
          <motion.div 
            animate={{ y: [0, -10, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="hidden lg:block absolute top-32 -left-10 z-20 bg-[#0a0a0a] border border-[#222] rounded-[12px] p-6 shadow-[0_30px_60px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.05)] w-[300px]"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div>
              <span className="text-[10px] font-mono text-[#888] uppercase tracking-[0.2em]">Hook Analysis</span>
            </div>
            <p className="text-[13px] text-[#e0e0e0] leading-relaxed font-medium">
              "That hook is weak. It takes too long to get to the point. Cut the first sentence entirely and start directly with the core conflict."
            </p>
          </motion.div>

          {/* FLOATING CARD 2: Rule Violated */}
          <motion.div 
            animate={{ y: [0, 10, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            className="hidden lg:block absolute bottom-32 -right-10 z-20 bg-[#0a0a0a] border border-[#222] rounded-[12px] p-6 shadow-[0_30px_60px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.05)] w-[280px]"
          >
             <div className="text-[10px] font-mono text-[#d18a5e] uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
               <AlertCircle className="w-3.5 h-3.5"/> Rule Violated
             </div>
             <p className="text-[13px] text-[#a3a3a3] leading-relaxed">
               Using profanity as a gimmick signals weak content. Virality comes from tension, not cheap tricks.
             </p>
          </motion.div>
        </motion.div>
      </section>

      {/* --- THE PARADIGM --- */}
      <section className="py-32 bg-[#000000] border-t border-[#111] relative">
        <div className="max-w-[1200px] mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={staggerContainer}>
            <motion.div variants={fadeUp} className="text-[12px] font-mono text-[#d18a5e] uppercase tracking-[0.2em] mb-6 flex items-center gap-4">
              <span className="w-8 h-[1px] bg-gradient-to-r from-transparent to-[#d18a5e]"></span> The Problem
            </motion.div>
            <motion.h2 variants={fadeUp} className="font-semibold text-[48px] md:text-[64px] tracking-tight text-[#ffffff] leading-[1.05] mb-24">
              The internet is drowning <br/><span className="text-[#444]">in average.</span>
            </motion.h2>
            
            <div className="grid md:grid-cols-2 gap-x-16 gap-y-20">
              {[
                { num: '01', title: 'Your AI tells you what you want to hear.', desc: 'ChatGPT, Gemini, every other tool — trained to validate, agree, polish. They make your bad ideas sound better. They do not make them work.' },
                { num: '02', title: 'Generic content is invisible content.', desc: 'When everyone uses the same AI, everyone produces the same content. Same hooks. Same structure. Same generic advice.' },
                { num: '03', title: "Writing for all platforms. Reaching none.", desc: 'What works on LinkedIn kills on Twitter. What kills on Twitter gets ignored on Instagram. You need a platform-native brain.' },
                { num: '04', title: 'Every session starts from zero.', desc: 'Every other AI forgets you after each conversation. It never learns what your audience responds to. ContentForge compounds.' }
              ].map((prob, i) => (
                <motion.div variants={fadeUp} key={i} className="relative group">
                  <div className="absolute -inset-4 bg-gradient-to-r from-[#d18a5e]/0 via-[#d18a5e]/5 to-[#d18a5e]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[20px] blur-lg"></div>
                  
                  <div className="relative z-10">
                    <div className="font-mono font-bold text-[64px] text-[#111] leading-none mb-6 group-hover:text-[#d18a5e]/20 transition-colors duration-500">{prob.num}</div>
                    <h3 className="font-medium text-[22px] text-[#ffffff] mb-4">{prob.title}</h3>
                    <p className="text-[16px] text-[#888] leading-relaxed">{prob.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* --- THE ARCHITECTURE --- */}
      <section id="how" className="py-32 bg-[#020202] border-y border-[#111] relative overflow-hidden">
        <div className="max-w-[1200px] mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer}>
            <motion.div variants={fadeUp} className="text-[12px] font-mono text-[#666] uppercase tracking-[0.2em] mb-6 flex items-center gap-4">
              <span className="w-8 h-[1px] bg-gradient-to-r from-transparent to-[#666]"></span> The Architecture
            </motion.div>
            <motion.h2 variants={fadeUp} className="font-semibold text-[48px] md:text-[64px] tracking-tight text-[#ffffff] leading-[1.05] mb-24">
              Three systems. <br/><span className="text-[#666]">No other tool has.</span>
            </motion.h2>

            <div className="grid lg:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <motion.div variants={fadeUp} className="group relative p-8 bg-[#0a0a0a] border border-[#1a1a1a] rounded-[16px] overflow-hidden">
                <div className="absolute inset-0 opacity-10 font-mono text-[8px] leading-[10px] text-[#d18a5e] overflow-hidden flex flex-col justify-center select-none" style={{ maskImage: 'linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)' }}>
                  <motion.div animate={{ y: [0, -100] }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }}>
                    {[...Array(20)].map((_, i) => <div key={i}>01100010 01110010 01100001 01101110 01100100 00100000 01100100 01101110 01100001</div>)}
                  </motion.div>
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-[8px] bg-[#111] border border-[#333] flex items-center justify-center mb-8 shadow-[0_0_15px_rgba(0,0,0,0.5)] group-hover:border-[#d18a5e]/50 transition-colors">
                    <Fingerprint className="w-6 h-6 text-[#d18a5e]" strokeWidth={1.5} />
                  </div>
                  <h3 className="font-medium text-[20px] text-[#ffffff] mb-4">Brand DNA Protocol</h3>
                  <p className="text-[15px] text-[#888] leading-relaxed">On first interaction, FORGE extracts your entire content identity. Every future post is built around your specific strategic fingerprint.</p>
                </div>
              </motion.div>

              {/* Feature 2 */}
              <motion.div variants={fadeUp} className="group relative p-8 bg-[#0a0a0a] border border-[#1a1a1a] rounded-[16px] overflow-hidden">
                <div className="absolute top-12 right-12 flex items-center justify-center">
                  <motion.div variants={pulseRing} animate="visible" className="absolute w-24 h-24 rounded-full border border-[#d18a5e]/40" />
                  <motion.div variants={pulseRing} animate="visible" transition={{ delay: 1, repeat: Infinity, duration: 3 }} className="absolute w-24 h-24 rounded-full border border-[#d18a5e]/30" />
                  <div className="w-2 h-2 bg-[#d18a5e] rounded-full shadow-[0_0_10px_#d18a5e]"></div>
                </div>
                <div className="relative z-10 mt-16">
                  <h3 className="font-medium text-[20px] text-[#ffffff] mb-4">Performance Intelligence</h3>
                  <p className="text-[15px] text-[#888] leading-relaxed">Paste your analytics. FORGE runs a full Performance Autopsy — isolating the psychological mechanism. Your 10th post is measurably better than your 1st.</p>
                </div>
              </motion.div>

              {/* Feature 3 */}
              <motion.div variants={fadeUp} className="group relative p-8 bg-[#0a0a0a] border border-[#1a1a1a] rounded-[16px] overflow-hidden">
                <div className="absolute top-10 right-10 w-24 h-24 opacity-30 group-hover:opacity-60 transition-opacity">
                  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <motion.path d="M20 50 C 40 50, 40 20, 80 20" stroke="#d18a5e" strokeWidth="2" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} transition={{ duration: 1.5 }} />
                    <motion.path d="M20 50 C 40 50, 40 80, 80 80" stroke="#d18a5e" strokeWidth="2" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} transition={{ duration: 1.5 }} />
                    <circle cx="20" cy="50" r="4" fill="#d18a5e" />
                    <circle cx="80" cy="20" r="4" fill="#333" stroke="#d18a5e" strokeWidth="2" />
                    <circle cx="80" cy="80" r="4" fill="#333" stroke="#d18a5e" strokeWidth="2" />
                  </svg>
                </div>
                <div className="relative z-10 mt-16">
                  <h3 className="font-medium text-[20px] text-[#ffffff] mb-4">Content Tree Architecture</h3>
                  <p className="text-[15px] text-[#888] leading-relaxed">One idea becomes five. Every response includes a full Content Tree — your LinkedIn post, Twitter thread, and newsletter angle. All in one shot.</p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* --- PSYCHOLOGY MECHANISMS --- */}
      <section className="py-32 bg-[#000000] border-b border-[#111] overflow-hidden relative">
        <div className="max-w-[1200px] mx-auto px-6 grid lg:grid-cols-2 gap-20 items-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer}>
            <motion.div variants={fadeUp} className="text-[12px] font-mono text-[#d18a5e] uppercase tracking-[0.2em] mb-6 flex items-center gap-4">
              <span className="w-8 h-[1px] bg-gradient-to-r from-transparent to-[#d18a5e]"></span> The Psychology
            </motion.div>
            <motion.h2 variants={fadeUp} className="font-semibold text-[40px] md:text-[52px] tracking-tight text-[#ffffff] leading-[1.1] mb-12">
              Your content moves people or it doesn't exist.
            </motion.h2>
            <div className="space-y-4">
              {[
                { name: 'Zeigarnik Effect', desc: 'Open loops the brain is physiologically compelled to close. Deployed in every hook.' },
                { name: 'Identity Threat', desc: 'Content that challenges who someone thinks they are stops the scroll completely.' },
                { name: 'Social Proof Inversion', desc: 'Admitting failure publicly builds more trust than claiming success. Deployed strategically.' },
                { name: 'Specificity Bias', desc: '"3 years, 2 months" is more credible than "a long time." FORGE eliminates vagueness.' }
              ].map((item, i) => (
                <motion.div variants={fadeUp} key={i} className="flex gap-6 p-5 rounded-[12px] hover:bg-[#050505] border border-transparent hover:border-[#1a1a1a] transition-all group">
                  <div className="text-[12px] font-mono font-bold text-[#444] mt-1 group-hover:text-[#d18a5e] transition-colors">0{i+1}</div>
                  <div>
                    <h4 className="font-medium text-[17px] text-[#e0e0e0] mb-2">{item.name}</h4>
                    <p className="text-[15px] text-[#777] leading-relaxed">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
            className="bg-[#050505] border border-[#222] rounded-[16px] p-10 relative shadow-[0_20px_60px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.05)]"
          >
            <div className="absolute top-0 right-10 transform -translate-y-1/2 bg-[#111] border border-[#333] text-[#fff] text-[10px] font-mono uppercase tracking-[0.2em] px-4 py-2 rounded-[6px] shadow-sm">
              Stop-Scroll Grader
            </div>
            <div className="font-serif italic text-[22px] text-[#e0e0e0] leading-relaxed mb-8">
              "The model scored 94% on the benchmark. The benchmark was designed by the same lab that built the model. I'll leave the rest to you."
            </div>
            <div className="inline-block bg-[#1a0f0a] border border-[#4a2107] text-[#d18a5e] text-[10px] font-mono uppercase tracking-[0.2em] px-3 py-1.5 rounded-[4px] mb-10">
              Identity Threat + Curiosity Gap
            </div>
            
            <div className="space-y-6 border-t border-[#1a1a1a] pt-10">
              {[
                { label: 'Pattern Interrupt', score: '9/10', width: '90%' },
                { label: 'Curiosity Gap', score: '9.5/10', width: '95%' },
                { label: 'Emotional Charge', score: '8/10', width: '80%' },
              ].map((stat, i) => (
                <div key={i}>
                  <div className="flex justify-between text-[13px] font-medium text-[#777] mb-3">
                    <span>{stat.label}</span>
                    <span className="text-[#fff]">{stat.score}</span>
                  </div>
                  <div className="w-full h-1 bg-[#111] rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }} whileInView={{ width: stat.width }} transition={{ duration: 1, delay: 0.2 * i }}
                      className="h-full bg-[#d18a5e] rounded-full shadow-[0_0_10px_rgba(209,138,94,0.5)]" 
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* --- SOCIAL PROOF --- */}
      <section className="py-32 bg-[#000000] border-b border-[#111]">
        <div className="max-w-[1200px] mx-auto px-6">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer} className="text-center mb-20">
            <motion.div variants={fadeUp} className="text-[12px] font-mono text-[#666] uppercase tracking-[0.2em] mb-6 flex items-center justify-center gap-4">
              <span className="w-8 h-[1px] bg-gradient-to-r from-transparent to-[#666]"></span> Real Results <span className="w-8 h-[1px] bg-gradient-to-l from-transparent to-[#666]"></span>
            </motion.div>
            <motion.h2 variants={fadeUp} className="font-semibold text-[40px] md:text-[52px] tracking-tight text-[#ffffff] leading-[1.1]">
              They stopped asking for permission.
            </motion.h2>
          </motion.div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { metric: '22K', quote: "I gave it my last 3 posts. It told me why the second one flopped and built a replication pattern around the one that hit 22,000 impressions. My next post did 31K. It's learning.", name: 'Yuki Tanaka', title: 'No-Code Founder' },
              { metric: '44K', quote: "It told me my hook was going to get scrolled past before I even finished the sentence. The rewrite hit 44,000 impressions. No other tool has ever told me I was wrong.", name: 'Xi Lu', title: 'AI Researcher' },
              { metric: '3X', quote: "I'm a ghostwriter managing 8 clients. ContentForge tripled my output without adding a single hour to my week. The Brand DNA feature means every client sounds like themselves.", name: 'Mia Roth', title: 'Ghostwriter' }
            ].map((proof, i) => (
              <motion.div variants={fadeUp} key={i} className="p-10 bg-[#050505] border border-[#1a1a1a] rounded-[16px] relative group hover:border-[#333] transition-colors">
                <div className="absolute top-10 right-10 font-mono font-bold text-[36px] text-[#111] leading-none group-hover:text-[#222] transition-colors">{proof.metric}</div>
                <div className="flex gap-1 mb-8 relative z-10">
                  {[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-[#d18a5e] text-[#d18a5e]" />)}
                </div>
                <p className="text-[15px] text-[#a3a3a3] leading-relaxed mb-10 relative z-10">"{proof.quote}"</p>
                <div className="flex items-center gap-4 relative z-10">
                  <div className="w-10 h-10 rounded-[6px] bg-[#111] border border-[#333] flex items-center justify-center text-[#d18a5e] font-bold text-[13px]">
                    {proof.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <div className="font-medium text-[14px] text-[#ffffff]">{proof.name}</div>
                    <div className="text-[12px] text-[#666] mt-0.5">{proof.title}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* --- PRICING --- */}
      <section id="pricing" className="py-32 bg-[#000000] border-b border-[#111]">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-center max-w-[600px] mx-auto mb-20">
            <div className="text-[12px] font-mono text-[#d18a5e] uppercase tracking-[0.2em] mb-4 flex items-center gap-4 justify-center animate-pulse">
              <span className="w-8 h-[1px] bg-gradient-to-r from-transparent to-[#d18a5e]"></span><h3>MASSIVE LAUNCH WEEK DISCOUNT</h3><span className="w-8 h-[1px] bg-gradient-to-l from-transparent to-[#d18a5e]"></span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-[1050px] mx-auto">
            {PRICING.map((tier) => (
              <div key={tier.id} className={`bg-[#050505] rounded-[16px] p-10 flex flex-col relative transition-all duration-300 ${tier.highlighted ? 'border border-[#d18a5e]/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_40px_rgba(209,138,94,0.1)] scale-105 z-10' : 'border border-[#222] shadow-sm hover:border-[#444]'}`}>
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#d18a5e] text-[#000] text-[10px] font-mono font-bold uppercase tracking-[0.2em] px-4 py-1.5 rounded-[4px] shadow-[0_0_15px_rgba(209,138,94,0.4)]">
                    Most Popular
                  </div>
                )}
                
                <h3 className="font-semibold text-[13px] text-[#fff] uppercase tracking-[0.15em] mb-4">{tier.name}</h3>
                
                <div className="mb-10 flex flex-col">
                  {(tier.originalPrice && tier.discount) && (
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-[16px] text-[#555] line-through font-medium decoration-[#333]">
                        ${tier.originalPrice}
                      </span>
                      <span className="text-[10px] font-mono font-bold bg-[#1a0f0a] border border-[#4a2107] text-[#d18a5e] px-2 py-0.5 rounded-[4px] uppercase tracking-[0.1em]">
                        Save {tier.discount}
                      </span>
                    </div>
                  )}
                  <div className="flex items-baseline">
                    <span className="font-semibold text-[56px] tracking-tight text-[#ffffff] leading-none">${tier.price}</span>
                    <span className="text-[14px] text-[#666] ml-2">/ mo</span>
                  </div>
                </div>
                
                <ul className="space-y-5 flex-1 mb-10">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-4 text-[14px] text-[#a3a3a3] leading-relaxed">
                      <Zap className="w-4 h-4 text-[#d18a5e] mt-[2px] flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                
                <button 
                  onClick={() => {
                    if (!user) {
                      toast.error("Please create your account to upgrade.");
                      router.push("/signup");
                      return;
                    }
                    setCheckoutPlan({ id: tier.id, name: tier.name, price: Number(tier.price) });
                  }}
                  className={`text-center py-4 px-6 rounded-[4px] font-bold text-[14px] transition-all w-full mt-auto ${
                    tier.highlighted ? 'bg-[#d18a5e] text-[#000] hover:bg-[#e39a6e] shadow-[0_0_20px_rgba(209,138,94,0.2)]' : 'bg-[#111] border border-[#333] text-[#fff] hover:bg-[#1a1a1a]'
                  }`}
                >
                  Unlock {tier.name}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- FINAL CTA --- */}
      <section className="py-40 bg-[#000000] text-center px-6 relative overflow-hidden flex flex-col justify-center min-h-[60vh]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_100%,rgba(209,138,94,0.15)_0%,transparent_70%)] pointer-events-none"></div>
        
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer} className="relative z-10">
          <motion.h2 variants={fadeUp} className="font-semibold text-[56px] md:text-[80px] tracking-tight text-[#ffffff] leading-[1.05] mb-8">
            Stop writing <span className="text-[#444]">forgettable</span><br/>content.
          </motion.h2>
          <motion.p variants={fadeUp} className="text-[18px] md:text-[20px] text-[#888] max-w-[550px] mx-auto mb-12">
            Your ideas are better than your current output. ContentForge closes that gap today.
          </motion.p>
          <motion.div variants={fadeUp}>
             <Link href={user ? "/dashboard" : "/signup"} className="inline-block bg-[#d18a5e] text-[#000000] font-bold px-12 py-4 rounded-[4px] hover:bg-[#e39a6e] transition-all shadow-[0_0_30px_rgba(209,138,94,0.25)] text-[16px]">
               Start Forging
             </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="py-12 bg-[#000000] border-t border-[#111]">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="font-semibold text-[14px] tracking-[0.15em] text-[#ffffff] uppercase font-sans">
            ContentForge
          </div>
          <div className="flex gap-8">
            <a href="/privacy" className="text-[13px] text-[#666] hover:text-[#fff] font-medium transition-colors">Privacy</a>
            <a href="/terms" className="text-[13px] text-[#666] hover:text-[#fff] font-medium transition-colors">Terms</a>
            <a href="mailto:contact@shvgroups.com" className="text-[13px] text-[#666] hover:text-[#fff] font-medium transition-colors">
              Support
            </a>
          </div>
          <p className="text-[12px] text-[#444] font-medium">
            © 2026 ContentForge by SHV Groups.
          </p>
        </div>
      </footer>
    </main>
  );
}