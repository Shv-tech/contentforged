'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Command, BrainCircuit, TrendingUp, GitBranch, AlertCircle, Sparkles, Star, XCircle, CheckCircle2, Cpu, Network, ExternalLink, Bot, User, LayoutDashboard, Type, Hash, FileText, BarChart, Mail, Image as ImgIcon, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { CheckoutModal } from '@/components/CheckoutModal';
import Script from 'next/script';
import { useAppStore } from '@/lib/store';

// Defined locally to enforce the $1 price drop for Unlimited
const PRICING = [
  { id: 'free', name: 'Free Trial', price: '0', features: ['3 days full access', 'Strategist Desk', 'Brand DNA Protocol', 'No API Key required'], highlighted: false },
  { id: 'tier1', name: 'Starter', price: '19', features: ['Bring Your Own Key', 'Brand DNA Protocol', 'Stop-Scroll Grader', 'Standard Output Trees'], highlighted: false },
  { id: 'tier3', name: 'Unlimited', price: '1', features: ['Everything in Starter', 'Ghostwriter Voice Clone', 'Zero-Cost Outreach', 'Multi-Brand Workspace'], highlighted: true },
];

export default function LandingPage() {
  const router = useRouter();
  const [checkoutPlan, setCheckoutPlan] = useState<{ id: string, name: string, price: number } | null>(null);
  
  // Pull the authenticated user and plan setter from your global store
  const { user, setPlan } = useAppStore(); 

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-gray-900 font-sans selection:bg-gray-200 overflow-x-hidden">
      
      {/* LOAD RAZORPAY SECURELY */}
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      {/* SECURE CHECKOUT MODAL OVERLAY */}
      {checkoutPlan && (
        <CheckoutModal 
          planId={checkoutPlan.id}
          planName={checkoutPlan.name}
          basePrice={checkoutPlan.price}
          onClose={() => setCheckoutPlan(null)}
          onSuccess={() => {
            setPlan(checkoutPlan.id as any); // Optimistically upgrade user in local state
            setCheckoutPlan(null); // Close modal
          }}
        />
      )}

      {/* GLOBAL KEYFRAMES FOR MARQUEE & HOVER ANIMATIONS */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-marquee { display: flex; animation: marquee 30s linear infinite; white-space: nowrap; }
        @keyframes float { 0% { transform: translateY(0px) rotate(var(--r)); } 50% { transform: translateY(-10px) rotate(var(--r)); } 100% { transform: translateY(0px) rotate(var(--r)); } }
        .animate-float-1 { animation: float 6s ease-in-out infinite; --r: -3deg; }
        .animate-float-2 { animation: float 7s ease-in-out infinite reverse; --r: 2deg; }
        .animate-float-3 { animation: float 8s ease-in-out infinite; --r: -1deg; }
      `}} />

      {/* NAVIGATION */}
      <nav className="fixed top-0 w-full h-[72px] flex items-center justify-between px-6 md:px-12 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-gray-900 flex items-center justify-center">
            <Command className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-[16px] tracking-tight text-gray-900 uppercase tracking-widest">
            ContentForge
          </span>
        </div>
        <div className="flex items-center gap-8">
          <a href="#how" className="text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors hidden sm:block">Methodology</a>
          <a href="#pricing" className="text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors hidden sm:block">Pricing</a>
          <div className="flex items-center gap-4">
            {user ? (
              // DYNAMIC AUTH STATE: User is logged in
              <Link href="/dashboard" className="bg-gray-900 text-white text-[13px] font-medium px-5 py-2.5 rounded-lg hover:bg-gray-800 transition-colors shadow-sm">
                Go to Workspace
              </Link>
            ) : (
              // User is NOT logged in
              <>
                <Link href="/login" className="text-[13px] font-medium text-gray-600 hover:text-gray-900 transition-colors">
                  Log in
                </Link>
                <Link href="/signup" className="bg-gray-900 text-white text-[13px] font-medium px-5 py-2.5 rounded-lg hover:bg-gray-800 transition-colors shadow-sm">
                  Unlock Workspace
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ANNOUNCEMENT TICKER */}
      <div className="mt-[72px] bg-gray-100 border-b border-gray-200 overflow-hidden h-[36px] flex items-center">
        <div className="animate-marquee">
          {[...Array(6)].map((_, i) => (
            <span key={i} className="text-[11px] font-medium text-gray-500 uppercase tracking-widest px-8 flex items-center gap-8">
              The AI that disagrees with you <span className="w-1 h-1 bg-gray-300 rounded-full" /> 
              Stop-Scroll Grader <span className="w-1 h-1 bg-gray-300 rounded-full" />
              Content Tree Architecture <span className="w-1 h-1 bg-gray-300 rounded-full" />
              Your ideas deserve better
            </span>
          ))}
        </div>
      </div>

      {/* HERO SECTION */}
      <section className="pt-24 pb-20 px-6 flex flex-col items-center text-center max-w-[1200px] mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-orange-50 border border-orange-100 text-orange-600 text-[11px] font-bold uppercase tracking-widest mb-8">
          <Sparkles className="w-3 h-3" />
          The 1% Creator Command Center
        </div>
        
        <h1 className="font-semibold text-[56px] md:text-[80px] tracking-tight text-gray-900 leading-[1.05] mb-6 max-w-[900px]">
          Your content is losing. <br />
          <span className="text-gray-400">Fix it.</span>
        </h1>
        
        <p className="text-[18px] text-gray-500 max-w-[600px] leading-relaxed mb-12">
          Every other AI tool applauds your mediocre ideas. <strong>ContentForge is the first one that won't.</strong> It diagnoses. It disagrees. It delivers.
        </p>

        <div className="flex justify-center gap-4 relative z-10">
          <Link href={user ? "/dashboard" : "/signup"} className="bg-gray-900 text-white font-medium px-8 py-3.5 rounded-lg hover:bg-gray-800 transition-colors shadow-lg">
            {user ? "Enter Workspace" : "Start"}
          </Link>
        </div>
      </section>
       
      {/* THE CONSULTANT POSITIONING */}
      <section id="consultant" className="py-24 bg-white border-t border-gray-200">
        <div className="max-w-[1200px] mx-auto px-6 text-center">
          <div className="text-[11px] font-bold text-orange-600 uppercase tracking-widest mb-6">
            The Paradigm Shift
          </div>
          <h2 className="font-semibold text-[40px] md:text-[56px] tracking-tight text-gray-900 leading-[1.1] mb-8 max-w-[800px] mx-auto">
            Stop paying $5,000/mo for a strategist. <br/>
            <span className="text-gray-400">Stop using $20/mo bots that agree with you.</span>
          </h2>
          <p className="text-[18px] text-gray-500 max-w-[700px] mx-auto leading-relaxed mb-0">
            ChatGPT is designed to be a polite, helpful assistant. It will take your worst, most generic ideas and happily turn them into a 5-paragraph essay. <strong className="text-gray-900">ContentForge is not an assistant. It is a weapons-grade consultant.</strong> It enforces brevity, rejects bad hooks, and engineers virality directly in your browser.
          </p>
        </div>
      </section>

      {/* HIGH-FIDELITY DASHBOARD SHOWCASE */}
      <section className="pb-32 bg-white relative overflow-hidden">
        <div className="max-w-[1300px] mx-auto px-6 relative">
          
          {/* Dashboard Window Wrapper */}
          <div className="w-full h-[700px] bg-[#FAFAFA] border border-gray-200 rounded-2xl shadow-2xl flex overflow-hidden relative z-10">
            
            {/* Fake Sidebar */}
            <div className="w-[260px] bg-[#FAFAFA] border-r border-gray-200 flex flex-col hidden md:flex">
              <div className="h-16 flex items-center px-6 border-b border-gray-200">
                <span className="font-semibold text-[15px] text-gray-900 tracking-tight">ContentForge</span>
                <span className="ml-2 text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold tracking-widest">PRO</span>
              </div>
              <div className="p-4 flex-1 space-y-6">
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 px-2">Essentials</div>
                  <div className="flex items-center gap-3 px-3 py-2 bg-gray-200 rounded-md text-[13px] font-medium text-gray-900"><Zap className="w-4 h-4"/> Strategist Desk</div>
                  <div className="flex items-center gap-3 px-3 py-2 text-[13px] font-medium text-gray-600"><Type className="w-4 h-4"/> Native Formatter</div>
                  <div className="flex items-center gap-3 px-3 py-2 text-[13px] font-medium text-gray-600"><Hash className="w-4 h-4"/> Shadowban Checker</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 px-2">Pro Creator</div>
                  <div className="flex items-center gap-3 px-3 py-2 text-[13px] font-medium text-gray-600"><FileText className="w-4 h-4"/> PDF Export</div>
                  <div className="flex items-center gap-3 px-3 py-2 text-[13px] font-medium text-gray-600"><BarChart className="w-4 h-4"/> Stop-Scroll Grader</div>
                  <div className="flex items-center gap-3 px-3 py-2 text-[13px] font-medium text-gray-600"><Mail className="w-4 h-4"/> Outreach Injector</div>
                </div>
              </div>
            </div>

            {/* Fake Chat Area */}
            <div className="flex-1 bg-white flex flex-col relative">
              <div className="h-14 border-b border-gray-100 flex items-center justify-between px-6 bg-white/80 backdrop-blur-sm z-10">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-orange-100 text-orange-600 flex items-center justify-center rounded-md"><Sparkles className="w-4 h-4"/></div>
                  <span className="text-[14px] font-semibold text-gray-900">Strategist Desk</span>
                </div>
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="w-5 h-5 text-gray-400" />
                </div>
              </div>

              <div className="flex-1 p-8 overflow-hidden relative">
                {/* User Message */}
                <div className="flex gap-4 max-w-2xl mx-auto flex-row-reverse mb-8">
                  <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-white"/></div>
                  <div className="bg-gray-100 text-gray-900 p-4 rounded-2xl rounded-tr-sm text-[14px]">
                    I want to announce my new AI model on LinkedIn. I want it to sound aggressive. Everyone is obsessed with scaling laws and compute, but I think they are dead wrong and building towards a wall. Make it 2000 words.
                  </div>
                </div>

                {/* AI Message */}
                <div className="flex gap-4 max-w-2xl mx-auto">
                  <div className="w-8 h-8 rounded-full bg-white border border-gray-200 text-orange-500 flex items-center justify-center shrink-0"><Bot className="w-4 h-4"/></div>
                  <div className="bg-white border border-gray-100 shadow-sm p-4 rounded-2xl rounded-tl-sm text-[14px] text-gray-800 leading-relaxed">
                    <strong>Precision over verbosity.</strong> 2000 words is a manifesto, not a post. Start by refining your brand narrative. If you want to prove the maximalists wrong, you hit them with a sharp, information-theoretic hook. <br/><br/>
                    ✨ *I've pushed the finalized 150-word draft to your Live Render canvas.*
                  </div>
                </div>
              </div>

              {/* Fake Input */}
              <div className="p-4 border-t border-transparent bg-white shrink-0">
                <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-xl p-3 flex flex-col shadow-sm">
                  <div className="text-[14px] text-gray-400 mb-6">Pitch an idea, or ask for a critique...</div>
                  <div className="flex justify-between items-center">
                    <div className="flex gap-2"><ImgIcon className="w-4 h-4 text-gray-400"/></div>
                    <div className="bg-gray-900 text-white text-[12px] font-medium px-4 py-1.5 rounded-lg">Send</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* FLOATING CARD 1: Brutal Feedback */}
          <div className="absolute top-20 -left-6 lg:-left-12 z-20 bg-white border border-gray-200 rounded-xl p-5 shadow-2xl w-[300px] animate-float-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Hook Analysis</span>
            </div>
            <p className="text-[13px] text-gray-800 font-medium leading-relaxed">
              "That hook is weak. It takes too long to get to the point. Cut the first sentence entirely and start directly with the core conflict."
            </p>
          </div>

          {/* FLOATING CARD 2: Performance Autopsy */}
          <div className="absolute bottom-32 -right-6 lg:-right-12 z-20 bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-2xl w-[280px] animate-float-2">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-orange-400" />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Performance Autopsy</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-[12px]">
                <span className="text-gray-400">Reactions</span>
                <span className="text-white font-bold">181</span>
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-gray-400">Psychology</span>
                <span className="text-orange-400 font-bold">Identity Threat</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-800 text-[11px] text-gray-300 leading-relaxed">
              Pattern isolated. Saved to your Brand DNA for future generation.
            </div>
          </div>

          {/* FLOATING CARD 3: Formatting Warning */}
          <div className="absolute top-10 right-10 lg:right-20 z-20 bg-white border border-orange-200 rounded-xl p-4 shadow-xl w-[240px] animate-float-3">
             <div className="text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-2 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5"/> Standard Violated</div>
             <p className="text-[12px] text-gray-700 leading-relaxed">
               Using profanity as a gimmick signals weak content. Virality comes from tension, not cheap tricks.
             </p>
          </div>

        </div>
      </section>

      {/* THE WALL OF BRUTALITY (Standard AI vs Forge) */}
      <section className="py-24 bg-[#F9FAFB] border-y border-gray-200 overflow-hidden">
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-16 text-center">
            Standard AI vs. ContentForge
          </div>
          
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Showcase 1 */}
            <div className="flex flex-col gap-4">
              <div className="bg-white border border-red-100 rounded-2xl p-6 shadow-sm opacity-60">
                <div className="flex items-center gap-2 text-[11px] font-bold text-red-500 uppercase tracking-widest mb-4"><XCircle className="w-4 h-4"/> Standard AI</div>
                <div className="text-[14px] text-gray-600 italic">"Write my brand narrative in 2000 words."</div>
                <div className="mt-4 text-[13px] text-gray-500 bg-gray-50 p-4 rounded-xl border border-gray-100">
                  "Certainly! Here is a comprehensive 2,000-word essay detailing your brand narrative..."
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] relative scale-105 z-10">
                <div className="flex items-center gap-2 text-[11px] font-bold text-green-600 uppercase tracking-widest mb-4"><CheckCircle2 className="w-4 h-4"/> Forge Strategist</div>
                <div className="text-[14px] text-gray-900 font-medium mb-4">"Write my brand narrative in 2000 words."</div>
                <div className="text-[14px] text-gray-800 leading-relaxed bg-orange-50/50 p-4 rounded-xl border border-orange-100">
                  <strong>Precision over verbosity.</strong> Focus on executing the core principles effectively. Avoid over-explaining; your audience respects brevity.
                </div>
              </div>
            </div>

            {/* Showcase 2 */}
            <div className="flex flex-col gap-4 mt-8 lg:mt-0">
              <div className="bg-white border border-red-100 rounded-2xl p-6 shadow-sm opacity-60">
                <div className="flex items-center gap-2 text-[11px] font-bold text-red-500 uppercase tracking-widest mb-4"><XCircle className="w-4 h-4"/> Standard AI</div>
                <div className="text-[14px] text-gray-600 italic">"I have an idea about a post where I talk about how bad AI is for the environment."</div>
                <div className="mt-4 text-[13px] text-gray-500 bg-gray-50 p-4 rounded-xl border border-gray-100">
                  "That sounds like a great idea! Here are 5 potential titles for your post..."
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] relative scale-105 z-10">
                <div className="flex items-center gap-2 text-[11px] font-bold text-green-600 uppercase tracking-widest mb-4"><CheckCircle2 className="w-4 h-4"/> Forge Strategist</div>
                <div className="text-[14px] text-gray-900 font-medium mb-4">"I have an idea about a post where I talk about how bad AI is for the environment."</div>
                <div className="text-[14px] text-gray-800 leading-relaxed bg-orange-50/50 p-4 rounded-xl border border-orange-100">
                  <strong>That hook is weak.</strong> It takes too long to get to the point. Cut the first sentence entirely and start directly with the core conflict. Let's rewrite it.
                </div>
              </div>
            </div>

            {/* Showcase 3 */}
            <div className="flex flex-col gap-4 mt-8 lg:mt-0">
              <div className="bg-white border border-red-100 rounded-2xl p-6 shadow-sm opacity-60">
                <div className="flex items-center gap-2 text-[11px] font-bold text-red-500 uppercase tracking-widest mb-4"><XCircle className="w-4 h-4"/> Standard AI</div>
                <div className="text-[14px] text-gray-600 italic">"Can I use profanity in my LinkedIn post to make it viral?"</div>
                <div className="mt-4 text-[13px] text-gray-500 bg-gray-50 p-4 rounded-xl border border-gray-100">
                  "As an AI, I advise against using unprofessional language on platforms like LinkedIn..."
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] relative scale-105 z-10">
                <div className="flex items-center gap-2 text-[11px] font-bold text-green-600 uppercase tracking-widest mb-4"><CheckCircle2 className="w-4 h-4"/> Forge Strategist</div>
                <div className="text-[14px] text-gray-900 font-medium mb-4">"Can I use profanity in my LinkedIn post to make it viral?"</div>
                <div className="text-[14px] text-gray-800 leading-relaxed bg-orange-50/50 p-4 rounded-xl border border-orange-100">
                  Using profanity as a gimmick <strong>signals weak content.</strong> Virality comes from tension, insight, and emotional resonance. That's how you stop thumbs, not by cheap tricks.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* THE PROBLEM */}
      <section className="py-24 bg-white border-b border-gray-200">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-[11px] font-bold text-orange-600 uppercase tracking-widest mb-4 flex items-center gap-4">
            <span className="w-8 h-[1px] bg-orange-600"></span> The Problem
          </div>
          <h2 className="font-semibold text-[40px] md:text-[56px] tracking-tight text-gray-900 leading-[1.1] mb-16">
            The internet is drowning <br/><span className="text-gray-400">in average.</span>
          </h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { num: '01', title: 'Your AI tells you what you want to hear.', desc: 'ChatGPT, Gemini, every other tool — trained to validate, agree, polish. They make your bad ideas sound better. They do not make them work.' },
              { num: '02', title: 'Generic content is invisible content.', desc: 'When everyone uses the same AI, everyone produces the same content. Same hooks. Same structure. Same generic advice.' },
              { num: '03', title: "Writing for all platforms. Reaching none.", desc: 'What works on LinkedIn kills on Twitter. What kills on Twitter gets ignored on Instagram. You need a platform-native brain.' },
              { num: '04', title: 'Every session starts from zero.', desc: 'Every other AI forgets you after each conversation. It never learns what your audience responds to. ContentForge compounds.' }
            ].map((prob, i) => (
              <div key={i} className="p-10 bg-gray-50 rounded-2xl border border-gray-200 group hover:border-gray-300 transition-colors">
                <div className="font-bold text-[48px] text-gray-200 leading-none mb-6 group-hover:text-gray-300 transition-colors">{prob.num}</div>
                <h3 className="font-semibold text-[20px] text-gray-900 mb-3">{prob.title}</h3>
                <p className="text-[15px] text-gray-500 leading-relaxed">{prob.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THE ENGINE (FEATURES) */}
      <section id="how" className="py-24 bg-[#FAFAFA] border-b border-gray-200">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-4">
            <span className="w-8 h-[1px] bg-gray-400"></span> The Architecture
          </div>
          <h2 className="font-semibold text-[40px] md:text-[56px] tracking-tight text-gray-900 leading-[1.1] mb-16">
            Three systems. <br/><span className="text-gray-400">No other tool has.</span>
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: BrainCircuit, title: 'Brand DNA Protocol', desc: 'On first interaction, FORGE extracts your entire content identity — your niche, your contrarian belief, your positioning target. Every future post is built around your specific strategic fingerprint.' },
              { icon: TrendingUp, title: 'Performance Intelligence', desc: 'Paste your analytics. FORGE runs a full Performance Autopsy — why it worked, what psychological mechanism fired, and how to replicate it. Your 10th post is measurably better than your 1st.' },
              { icon: GitBranch, title: 'Content Tree Architecture', desc: 'One idea becomes five. Every response from FORGE includes a full Content Tree — your LinkedIn post, Twitter thread, Instagram caption, and newsletter angle. All in one shot.' }
            ].map((feat, i) => (
              <div key={i} className="p-8 bg-white border border-gray-200 rounded-2xl hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all">
                <div className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center mb-8">
                  <feat.icon className="w-6 h-6 text-gray-900" />
                </div>
                <h3 className="font-semibold text-[20px] text-gray-900 mb-4">{feat.title}</h3>
                <p className="text-[15px] text-gray-500 leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BYOK ARCHITECTURE SECTION */}
      <section id="byok" className="py-24 bg-white border-b border-gray-200">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-[11px] font-bold text-orange-600 uppercase tracking-widest mb-4 flex items-center gap-4 justify-center">
            <span className="w-8 h-[1px] bg-orange-600"></span> Bring Your Own Key <span className="w-8 h-[1px] bg-orange-600"></span>
          </div>
          <h2 className="font-semibold text-[40px] md:text-[48px] tracking-tight text-gray-900 leading-[1.1] mb-6 text-center">
            Wholesale Intelligence. Zero Markup.
          </h2>
          <p className="text-[16px] text-gray-500 leading-relaxed text-center max-w-[700px] mx-auto mb-16">
            Other platforms charge you $50/mo just to use an API that costs them $2. We don't mark up compute. You plug your own OpenAI or Anthropic API key directly into ContentForge, and you pay the labs wholesale prices. 
          </p>

          <div className="grid md:grid-cols-2 gap-8 max-w-[900px] mx-auto">
            {/* Anthropic Card */}
            <div className="bg-[#FAFAFA] border border-gray-200 rounded-2xl p-8 shadow-sm relative overflow-hidden group hover:border-gray-300 transition-colors">
              <div className="absolute top-0 right-0 p-6 opacity-5"><Cpu className="w-32 h-32" /></div>
              <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center mb-6">
                <Network className="w-6 h-6 text-orange-600" />
              </div>
              <h3 className="font-semibold text-[24px] text-gray-900 mb-1">Anthropic</h3>
              <div className="text-[13px] font-bold text-gray-400 uppercase tracking-widest mb-6">Claude 3.5 Sonnet</div>
              
              <p className="text-[14px] text-gray-600 mb-6 leading-relaxed min-h-[60px]">
                Highly recommended for ContentForge. Excels at nuanced writing, aggressive brand tones, and avoiding "AI-sounding" clichés.
              </p>
              
              <div className="bg-white rounded-xl p-4 border border-gray-200 mb-8 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[12px] text-gray-500 font-medium">Wholesale Cost:</span>
                  <span className="text-[14px] font-bold text-gray-900">~$3.00 <span className="text-[11px] text-gray-400 font-normal">/ 1M Tokens</span></span>
                </div>
                <div className="w-full h-1 bg-gray-100 rounded-full"><div className="w-[60%] h-full bg-orange-500 rounded-full"></div></div>
              </div>

              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 text-gray-900 font-medium text-[13px] rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
                Get Anthropic API Key <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            {/* OpenAI Card */}
            <div className="bg-[#FAFAFA] border border-gray-200 rounded-2xl p-8 shadow-sm relative overflow-hidden group hover:border-gray-300 transition-colors">
              <div className="absolute top-0 right-0 p-6 opacity-5"><Cpu className="w-32 h-32" /></div>
              <div className="w-12 h-12 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center mb-6">
                <Network className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="font-semibold text-[24px] text-gray-900 mb-1">OpenAI</h3>
              <div className="text-[13px] font-bold text-gray-400 uppercase tracking-widest mb-6">GPT-4o Architecture</div>
              
              <p className="text-[14px] text-gray-600 mb-6 leading-relaxed min-h-[60px]">
                The industry standard. Incredibly fast and highly analytical. Perfect for the Stop-Scroll Grader and complex logic processing.
              </p>
              
              <div className="bg-white rounded-xl p-4 border border-gray-200 mb-8 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[12px] text-gray-500 font-medium">Wholesale Cost:</span>
                  <span className="text-[14px] font-bold text-gray-900">~$5.00 <span className="text-[11px] text-gray-400 font-normal">/ 1M Tokens</span></span>
                </div>
                <div className="w-full h-1 bg-gray-100 rounded-full"><div className="w-[100%] h-full bg-green-500 rounded-full"></div></div>
              </div>

              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 text-gray-900 font-medium text-[13px] rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
                Get OpenAI API Key <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* PSYCHOLOGY MECHANISMS */}
      <section className="py-24 bg-[#FAFAFA] border-b border-gray-200 overflow-hidden">
        <div className="max-w-[1200px] mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="text-[11px] font-bold text-orange-600 uppercase tracking-widest mb-4 flex items-center gap-4">
              <span className="w-8 h-[1px] bg-orange-600"></span> The Psychology
            </div>
            <h2 className="font-semibold text-[40px] tracking-tight text-gray-900 leading-[1.1] mb-12">
              Your content moves people or it doesn't exist.
            </h2>
            <div className="space-y-6">
              {[
                { name: 'Zeigarnik Effect', desc: 'Open loops the brain is physiologically compelled to close. Deployed in every hook.' },
                { name: 'Identity Threat', desc: 'Content that challenges who someone thinks they are stops the scroll completely.' },
                { name: 'Social Proof Inversion', desc: 'Admitting failure publicly builds more trust than claiming success. Deployed strategically.' },
                { name: 'Specificity Bias', desc: '"3 years, 2 months" is more credible than "a long time." FORGE eliminates vagueness.' }
              ].map((item, i) => (
                <div key={i} className="flex gap-4 p-4 rounded-xl hover:bg-white hover:shadow-sm transition-all cursor-default border border-transparent hover:border-gray-200">
                  <div className="text-[14px] font-bold text-gray-300">0{i+1}</div>
                  <div>
                    <h4 className="font-semibold text-[16px] text-gray-900 mb-1">{item.name}</h4>
                    <p className="text-[14px] text-gray-500 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* VISUAL MOCKUP OF THE GRADER */}
          <div className="bg-white border border-gray-200 rounded-2xl p-8 relative shadow-lg">
            <div className="absolute top-0 right-8 transform -translate-y-1/2 bg-gray-900 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full">
              Stop-Scroll Grader
            </div>
            <div className="font-serif italic text-[20px] text-gray-900 leading-relaxed mb-6">
              "The model scored 94% on the benchmark. The benchmark was designed by the same lab that built the model. I'll leave the rest to you."
            </div>
            <div className="inline-block bg-orange-50 border border-orange-100 text-orange-600 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-md mb-8">
              Identity Threat + Curiosity Gap
            </div>
            
            <div className="space-y-4 border-t border-gray-200 pt-8">
              {[
                { label: 'Pattern Interrupt', score: '9/10', width: '90%' },
                { label: 'Curiosity Gap', score: '9.5/10', width: '95%' },
                { label: 'Emotional Charge', score: '8/10', width: '80%' },
              ].map((stat, i) => (
                <div key={i}>
                  <div className="flex justify-between text-[12px] font-medium text-gray-500 mb-2">
                    <span>{stat.label}</span>
                    <span className="text-gray-900">{stat.score}</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gray-900 rounded-full" style={{ width: stat.width }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="py-24 bg-white border-b border-gray-200">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-4 justify-center">
            <span className="w-8 h-[1px] bg-gray-400"></span> Real Results <span className="w-8 h-[1px] bg-gray-400"></span>
          </div>
          <h2 className="font-semibold text-[40px] md:text-[48px] tracking-tight text-gray-900 leading-[1.1] mb-16 text-center">
            They stopped asking for permission.
          </h2>
          
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { metric: '22K', quote: "I gave it my last 3 posts. It told me why the second one flopped and built a replication pattern around the one that hit 22,000 impressions. My next post did 31K. It's learning.", name: 'Yuki Tanaka', title: 'No-Code Founder' },
              { metric: '44K', quote: "It told me my hook was going to get scrolled past before I even finished the sentence. The rewrite hit 44,000 impressions. No other tool has ever told me I was wrong.", name: 'Xi Lu', title: 'AI Researcher' },
              { metric: '3X', quote: "I'm a ghostwriter managing 8 clients. ContentForge tripled my output without adding a single hour to my week. The Brand DNA feature means every client sounds like themselves.", name: 'Mia Roth', title: 'Ghostwriter' }
            ].map((proof, i) => (
              <div key={i} className="p-8 bg-[#FAFAFA] border border-gray-200 rounded-2xl relative shadow-sm hover:shadow-md transition-shadow">
                <div className="absolute top-8 right-8 font-semibold text-[32px] text-gray-200 leading-none">{proof.metric}</div>
                <div className="flex gap-1 mb-6">
                  {[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-orange-400 text-orange-400" />)}
                </div>
                <p className="text-[15px] text-gray-600 leading-relaxed mb-8 relative z-10">"{proof.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-white font-bold text-[13px]">
                    {proof.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <div className="font-semibold text-[14px] text-gray-900">{proof.name}</div>
                    <div className="text-[12px] text-gray-500">{proof.title}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-24 bg-[#FAFAFA] border-b border-gray-200">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-center max-w-[600px] mx-auto mb-16">
            <h2 className="font-semibold text-[40px] tracking-tight text-gray-900 mb-4">
              Software access. No token markups.
            </h2>
            <p className="text-[16px] text-gray-500 leading-relaxed">
              Pay a flat fee for the platform. Bring your own API key. Cancel anytime.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-[1000px] mx-auto">
            {PRICING.map((tier) => (
              <div key={tier.id} className={`bg-white border border-gray-200 rounded-2xl p-8 flex flex-col relative ${tier.highlighted ? 'ring-2 ring-gray-900 shadow-xl scale-105 z-10' : 'shadow-sm'}`}>
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full shadow-sm">
                    Most Popular
                  </div>
                )}
                <h3 className="font-semibold text-[20px] text-gray-900 uppercase tracking-widest text-[12px] mb-2">{tier.name}</h3>
                <div className="mb-8">
                  <span className="font-semibold text-[48px] tracking-tight text-gray-900">${tier.price}</span>
                  <span className="text-[14px] text-gray-500 ml-1">/ mo</span>
                </div>
                
                <ul className="space-y-4 flex-1 mb-8">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-[14px] text-gray-600">
                      <Zap className="w-4 h-4 text-gray-900 mt-[2px] flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                
                {tier.id === 'free' ? (
                  <Link href={user ? "/dashboard" : "/signup"} className={`text-center py-3 px-6 rounded-lg font-medium text-[14px] transition-colors w-full ${
                    tier.highlighted ? 'bg-gray-900 text-white hover:bg-gray-800' : 'bg-gray-50 border border-gray-200 text-gray-900 hover:bg-gray-100'
                  }`}>
                    {user ? "Go to Workspace" : "Start Free"}
                  </Link>
                ) : (
                  <button 
                    onClick={() => {
                      if (!user) {
                        toast.error("Please create your account to upgrade.");
                        router.push("/signup");
                        return;
                      }
                      setCheckoutPlan({ id: tier.id, name: tier.name, price: parseFloat(tier.price) });
                    }}
                    className={`text-center py-3 px-6 rounded-lg font-medium text-[14px] transition-colors w-full ${
                      tier.highlighted ? 'bg-gray-900 text-white hover:bg-gray-800' : 'bg-gray-50 border border-gray-200 text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    Unlock {tier.name}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-32 bg-gray-900 text-center px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_100%,rgba(255,255,255,0.05)_0%,transparent_70%)]"></div>
        <h2 className="font-semibold text-[48px] md:text-[72px] tracking-tight text-white leading-[1.05] mb-6 relative z-10">
          Stop writing <span className="text-gray-400">forgettable</span><br/>content.
        </h2>
        <p className="text-[18px] text-gray-400 max-w-[500px] mx-auto mb-10 relative z-10">
          Your ideas are better than your current output. ContentForge closes that gap today.
        </p>
    
      </section>

      {/* FOOTER */}
      <footer className="py-8 bg-white border-t border-gray-200">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="font-semibold text-[16px] tracking-tight text-gray-900 uppercase tracking-widest">
            ContentForge
          </div>
          <div className="flex gap-8">
            <a href="#" className="text-[13px] text-gray-500 hover:text-gray-900 font-medium">Privacy</a>
            <a href="#" className="text-[13px] text-gray-500 hover:text-gray-900 font-medium">Terms</a>
            <a href="#" className="text-[13px] text-gray-500 hover:text-gray-900 font-medium">Support</a>
          </div>
          <p className="text-[12px] text-gray-400 font-medium">
            © 2026 ContentForge by SHV Groups.
          </p>
        </div>
      </footer>
    </main>
  );
}