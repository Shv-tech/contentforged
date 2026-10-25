// app/(auth)/signup/page.tsx

'use client';

export const dynamic = 'force-dynamic';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { Command, Loader2, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import Image from 'next/image';

// IMPORT YOUR NOISE BACKGROUND COMPONENT HERE
// Adjust the path based on where you saved it (e.g., Aceternity UI / Magic UI folder)
import { NoiseBackground } from '../components/ui/noise-background';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [next, setNext] = useState('/dashboard');
  const router = useRouter();

  useEffect(() => {
    // An invite link sends people here with ?next=/invite/<token>; keep it
    // through confirmation so they land on the invite, not an empty dashboard.
    const requested = new URLSearchParams(window.location.search).get('next');
    if (requested && requested.startsWith('/') && !requested.startsWith('//')) setNext(requested);
    setMounted(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });

    if (error) {
      toast.error(error.message, {
        style: { background: '#111', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
      });
      setLoading(false);
      return;
    }

    // The welcome email is sent by the server once onboarding finishes, for
    // an account that exists. A client-triggered send would let anyone mail
    // any address from Forge's domain.
    toast.success('Check your email to confirm your account.', {
      style: { background: '#111', color: '#fff', border: '1px solid rgba(209,138,94,0.3)' }
    });
    router.push(next === '/dashboard' ? '/login' : `/login?next=${encodeURIComponent(next)}`);
  }

  /**
   * Google sign-up.
   *
   * Note there is no sendWelcomeEmail call here, and adding one would be a
   * mistake: this function returns as soon as the browser navigates away to
   * Google, long before an account exists. Anyone who abandons the consent
   * screen would still receive a welcome email for an account that was never
   * created.
   *
   * The welcome email for OAuth signups has to be triggered server-side, once
   * the account genuinely exists. See the note below the component.
   */
  async function handleGoogleSignup() {
    setGoogleLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    // Only reached on failure. On success the browser has already left this
    // page, so clearing the loading state would never run.
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
              Start Forge for free
            </h1>
          </motion.div>

          {/*
            Google first.

            It is the lower-friction path: one tap, no password to invent, and
            no verification email to go and find. Placing it under the form
            means most people never see it, and the ones who do have already
            started typing.

            Animated on the same curve as the form below, one beat earlier, so
            the two read as a single sequence rather than separate blocks.
          */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              type="button"
              onClick={handleGoogleSignup}
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
              Sign up with Google
            </button>

            {/*
              Divider naming the alternative rather than a bare "Or", so both
              paths are legible at a glance.
            */}
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/[0.05]"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-[#000000] px-4 text-[12px] text-white/30 font-mono uppercase tracking-widest">
                  Or sign up with email
                </span>
              </div>
            </div>
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
                  disabled={loading || googleLoading}
                  className="group h-full w-full cursor-pointer flex items-center justify-center gap-2 rounded-[12px] bg-gradient-to-r from-black via-[#0a0a0a] to-[#111111] px-4 py-3.5 text-white font-medium text-[14px] shadow-[0px_1px_0px_0px_rgba(255,255,255,0.05)_inset,0px_1px_0px_0px_rgba(0,0,0,0.8)] transition-all duration-300 active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin opacity-70" />
                      Creating account...
                    </>
                  ) : (
                    <>
                      Start Free
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
              Already have an account?{' '}
              <Link href="/login" className="text-white hover:text-[#d18a5e] transition-colors duration-300">
                login here.
              </Link>
            </p>

            {/*
              One line, which is what every signup form uses.

              Everything that was here before (hosting region, payment
              processing, what data is collected) belongs in the privacy
              policy. Putting it on the form does not make it more binding,
              it just means nobody reads either one.
            */}
            <p className="text-[12px] text-white/25 leading-[1.6]">
              By creating an account, you agree to our{' '}
              <Link href="/terms" className="text-white/45 hover:text-[#d18a5e] underline decoration-white/10 hover:decoration-[#d18a5e]/50 transition-colors">Terms of Service</Link>
              {' '}and{' '}
              <Link href="/privacy" className="text-white/45 hover:text-[#d18a5e] underline decoration-white/10 hover:decoration-[#d18a5e]/50 transition-colors">Privacy Policy</Link>.
            </p>

          </motion.div>

        </div>
      </div>
    </div>
  );
}