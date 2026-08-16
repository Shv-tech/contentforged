// app/(auth)/signup/page.tsx

'use client';

export const dynamic = 'force-dynamic';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { Command, Loader2, ArrowRight, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import Image from 'next/image';

// 1. IMPORT YOUR NEW SERVER ACTION HERE
import { sendWelcomeEmail } from '../../../lib/email/action';

// IMPORT YOUR NOISE BACKGROUND COMPONENT HERE
// Adjust the path based on where you saved it (e.g., Aceternity UI / Magic UI folder)
import { NoiseBackground } from '../components/ui/noise-background'; 

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      toast.error(error.message, {
        style: { background: '#111', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
      });
      setLoading(false);
      return;
    }

    // 2. CALL THE FUNCTION HERE (Don't await it, just let it fire in the background)
    sendWelcomeEmail(email);

    toast.success('System initialized. Check your email to verify.', {
      style: { background: '#111', color: '#fff', border: '1px solid rgba(209,138,94,0.3)' }
    });
    router.push('/login');
  }

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[#000000] flex flex-col lg:flex-row font-sans selection:bg-[#d18a5e]/30">
      
      {/* ─── LEFT PANEL: THE CINEMATIC CANVAS ─── */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-[#020202]">
        
        {/* The Video Element */}
        <video 
          autoPlay 
          loop 
          muted 
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-80 mix-blend-screen"
          src="/assets/signupvideo.mp4" 
        />

        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#000000] z-10" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#000000]/40 via-transparent to-[#000000]/80 z-10" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#000000_100%)] z-10 opacity-60" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] z-10 pointer-events-none" />

        <div className="absolute bottom-12 left-12 z-20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 rounded-full bg-[#d18a5e] animate-pulse shadow-[0_0_10px_rgba(209,138,94,0.8)]" />
            <span className="text-[10px] font-mono text-[#d18a5e] uppercase tracking-[0.2em]">
              forge
            </span>
          </div>
          <h2 className="text-3xl font-medium text-white tracking-tight leading-[1.2] max-w-[400px]">
            The content Platform for people who are done being average.
          </h2>
        </div>
      </div>

      {/* ─── RIGHT PANEL: THE AUTHENTICATION INTERFACE ─── */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-6 sm:p-12 relative z-20">
        
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[radial-gradient(ellipse_at_center,rgba(209,138,94,0.03)_0%,transparent_60%)] pointer-events-none blur-[60px] -z-10" />

        <div className="w-full max-w-[420px]">
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <Link href="/" className="flex items-center gap-3 mb-16 group inline-flex">
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
              <span className="font-medium text-[14px] text-white/90 uppercase tracking-[0.2em]">
                Forge
              </span>
            </Link>

            <h1 className="text-[32px] font-medium text-white mb-3 tracking-tight">
              create Workspace
            </h1>
          </motion.div>

          <motion.form 
            onSubmit={handleSubmit} 
            className="space-y-5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <div>
              <label className="block text-[12px] font-mono uppercase tracking-[0.1em] text-white/40 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-white/[0.02] border border-white/[0.08] rounded-[12px] px-4 py-3.5 text-[14px] text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-[#d18a5e]/50 focus:border-[#d18a5e]/50 transition-all duration-300 backdrop-blur-sm"
                placeholder="founder@company.com"
              />
            </div>

            <div>
              <label className="block text-[12px] font-mono uppercase tracking-[0.1em] text-white/40 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full bg-white/[0.02] border border-white/[0.08] rounded-[12px] px-4 py-3.5 text-[14px] text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-[#d18a5e]/50 focus:border-[#d18a5e]/50 transition-all duration-300 backdrop-blur-sm"
                placeholder="••••••••••••"
              />
            </div>

            {/* ─── THE NEW NOISE BACKGROUND BUTTON ─── */}
            <div className="pt-2">
              <NoiseBackground
                containerClassName="w-full p-[1px] rounded-[12px] mx-auto"
                gradientColors={[
                  "rgb(209, 138, 94)",  // Base Copper (#d18a5e)
                  "rgb(227, 154, 110)", // Lighter Glow (#e39a6e)
                  "rgb(140, 83, 51)",   // Darker Forge Amber
                ]}
              >
                <button
                  type="submit"
                  disabled={loading}
                  className="group h-full w-full cursor-pointer flex items-center justify-center gap-2 rounded-[12px] bg-gradient-to-r from-black via-[#0a0a0a] to-[#111111] px-4 py-3.5 text-white font-medium text-[14px] shadow-[0px_1px_0px_0px_rgba(255,255,255,0.05)_inset,0px_1px_0px_0px_rgba(0,0,0,0.8)] transition-all duration-300 active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin opacity-70" />
                      Allocating resources...
                    </>
                  ) : (
                    <>
                      Start Forging
                      <ArrowRight className="w-4 h-4 opacity-70 transition-transform duration-300 group-hover:translate-x-1 group-hover:opacity-100" />
                    </> 
                  )}
                </button>
              </NoiseBackground>
            </div>
            
          </motion.form>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.3 }}
            className="mt-8 pt-8 border-t border-white/[0.05]"
          >
            <p className="text-[13px] text-white/40 mb-8">
              Already have an active node?{' '}
              <Link href="/login" className="text-white hover:text-[#d18a5e] transition-colors duration-300">
                login here.
              </Link>
            </p>

            {/* ─── STRICT LEGAL & ARCHITECTURAL DISCLAIMER ─── */}
            <div className="bg-white/[0.01] border border-white/[0.03] rounded-[12px] p-5 backdrop-blur-sm">
              <div className="flex items-start gap-3 mb-3">
                <ShieldCheck className="w-4 h-4 text-[#d18a5e] mt-0.5 shrink-0" />
              
              </div>
              <div className="space-y-3 text-[11px] text-white/30 leading-[1.6] font-light">
                <p>
                  By signing-up to forge, you acknowledge that Forge operates on East-Asian infrastructure (Tokyo, Japan) via Supabase. We do not harvest peripheral personal data; we ingest only the contextual intelligence (Brand DNA) explicitly required for systemic operation.
                </p>
                <p>
                  <strong>Zero Financial Storage:</strong> All subscription and payment processing is cryptographically isolated and delegated entirely to Razorpay. SHV Groups Pvt Ltd stores absolute zero local payment data.
                </p>
                <p>
                  Your authentication constitutes an irrevocable cryptographic signature agreeing to our{' '}
                  <Link href="/terms" className="text-white/50 hover:text-[#d18a5e] underline decoration-white/10 hover:decoration-[#d18a5e]/50 transition-colors">Terms of Service</Link>,{' '}
                  <Link href="/privacy" className="text-white/50 hover:text-[#d18a5e] underline decoration-white/10 hover:decoration-[#d18a5e]/50 transition-colors">Privacy Architecture</Link>, and{' '}
                  <Link href="/security" className="text-white/50 hover:text-[#d18a5e] underline decoration-white/10 hover:decoration-[#d18a5e]/50 transition-colors">Security Protocols</Link>.
                </p>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}