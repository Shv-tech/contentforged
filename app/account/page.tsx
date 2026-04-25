'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { User, Key, CreditCard, AlertTriangle, ArrowLeft, Loader2, History } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AccountPage() {
  const router = useRouter();
  const { user, plan, setPlan, apiKey, llmProvider, setApiKey, setLlmProvider, creditsRemaining } = useAppStore();
  
  const [localKey, setLocalKey] = useState(apiKey);
  const [localProvider, setLocalProvider] = useState(llmProvider);
  const [isCanceling, setIsCanceling] = useState(false);

  // Redirect if not logged in
  if (!user) {
    if (typeof window !== 'undefined') router.push('/login');
    return null;
  }

  const saveApiSettings = () => {
    setApiKey(localKey);
    setLlmProvider(localProvider);
    toast.success('API Configuration Saved.');
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure? You will immediately lose access to all premium tools.')) return;
    
    setIsCanceling(true);
    const toastId = toast.loading('Canceling subscription...');

    try {
      const res = await fetch('/api/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      if (!res.ok) throw new Error('Failed to cancel.');

      setPlan('free'); // Instantly lock the UI globally
      toast.success('Workspace downgraded to Basic.', { id: toastId });
    } catch (error) {
      toast.error('Could not process cancellation.', { id: toastId });
    } finally {
      setIsCanceling(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-gray-900 font-sans pb-24">
      {/* HEADER */}
      <nav className="w-full h-[72px] flex items-center px-6 md:px-12 bg-white border-b border-gray-200 sticky top-0 z-50">
        <Link href="/dashboard" className="flex items-center gap-2 text-[14px] font-medium text-gray-500 hover:text-gray-900 transition">
          <ArrowLeft className="w-4 h-4" /> Back to Workspace
        </Link>
      </nav>

      <div className="max-w-[800px] mx-auto px-6 pt-12">
        <h1 className="text-[32px] font-semibold tracking-tight mb-8">Account Settings</h1>

        <div className="space-y-8">
          
          {/* PROFILE SECTION */}
          <section className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <h2 className="text-[12px] font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <User className="w-4 h-4" /> Identity
            </h2>
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-gray-500 font-medium">Email Address</span>
              <span className="text-[16px] font-medium text-gray-900">{user.email}</span>
            </div>
          </section>

          {/* BILLING & SUBSCRIPTION SECTION */}
          <section className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <h2 className="text-[12px] font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> Subscription
            </h2>
            
            <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-100 rounded-xl mb-6">
              <div>
                <div className="text-[13px] text-gray-500 font-medium mb-1">Current Plan</div>
                <div className="text-[18px] font-semibold text-gray-900 capitalize">
                  {plan === 'free' ? 'Unpaid (Locked)' : plan === 'basic' ? 'Basic' : plan}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[13px] text-gray-500 font-medium mb-1">Credits Remaining</div>
                <div className="text-[18px] font-semibold text-gray-900">
                  {plan === 'tier3' ? 'Unlimited' : creditsRemaining}
                </div>
              </div>
            </div>

            {plan !== 'free' ? (
              <div className="border-t border-gray-100 pt-6 mt-2">
                <h3 className="text-[12px] font-bold text-red-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5" /> Danger Zone
                </h3>
                <button 
                  onClick={handleCancel}
                  disabled={isCanceling}
                  className="bg-red-50 text-red-600 border border-red-100 text-[13px] font-medium px-4 py-2.5 rounded-lg hover:bg-red-100 transition flex items-center gap-2 disabled:opacity-70"
                >
                  {isCanceling ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cancel Subscription'}
                </button>
                <p className="text-[12px] text-gray-400 mt-3 leading-relaxed max-w-[500px]">
                  Canceling will immediately downgrade your account and lock premium tools. No prorated refunds are provided.
                </p>
              </div>
            ) : (
              <Link href="/#pricing" className="bg-gray-900 text-white text-[13px] font-medium px-6 py-3 rounded-lg hover:bg-gray-800 transition inline-block">
                Upgrade Workspace
              </Link>
            )}
          </section>

          {/* API CONFIGURATION SECTION */}
          <section className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <h2 className="text-[12px] font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Key className="w-4 h-4" /> Bring Your Own Key
            </h2>
            
            <div className="space-y-5 max-w-[500px]">
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Provider</label>
                <select 
                  value={localProvider} 
                  onChange={(e) => setLocalProvider(e.target.value as any)} 
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-[14px] text-gray-900 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition"
                >
                  <option value="openai">OpenAI (GPT-4o)</option>
                  <option value="anthropic">Anthropic (Claude 3.5)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Secret API Key</label>
                <input 
                  type="password" 
                  value={localKey} 
                  onChange={(e) => setLocalKey(e.target.value)} 
                  placeholder="sk-..." 
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-[14px] text-gray-900 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition" 
                />
                <p className="text-[12px] text-gray-500 mt-2">Stored securely in your local browser storage. Never sent to our servers.</p>
              </div>
              
              <button 
                onClick={saveApiSettings} 
                className="bg-gray-900 text-white font-medium text-[13px] px-6 py-2.5 rounded-lg hover:bg-gray-800 shadow-sm transition"
              >
                Save Configuration
              </button>
            </div>
          </section>

          {/* GENERATION HISTORY (PLACEHOLDER) */}
          <section className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm opacity-50 pointer-events-none">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-[12px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <History className="w-4 h-4" /> Generation History
              </h2>
              <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider">Coming Soon</span>
            </div>
            <div className="text-[14px] text-gray-500 text-center py-8">
              Your past outputs and multi-agent sessions will be logged here.
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}