'use client';

import Link from 'next/link';
import { Image as ImageIcon, Lock, ArrowRight } from 'lucide-react';

export default function PdfToImageTool() {
  return (
    <main className="min-h-screen bg-apple-gray flex flex-col items-center pt-32 px-6">
      <nav className="fixed top-0 w-full nav-glass h-[60px] flex items-center justify-between px-8 z-50">
        <Link href="/" className="font-display font-bold text-[18px] tracking-tight text-apple-black">
          ContentForge
        </Link>
        <Link href="/signup" className="btn-primary !py-2 !px-4 !text-caption">
          Get Started
        </Link>
      </nav>

      <div className="text-center max-w-[600px] mb-12">
        <h1 className="font-display text-section-head text-apple-black mb-4">
          Extract High-Res Images from PDFs
        </h1>
        <p className="text-body text-secondary">
          Reverse-engineer viral carousels. Extract individual high-quality frames from any PDF document.
        </p>
      </div>

      <div className="w-full max-w-[500px] bg-white rounded-[24px] p-12 shadow-apple text-center relative overflow-hidden border border-black/5">
        <div className="absolute top-4 right-4 bg-apple-black text-white text-[10px] uppercase font-bold px-3 py-1 rounded-sm flex items-center gap-1">
          <Lock className="w-3 h-3" /> Pro Feature
        </div>
        
        <div className="bg-apple-gray w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <ImageIcon className="w-10 h-10 text-apple-black" />
        </div>
        
        <h3 className="font-display text-card-title text-apple-black mb-3">
          Available in the Enterprise Workspace
        </h3>
        <p className="text-body text-secondary mb-8">
          This tool requires advanced client-side processing included in the ContentForge Pro Command Center. Upgrade to unlock this and 24 other creator utilities.
        </p>

        <Link href="/signup" className="btn-primary inline-flex items-center gap-2 !px-8 !py-3 w-full justify-center">
          Unlock Pro Access <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </main>
  );
}