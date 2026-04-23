'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { Command, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    toast.success('Check your email to verify your account.');
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-6 font-sans">
      <div className="w-full max-w-[400px]">
        
        {/* Brand Header */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-8 h-8 rounded-md bg-gray-900 flex items-center justify-center">
            <Command className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-[16px] tracking-tight text-gray-900 uppercase tracking-widest">
            ContentForge
          </span>
        </div>

        {/* Signup Card */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8">
          <h1 className="text-[24px] font-semibold text-gray-900 text-center mb-2 tracking-tight">
            Create your workspace
          </h1>
          <p className="text-[14px] text-gray-500 text-center mb-8">
            Start your 3-day free trial. No credit card required.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[13px] font-semibold text-gray-700 mb-2">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 transition-shadow"
                placeholder="founder@company.com"
              />
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-gray-700 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 transition-shadow"
                placeholder="Minimum 6 characters"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 text-white font-medium text-[14px] py-3 rounded-lg hover:bg-gray-800 transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating workspace...
                </>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          <p className="text-[13px] text-gray-500 text-center mt-8">
            Already have an account?{' '}
            <Link href="/login" className="text-gray-900 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
        
        {/* Footer Note */}
        <p className="text-[12px] text-gray-400 text-center mt-8">
          By signing up, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}