// app/(marketing)/(landing)/landing-client.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import { useAppStore } from '@/lib/store';

// Structured Data
import { JsonLd } from '../components/jsonLd';

// Section components
import HeroSection from '../components/landing/herosection';
import ProductSection from '../components/landing/productsection';
import LiveGrader from '../components/landing/livegrader';
import VoiceSection from '../components/landing/voicesection';
import ToolArsenal from '../components/landing/toolarsenal';
import UseCases from '../components/landing/usecases';
import HowItWorks from '../components/landing/howitworks';
import BuildInPublic from '../components/landing/buildinpublic';
import PricingSection from '../components/landing/pricingsection';
import FAQSection from '../components/landing/faqsection';
import FinalCTA from '../components/landing/finalcta';
import { LandingBlogSection } from '../components/landing/Blog';
import { getAllPosts, formatPostDate } from '@/lib/blog/posts';
import { focusRing, pillWhite } from '../components/landing/forge-art';


const NAV_LINKS = [
  { label: 'Product', href: '#product' },
  { label: 'Try it', href: '#try' },
  { label: 'Tools', href: '#tools' },
  { label: 'Pricing', href: '#pricing' },
];

export default function LandingClient() {
  const { user } = useAppStore();
  const [mounted, setMounted] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const rawPosts = getAllPosts();
  const posts = rawPosts.map((post) => ({
    ...post,
    publishedAt: formatPostDate(post.publishedAt),
  }));

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setShowBackToTop(window.scrollY > 1200);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith('#')) return;
    e.preventDefault();
    document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  };

  // Avoid hydration mismatch from user state
  if (!mounted) return null;

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-black font-sans text-white antialiased selection:bg-white/20">
      <JsonLd />

      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
        <nav
          aria-label="Main"
          className="pointer-events-auto flex w-full max-w-[920px] items-center gap-2 rounded-full border border-white/[0.08] bg-[#0B0B0B]/75 py-1.5 pl-3 pr-1.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
        >
          <Link href="/" className={`mr-auto flex items-center gap-2.5 rounded-full pr-2 ${focusRing}`}>
            <Image src="/logos/forge.svg" alt="" width={26} height={26} priority />
            <span className="text-[14px] font-semibold tracking-[0.18em] text-white">FORGE</span>
          </Link>
          <div className="hidden items-center lg:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className={`rounded-full px-4 py-2 text-[14px] text-white/60 transition-colors hover:text-white ${focusRing}`}
              >
                {link.label}
              </a>
            ))}
          </div>
          {user ? (
            <>
              <Link href="/account" className={`hidden rounded-full px-4 py-2 text-[14px] text-white/60 transition hover:text-white sm:block ${focusRing}`}>Account</Link>
              <Link href="/dashboard" className={`${pillWhite} !px-5 !py-2 !text-[14px]`}>Workspace</Link>
            </>
          ) : (
            <>
              <Link href="/login" className={`rounded-full px-3 py-2 text-[14px] text-white/60 transition hover:text-white sm:px-4 ${focusRing}`}>Log in</Link>
              <Link href="/signup" className={`${pillWhite} !px-5 !py-2 !text-[14px]`}>Start free</Link>
            </>
          )}
        </nav>
      </div>

      <HeroSection />

      <div className="space-y-40 pt-28 sm:space-y-56 sm:pt-40">
        <ProductSection />
        <LiveGrader />
      </div>

      <div className="mt-40 sm:mt-56">
        <VoiceSection />
      </div>

      <div className="space-y-40 pt-40 sm:space-y-56 sm:pt-56">
        <ToolArsenal />
        <UseCases />
        <HowItWorks />
        <BuildInPublic />
        <LandingBlogSection posts={posts} />
        <PricingSection />
        <FAQSection />
      </div>

      <FinalCTA />

      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            key="back-to-top"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Back to top"
            className={`fixed bottom-6 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-[#0B0B0B]/80 text-white/60 backdrop-blur-xl transition hover:text-white ${focusRing}`}
          >
            <ArrowUp className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </main>
  );
}
