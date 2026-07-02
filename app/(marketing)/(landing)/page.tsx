// app/(marketing)/(landing)/landing-client.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, useScroll, AnimatePresence } from 'framer-motion';
import { Command, ArrowUp, ArrowRight } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import Image from 'next/image';

// Structured Data
import { JsonLd } from '../components/jsonLd';

// Section components
import HeroSection from '../components/landing/herosection';
import ProblemSection from '../components/landing/problemsection';
import ArchitectureSection from '../components/landing/architecturesection';
import ToolArsenal from '../components/landing/toolarsenal';
import PsychologySection from '../components/landing/psychologysection';
import UseCases from '../components/landing/usecases';
import HowItWorks from '../components/landing/howitworks';
import Testimonials from '../components/landing/testimonials';
import PricingSection from '../components/landing/pricingsection';
import FAQSection from '../components/landing/faqsection';
import FinalCTA from '../components/landing/finalcta';

const NAV_LINKS = [
  { label: 'How It Works', href: '#how' },
  { label: 'Tools', href: '#tools' },
  { label: 'Methodology', href: '#methodology' },
  { label: 'Pricing', href: '#pricing' },
];

export default function LandingClient() {
  const { user } = useAppStore();
  const [mounted, setMounted] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const { scrollYProgress } = useScroll();

  useEffect(() => {
    setMounted(true);

    const onScroll = () => {
      const y = window.scrollY;
      setNavScrolled(y > 40);
      setShowBackToTop(y > 800);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith('#')) return;
    e.preventDefault();
    const id = href.slice(1);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  // Avoid hydration mismatch from user state
  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-[#000000] text-[#a3a3a3] font-sans selection:bg-[#d18a5e]/30 overflow-x-hidden relative">
      
      {/* ─── STRUCTURED DATA (SEO) ─── */}
      <JsonLd />

      {/* ─── SCROLL PROGRESS BAR ─── */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-[1px] bg-[#d18a5e] origin-left z-[60] shadow-[0_0_10px_rgba(209,138,94,0.8)]"
        style={{ scaleX: scrollYProgress }}
      />

      {/* ─── DYNAMIC FLOATING NAVIGATION ─── */}
      <header
        className={`fixed top-0 w-full z-50 flex justify-center transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          navScrolled ? 'pt-6 px-6' : 'pt-8 px-6 md:px-12'
        }`}
      >
        <nav
          className={`flex items-center justify-between transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            navScrolled
              ? 'w-full max-w-[900px] bg-[#050505]/60 backdrop-blur-2xl border border-white/[0.06] rounded-full px-6 py-3 shadow-[0_20px_40px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.05)]'
              : 'w-full max-w-[1200px] px-0 py-2 bg-transparent border-transparent'
          }`}
        >
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-[10px] bg-white/[0.02] flex items-center justify-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]  transition-colors duration-500">
              <Image 
                src="/logos/forge.svg" 
                alt="Forge" 
                width={30} 
                height={30} 
                className="opacity-80 group-hover:opacity-100 transition-opacity"
                priority
              />
            </div>
            <span className="font-medium text-[14px] text-white/90 tracking-wide">
              Forge
            </span>
          </Link>

          {/* Center links */}
          <div className="hidden lg:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className="group relative text-[13px] font-medium text-white/40 hover:text-white/90 transition-colors duration-300"
              >
                {link.label}
                <span className="absolute -bottom-1.5 left-0 w-0 h-[1px] bg-gradient-to-r from-transparent via-[#d18a5e]/50 to-transparent transition-all duration-500 group-hover:w-full" />
              </a>
            ))}
          </div>

          {/* Right CTA */}
          <div className="flex items-center gap-2 md:gap-4">
            {user ? (
              <>
                <Link
                  href="/account"
                  className="text-[13px] font-medium text-white/40 px-3 py-2 rounded-full hover:text-white transition-colors duration-300 hidden sm:block"
                >
                  Account
                </Link>
                <Link
                  href="/dashboard"
                  className="group relative flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] text-white text-[13px] font-medium px-5 py-2.5 rounded-full hover:bg-white/[0.08] transition-all duration-300 backdrop-blur-md"
                >
                  Workspace
                  <ArrowRight className="w-3.5 h-3.5 text-white/40 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-white" />
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-[1px] bg-gradient-to-r from-transparent via-[#d18a5e]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-[13px] font-medium text-white/40 px-3 py-2 rounded-full hover:text-white transition-colors duration-300 hidden sm:block"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="group relative flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] text-white text-[13px] font-medium px-5 py-2.5 rounded-full hover:bg-white/[0.08] transition-all duration-300 backdrop-blur-md"
                >
                  Start Forging
                  <ArrowRight className="w-3.5 h-3.5 text-white/40 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-white" />
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-[1px] bg-gradient-to-r from-transparent via-[#d18a5e]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <HeroSection />
      <ProblemSection />
      <ArchitectureSection />
      <ToolArsenal />
      <section id="methodology"><PsychologySection /></section>
      <UseCases />
      <HowItWorks />
      <Testimonials />
      <PricingSection />
      <FAQSection />
      <FinalCTA />

      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            key="back-to-top"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            onClick={scrollToTop}
            aria-label="Back to top"
            className="fixed bottom-8 right-8 z-50 w-11 h-11 rounded-full bg-white/[0.02] border border-white/[0.08] backdrop-blur-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06] hover:border-[#d18a5e]/30 hover:shadow-[0_0_20px_rgba(209,138,94,0.15)] transition-all duration-300 focus-visible:outline-none"
          >
            <ArrowUp className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </main>
  );
}