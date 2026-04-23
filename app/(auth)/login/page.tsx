'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    router.push('/dashboard');
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-[360px]">
        {/* Logo */}
        <div className="text-center mb-10">
          <Link href="/" className="font-display text-[21px] font-semibold text-apple-black tracking-tight">
            ContentForge
          </Link>
        </div>

        {/* Card */}
        <div>
          <h1 className="font-display text-tile text-apple-black text-center mb-1">
            Sign in
          </h1>
          <p className="text-caption text-secondary text-center mb-8">
            Enter your email and password.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-caption-bold text-apple-black mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full border border-black/10 rounded-comfortable bg-apple-gray px-4 py-[10px] text-body text-apple-black placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-apple-blue focus:border-transparent transition"
                placeholder="you@email.com"
              />
            </div>

            <div>
              <label className="block text-caption-bold text-apple-black mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full border border-black/10 rounded-comfortable bg-apple-gray px-4 py-[10px] text-body text-apple-black placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-apple-blue focus:border-transparent transition"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center !py-[11px] !text-body disabled:opacity-40"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60 20" />
                  </svg>
                  Signing in…
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className="text-caption text-secondary text-center mt-6">
            Don't have an account?{' '}
            <Link href="/signup" className="text-apple-link-light hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
