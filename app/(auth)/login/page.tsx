// auth/login/page.tsx

'use client';

export const dynamic = 'force-dynamic';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { Command, Loader2, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { NoiseBackground } from '../components/ui/noise-background';
import Image from 'next/image';
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    // 1. Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast.error(error.message, {
        style: { background: '#111', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
      });
      setLoading(false);
      return;
    }

    // 2. Silently log the device session on the backend
    if (data?.user?.id) {
      try {
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: data.user.id })
        });
      } catch (err) {
        console.error("Failed to record device session:", err);
      }
    }

    // 3. Redirect to the workspace
    router.push('/dashboard');
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });

    if (error) {
      toast.error(error.message, {
        style: { background: '#111', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
      });
      setGoogleLoading(false);
    }
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

        {/* Ambient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#000000] z-10" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#000000]/40 via-transparent to-[#000000]/80 z-10" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#000000_100%)] z-10 opacity-60" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] z-10 pointer-events-none" />

      </div>

      {/* ─── RIGHT PANEL: THE AUTHENTICATION INTERFACE ─── */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-6 sm:p-12 relative z-20">
        
        {/* Subtle background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[radial-gradient(ellipse_at_center,rgba(209,138,94,0.03)_0%,transparent_60%)] pointer-events-none blur-[60px] -z-10" />

        <div className="w-full max-w-[400px]">
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Brand Header */}
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
              Sign in
            </h1>
            <p className="text-[14px] text-white/40 mb-10 leading-relaxed font-light">
              Welcome back. Enter your email and password to access your account.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            {/*
              Google above the email form.

              Placed first because it is the lower-friction path: one tap, no
              password to invent or recall. Burying it under the form means
              most people never see it, and the ones who do have already
              started typing.
            */}
            {/* Google Login Button (Dark Glassy Aesthetic) */}
            <button
              onClick={handleGoogleLogin}
              disabled={loading || googleLoading}
              className="w-full bg-white/[0.02] border border-white/[0.08] text-white/80 rounded-[12px] py-3.5 text-[14px] font-medium hover:bg-white/[0.04] hover:text-white transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50 backdrop-blur-sm"
            >
              {googleLoading ? (
                <Loader2 className="w-5 h-5 animate-spin opacity-70" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  <path d="M1 1h22v22H1z" fill="none" />
                </svg>
              )}
              Continue with Google
            </button>

            {/*
              Divider naming the alternative explicitly.

              A bare "Or" leaves the reader to work out what the second option
              is. Saying "or log in with email" makes both paths legible at a
              glance, which matters most for returning users trying to
              remember how they signed up last time.
            */}
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/[0.05]"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-[#000000] px-4 text-[12px] text-white/30 font-mono uppercase tracking-widest">
                  Or log in with email
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-[13px] font-medium text-white/60 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full bg-white/[0.02] border border-white/[0.08] rounded-[12px] px-4 py-3.5 text-[14px] text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-[#d18a5e]/50 focus:border-[#d18a5e]/50 transition-all duration-300 backdrop-blur-sm"
                  placeholder="you@company.com"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[13px] font-medium text-white/60">
                    Password
                  </label>
                  <Link href="/forgot-password" className="text-[12px] text-white/40 hover:text-white transition-colors duration-300">
                    Forgot Password?
                  </Link>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full bg-white/[0.02] border border-white/[0.08] rounded-[12px] px-4 py-3.5 text-[14px] text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-[#d18a5e]/50 focus:border-[#d18a5e]/50 transition-all duration-300 backdrop-blur-sm"
                  placeholder="••••••••••••"
                />
              </div>

              {/* Primary Login Button with Noise */}
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
                    disabled={loading || googleLoading}
                    className="group h-full w-full cursor-pointer flex items-center justify-center gap-2 rounded-[12px] bg-gradient-to-r from-black via-[#0a0a0a] to-[#111111] px-4 py-3.5 text-white font-medium text-[14px] shadow-[0px_1px_0px_0px_rgba(255,255,255,0.05)_inset,0px_1px_0px_0px_rgba(0,0,0,0.8)] transition-all duration-300 active:scale-[0.98] disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin opacity-70" />
                        Signing in...
                      </>
                    ) : (
                      <>
                        Sign in
                        <ArrowRight className="w-4 h-4 opacity-70 transition-transform duration-300 group-hover:translate-x-1 group-hover:opacity-100" />
                      </>
                    )}
                  </button>
                </NoiseBackground>
              </div>
            </form>

            {/* Footer Link */}
            <p className="text-[13px] text-white/40 text-center mt-10">
              Don't have an account?{' '}
              <Link href="/signup" className="text-white hover:text-[#d18a5e] transition-colors duration-300">
                Create one
              </Link>
            </p>
          </motion.div>

        </div>
      </div>
    </div>
  );
}