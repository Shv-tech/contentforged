'use client';

import React, { useState } from 'react';
import { X, Key, AlertTriangle, Loader2 } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import toast from 'react-hot-toast';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { user, plan, setPlan } = useAppStore();
  const [isCanceling, setIsCanceling] = useState(false);

  const handleCancel = async () => {
    if (!confirm('Are you sure? You will immediately lose access to all premium tools.')) return;
    
    setIsCanceling(true);
    const toastId = toast.loading('Canceling subscription...');

    try {
      const res = await fetch('/api/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id }),
      });

      if (!res.ok) throw new Error('Failed to cancel.');

      setPlan('free'); // Instantly lock the UI globally
      toast.success('Workspace downgraded.', { id: toastId });
      onClose();
    } catch (error) {
      toast.error('Could not process cancellation.', { id: toastId });
    } finally {
      setIsCanceling(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-[18px] text-gray-900">Workspace Settings</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* API Keys Section (Bring Your Own Key) */}
        <div className="p-6">
          <h3 className="text-[12px] font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Key className="w-3.5 h-3.5" /> Integrations
          </h3>
          <div className="space-y-4 mb-8">
            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-1.5">OpenAI API Key</label>
              <input 
                type="password" 
                placeholder="sk-proj-..." 
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Anthropic API Key</label>
              <input 
                type="password" 
                placeholder="sk-ant-..." 
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition"
              />
            </div>
            <p className="text-[12px] text-gray-500 leading-relaxed">
              Keys are stored locally in your browser. We never save them to our database.
            </p>
          </div>

          {/* Danger Zone / Billing */}
          <h3 className="text-[12px] font-bold text-red-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" /> Danger Zone
          </h3>
          <div className="bg-red-50 border border-red-100 rounded-xl p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[14px] font-medium text-red-900">Current Plan</span>
              <span className="text-[12px] font-bold bg-white text-red-600 px-2 py-0.5 rounded shadow-sm uppercase tracking-wider">
                {plan === 'free' ? 'BASIC' : plan}
              </span>
            </div>
            
            {plan !== 'free' ? (
              <button 
                onClick={handleCancel}
                disabled={isCanceling}
                className="mt-3 w-full bg-red-600 text-white text-[13px] font-medium py-2 rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {isCanceling ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cancel Subscription'}
              </button>
            ) : (
              <p className="text-[12px] text-red-700 mt-2">
                You are currently on the basic plan. No active subscription found.
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}