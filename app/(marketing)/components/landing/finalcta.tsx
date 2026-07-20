'use client';

import Link from 'next/link';
import { motion, Variants } from 'framer-motion';
import { ArrowRight, Twitter, Linkedin, Instagram, Command } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { FINAL_CTA } from '../../lib/landing-data';
import Image from 'next/image';

const customEase = [0.16, 1, 0.3, 1] as any;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 1, ease: customEase } },
};

const FOOTER_COLUMNS = [
  {
    heading: 'Product',
    links: [
      { label: 'How It Works', href: '#how' },
      { label: 'Tool Arsenal', href: '#tools' },
      { label: 'Methodology', href: '#methodology' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Changelog', href: '/changelog' },
    ],
  },
  {
  heading: 'For Teams',
  links: [
    { label: 'Solo Creators', href: '/teams/solo-creators' },
    { label: 'Ghostwriters', href: '/teams/ghostwriters' },
    { label: 'Founders', href: '/teams/founders' },
    { label: 'Enterprise', href: '/teams/enterprise' },
  ],
},
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Blog', href: '/blog' },
      { label: 'SHV Groups', href: 'https://shvgroups.in' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Security', href: '/security' },
    ],
  },
];

export default function FinalCTA() {
  const { user } = useAppStore();

  return (
    <>
      {/* ─── FINAL CTA ─── */}
      <section className="relative pt-40 pb-56 bg-[#000000] overflow-hidden flex flex-col justify-center border-t border-white/[0.02]">
        
        {/* The Omni-Core Return (Volumetric ambient glow at bottom) */}
        <div className="absolute -bottom-[400px] left-1/2 -translate-x-1/2 w-[1200px] h-[800px] bg-[radial-gradient(ellipse_at_top,rgba(209,138,94,0.06)_0%,transparent_60%)] pointer-events-none" />
        <div className="absolute -bottom-[200px] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse_at_top,rgba(209,138,94,0.1)_0%,transparent_70%)] pointer-events-none blur-[60px]" />

        <div className="relative z-10 max-w-[800px] mx-auto px-6 text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          >
            

            <motion.h2 variants={fadeUp} className="font-medium text-[56px] md:text-[80px] tracking-[-0.04em] leading-[1.05] text-white/95 mb-10">
              <span className="block">{FINAL_CTA.heading[0]}</span>
              <span className="block text-white/30">{FINAL_CTA.heading[1]}</span>
            </motion.h2>

            <motion.p variants={fadeUp} className="text-[18px] text-white/40 max-w-[600px] mx-auto leading-[1.7] font-light mb-16">
              {FINAL_CTA.subheading}
            </motion.p>

            <motion.div variants={fadeUp} className="flex flex-col items-center gap-6">
              <Link
                href={user ? '/dashboard' : '/signup'}
                className="group relative inline-flex items-center gap-3 bg-white/[0.03] border border-white/[0.08] text-white font-medium px-10 py-5 rounded-full hover:bg-white/[0.08] transition-colors duration-300 backdrop-blur-md"
              >
                <span className="text-[16px]">{FINAL_CTA.ctaPrimary}</span>
                <ArrowRight className="w-4 h-4 text-white/60 transition-transform group-hover:translate-x-1 group-hover:text-white" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-[1px] bg-gradient-to-r from-transparent via-[#d18a5e]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </Link>

             
            </motion.div>

           
          </motion.div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="bg-[#000000] border-t border-white/[0.02] relative z-20">
        
        {/* Column links */}
        <div className="max-w-[1200px] mx-auto px-6 pt-24 pb-20 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-y-16 gap-x-10">
          <div className="col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-[10px] bg-white/[0.02] flex items-center justify-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]  transition-colors duration-500">
                  <Image 
                    src="/logos/forge.svg" 
                    alt="Forge" 
                    width={100} 
                    height={100} 
                    className="opacity-80 group-hover:opacity-100 transition-opacity"
                    priority
                  />
                </div>
            </Link>
            <p className="text-[12px] text-white/30 leading-[1.6] font-light max-w-[200px]">
              The content platform for people who are done being average.
            </p>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <div key={col.heading}>
              <div className="text-[10px] font-mono text-white/20 uppercase tracking-[0.2em] mb-6">
                {col.heading}
              </div>
              <ul className="space-y-4">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-white/40 font-light hover:text-white/90 transition-colors duration-300"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/[0.02]">
          <div className="max-w-[1200px] mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-6">
            
            <div className="flex items-center gap-4">
              <span className="font-medium text-[13px] tracking-[-0.02em] text-white/90">
                ContentForge
              </span>
              <span className="text-white/10">|</span>
              <span className="text-[12px] text-white/30 font-light">
                © 2026 SHV Groups Pvt Ltd
              </span>
            </div>

            <div className="flex items-center gap-6">
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-[#d18a5e] transition-colors">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-[#d18a5e] transition-colors">
                <Linkedin className="w-4 h-4" />
              </a>
              <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-[#d18a5e] transition-colors">
                <Instagram className="w-4 h-4" />
              </a>
            </div>

          </div>
        </div>
      </footer>
    </>
  );
}