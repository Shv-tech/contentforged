'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import toast from 'react-hot-toast';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // This is where Supabase will redirect the user after they click the link in their email
      redirectTo: `${window.location.origin}/update-password`,
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    setIsSubmitted(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-[360px]">
        
        {/* Logo */}
        <div className="text-center mb-10">
          <Link href="/" className="font-display text-[21px] font-semibold text-gray-900 tracking-tight">
            ContentForge
          </Link>
        </div>

        {isSubmitted ? (
          // --- SUCCESS STATE ---
          <div className="text-center animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            </div>
            <h1 className="font-display text-[24px] font-medium text-gray-900 mb-2">
              Check your inbox
            </h1>
            <p className="text-[14px] text-gray-500 mb-8 leading-relaxed">
              We just sent a password reset link to <span className="font-medium text-gray-900">{email}</span>. It may take a few minutes to arrive.
            </p>
            <Link 
              href="/login"
              className="w-full bg-gray-900 text-white rounded-xl py-[11px] text-[14px] font-medium hover:bg-gray-800 transition flex justify-center items-center gap-2"
            >
              Return to Login
            </Link>
          </div>
        ) : (
          // --- INPUT STATE ---
          <div className="animate-in fade-in duration-300">
            <h1 className="font-display text-[24px] font-medium text-gray-900 text-center mb-1">
              Reset Password
            </h1>
            <p className="text-[14px] text-gray-500 text-center mb-8">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[13px] font-semibold text-gray-900 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full border border-black/10 rounded-xl bg-gray-50 px-4 py-[10px] text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="you@email.com"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full bg-gray-900 text-white rounded-xl py-[11px] text-[14px] font-medium hover:bg-gray-800 transition disabled:opacity-40 flex justify-center items-center gap-2"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60 20" />
                    </svg>
                    Sending link...
                  </span>
                ) : (
                  'Send Reset Link'
                )}
              </button>
            </form>

            <div className="mt-8 text-center">
              <Link 
                href="/login" 
                className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-900 font-medium transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to login
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}