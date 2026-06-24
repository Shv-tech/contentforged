'use client';

import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { 
  User, Shield, CreditCard, Activity, LogOut, 
  AlertTriangle, Loader2, ArrowLeft, Building2, CheckCircle2 
} from 'lucide-react';
import Link from 'next/link';
import { PRICING } from '@/types'; 

type Tab = 'general' | 'personalization' | 'billing' | 'usage';

export default function AccountPage() {
  const { user, setUser, plan, creditsRemaining } = useAppStore();
  const router = useRouter();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Form States
  const [fullName, setFullName] = useState('');
  const [propertyFocus, setPropertyFocus] = useState('');
  const [brandDNA, setBrandDNA] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [brandTone, setBrandTone] = useState('');
  
  // Logic untouched
  const currentPlanId = plan === 'free' || !plan ? 'free' : plan; 
  const isFreeTier = currentPlanId === 'free';
  
  const currentPlanDetails = PRICING.find(p => p.id === currentPlanId) || PRICING[0];
  const maxCredits = isFreeTier ? 5 : (currentPlanDetails?.credits || 5); 
  const isUnlimited = maxCredits >= 999999;
  
  const safeCreditsRemaining = creditsRemaining !== null && creditsRemaining !== undefined ? creditsRemaining : maxCredits;
  const creditsUsed = Math.max(0, maxCredits - safeCreditsRemaining);

  const usagePercentage = isUnlimited 
    ? 0 
    : Math.min(100, Math.max(0, Math.round((creditsUsed / maxCredits) * 100)));

  useEffect(() => {
    const loadRazorpay = () => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      document.body.appendChild(script);
    };
    loadRazorpay();

    async function fetchUserData() {
      if (!user) {
        setIsLoading(false);
        return;
      }
      setFullName((user as any).user_metadata?.full_name || '');

      const { data: profileData } = await supabase
        .from('profiles')
        .select('plan, credits_remaining')
        .eq('id', user.id) 
        .single();

      if (profileData) {
        useAppStore.setState({ 
          plan: profileData.plan || 'free',
          creditsRemaining: profileData.credits_remaining !== null ? profileData.credits_remaining : maxCredits
        });
      }

      const { data: contextData } = await supabase
        .from('user_context')
        .select('context_type, content')
        .eq('user_id', user.id);

      if (contextData) {
        const dna = contextData.find(c => c.context_type === 'brand_dna');
        const audience = contextData.find(c => c.context_type === 'target_audience');
        const focus = contextData.find(c => c.context_type === 'property_focus');
        const tone = contextData.find(c => c.context_type === 'brand_tone');
        
        if (dna) setBrandDNA(dna.content);
        if (audience) setTargetAudience(audience.content);
        if (focus) setPropertyFocus(focus.content);
        if (tone) setBrandTone(tone.content);
      }
      setIsLoading(false);
    }
    fetchUserData();
  }, [user, supabase]);

  const handleUpdateProfile = async () => {
    setIsSaving(true);
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName }
    });
    
    if (error) toast.error('Failed to update name');
    else toast.success('Profile updated successfully');
    setIsSaving(false);
  };

  const handleSaveContext = async (type: string, content: string) => {
    if (!user) return;
    setIsSaving(true);
    
    await supabase.from('user_context').delete().eq('user_id', user.id).eq('context_type', type);
    
    const { error } = await supabase.from('user_context').insert({
      user_id: user.id,
      context_type: type,
      content: content,
    });

    setIsSaving(false);
    if (error) toast.error(`Failed to update settings`);
    else toast.success('Preferences saved automatically.');
  };

  const handleUpgradePlan = async (tierId: string, price: number) => {
    setIsProcessingPayment(true);
    try {
      const res = await fetch('/api/billing/razorpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: tierId, amount: price, userId: user?.id })
      });
      
      const orderData = await res.json();
      if (!res.ok) throw new Error(orderData.error);

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, 
        amount: orderData.amount,
        currency: "INR", 
        name: "ContentForge",
        description: `Upgrade Workspace`,
        order_id: orderData.id,
        handler: async function (response: any) {
          toast.success("Payment Successful! Upgrading workspace...");
        },
        prefill: {
          name: fullName,
          email: user?.email,
        },
        theme: {
          color: "#0f172a" 
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (response: any) {
        toast.error(`Payment Failed: ${response.error.description}`);
      });
      rzp.open();

    } catch (error: any) {
      toast.error(error.message || "Failed to initialize payment gateway.");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.push('/');
  };

  // --- RENDER PANELS (DARK MODE) ---
  const renderGeneral = () => (
    <div className="max-w-3xl animate-in fade-in duration-300 text-white">
      <div className="mb-10 border-b border-[#222] pb-8">
        <h3 className="text-[15px] font-bold text-white mb-6 uppercase tracking-wider">Profile</h3>
        
        <div className="grid grid-cols-[200px_1fr] gap-8 items-center mb-8">
          <label className="text-[14px] text-[#a3a3a3] font-medium">Avatar</label>
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg border border-[#333]" style={{ background: 'radial-gradient(circle at center, #c96a32 0%, #4a2107 80%)' }}>
            {fullName ? fullName.charAt(0).toUpperCase() : 'U'}
          </div>
        </div>

        <div className="grid grid-cols-[200px_1fr] gap-8 items-center">
          <label className="text-[14px] text-[#a3a3a3] font-medium">Full name</label>
          <div className="flex gap-3 max-w-md">
            <input 
              type="text" 
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full p-2.5 text-[14px] bg-[#111] text-white border border-[#333] rounded-lg focus:ring-1 focus:ring-[#555] focus:border-[#555] outline-none transition"
            />
            <button 
              onClick={handleUpdateProfile}
              disabled={isSaving || !fullName}
              className="px-5 py-2.5 bg-[#e0e0e0] hover:bg-white text-black text-[14px] font-medium rounded-lg transition disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <h3 className="text-[15px] font-bold text-white mb-6 uppercase tracking-wider">Account Security</h3>
        
        <div className="grid grid-cols-[200px_1fr] gap-8 items-start mb-8">
          <label className="text-[14px] text-[#a3a3a3] font-medium pt-2">Active sessions</label>
          <div className="w-full max-w-xl">
            <div className="flex justify-between items-center py-3 border-b border-[#222]">
              <div>
                <div className="text-[14px] text-white font-medium flex items-center gap-2">
                  Current Session <span className="bg-blue-900/30 text-blue-400 border border-blue-900/50 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Active</span>
                </div>
                <div className="text-[13px] text-[#777] mt-1">Logged in via {user?.email}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[200px_1fr] gap-8 items-center">
          <label className="text-[14px] text-[#a3a3a3] font-medium">Device Management</label>
          <div className="flex gap-4 items-center">
            <button onClick={handleLogout} className="px-5 py-2 bg-[#1c1c1c] border border-[#333] hover:bg-[#2a2a2a] text-white text-[14px] font-medium rounded-lg transition shadow-sm">
              Log out of all devices
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPersonalization = () => (
    <div className="max-w-3xl animate-in fade-in duration-300 text-white">
      <div className="mb-8">
        <h3 className="text-[15px] font-bold text-white mb-2 uppercase tracking-wider">Strategic Memory</h3>
        <p className="text-[14px] text-[#777]">The AI continuously retrieves this data to ensure all generated content fits your exact organizational framework.</p>
      </div>
      
      <div className="space-y-8">
        <div className="grid grid-cols-[200px_1fr] gap-8 items-start">
          <label className="text-[14px] text-[#a3a3a3] font-medium pt-2">Organization Type</label>
          <select 
            value={propertyFocus}
            onChange={(e) => {
              setPropertyFocus(e.target.value);
              handleSaveContext('property_focus', e.target.value);
            }}
            className="w-full max-w-md p-2.5 text-[14px] bg-[#111] text-white border border-[#333] rounded-lg focus:ring-1 focus:ring-[#555] focus:border-[#555] outline-none transition"
          >
            <option value="">Select an option...</option>
            <option value="boutique_hotel">Boutique Hotel / Independent</option>
            <option value="resort_group">Resort Group / Multi-Property</option>
            <option value="pms_software">Hospitality SaaS / PMS</option>
            <option value="agency">Marketing Agency</option>
          </select>
        </div>

        <div className="grid grid-cols-[200px_1fr] gap-8 items-start">
          <div>
            <label className="text-[14px] text-[#a3a3a3] font-medium">Core Brand DNA</label>
            <p className="text-[12px] text-[#777] mt-1 pr-4">What are your contrarian beliefs in the market?</p>
          </div>
          <textarea 
            value={brandDNA}
            onChange={(e) => setBrandDNA(e.target.value)}
            onBlur={() => handleSaveContext('brand_dna', brandDNA)}
            placeholder="e.g., We believe independent hotels are losing too much revenue to OTAs..."
            className="w-full h-28 p-3 text-[14px] bg-[#111] text-white border border-[#333] rounded-lg focus:ring-1 focus:ring-[#555] focus:border-[#555] outline-none transition resize-none custom-scrollbar placeholder:text-[#555]"
          />
        </div>

        <div className="grid grid-cols-[200px_1fr] gap-8 items-start">
          <div>
            <label className="text-[14px] text-[#a3a3a3] font-medium">Target Audience</label>
          </div>
          <textarea 
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            onBlur={() => handleSaveContext('target_audience', targetAudience)}
            placeholder="e.g., General Managers of 50-200 room properties..."
            className="w-full h-20 p-3 text-[14px] bg-[#111] text-white border border-[#333] rounded-lg focus:ring-1 focus:ring-[#555] focus:border-[#555] outline-none transition resize-none custom-scrollbar placeholder:text-[#555]"
          />
        </div>

        <div className="grid grid-cols-[200px_1fr] gap-8 items-start">
          <div>
            <label className="text-[14px] text-[#a3a3a3] font-medium">Tone & Voice</label>
          </div>
          <textarea 
            value={brandTone}
            onChange={(e) => setBrandTone(e.target.value)}
            onBlur={() => handleSaveContext('brand_tone', brandTone)}
            placeholder="e.g., Authoritative, minimalist, slightly provocative..."
            className="w-full h-20 p-3 text-[14px] bg-[#111] text-white border border-[#333] rounded-lg focus:ring-1 focus:ring-[#555] focus:border-[#555] outline-none transition resize-none custom-scrollbar placeholder:text-[#555]"
          />
        </div>
      </div>
    </div>
  );

  const renderBilling = () => {
    const availableUpgrades = PRICING.filter(p => p.id !== currentPlanId);

    return (
      <div className="max-w-4xl animate-in fade-in duration-300 text-white">
        <div className="mb-8">
          <h3 className="text-[15px] font-bold text-white mb-2 uppercase tracking-wider">Billing & Subscription</h3>
        </div>
        
        <div className="mb-10">
          <div className="grid grid-cols-[200px_1fr] gap-8 items-start">
            <label className="text-[14px] text-[#a3a3a3] font-medium pt-1">Current Plan</label>
            <div className="w-full bg-[#111] border border-[#333] rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <div className={`text-[16px] font-bold text-white uppercase tracking-wide`}>
                      {isFreeTier ? 'FREE PLAN' : `${currentPlanDetails.name} PLAN`}
                    </div>
                    {!isFreeTier && (
                      <span className="bg-emerald-900/30 text-emerald-400 border border-emerald-900/50 text-[10px] font-bold px-2 py-0.5 rounded-[4px] uppercase tracking-wider">Active</span>
                    )}
                  </div>
                  <div className="text-[14px] text-[#777]">
                    {isFreeTier ? 'You are currently on the trial tier.' : 'Your subscription is active and in good standing.'}
                  </div>
                </div>
                {!isFreeTier && (
                  <button className="px-4 py-2 bg-[#2a2a2a] hover:bg-[#333] text-white text-[13px] font-medium rounded-lg transition">
                    Manage Billing
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        {availableUpgrades.length > 0 && (
          <div className="grid grid-cols-[200px_1fr] gap-8 items-start">
            <label className="text-[14px] text-[#a3a3a3] font-medium pt-1">Available Upgrades</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableUpgrades.map((tier) => (
                <div key={tier.id} className="p-6 border border-[#333] rounded-xl bg-[#111] shadow-sm flex flex-col justify-between hover:border-[#555] transition-colors">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <div className={`text-[13px] font-bold uppercase tracking-wider ${tier.highlighted ? 'text-blue-400' : 'text-white'}`}>
                        {tier.name}
                      </div>
                    </div>
                    <div className="text-[28px] font-bold text-white mb-6 tracking-tight">
                      ${tier.price}<span className="text-[15px] text-[#777] font-normal">/mo</span>
                    </div>
                    <ul className="text-[13px] text-[#a3a3a3] mb-8 space-y-3">
                      {tier.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-[#555] shrink-0 mt-0.5" /> 
                          <span className="leading-snug">{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <Link 
                    href="/#pricing"
                    className={`w-full py-2.5 rounded-lg text-[14px] font-medium transition flex justify-center items-center gap-2 ${
                      tier.highlighted 
                        ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm' 
                        : 'bg-[#1c1c1c] border border-[#333] text-white hover:bg-[#2a2a2a]'
                    }`}
                  >
                    Upgrade to {tier.name}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderUsage = () => (
    <div className="max-w-3xl animate-in fade-in duration-300 text-white">
      <div className="mb-10 border-b border-[#222] pb-6">
        <h3 className="text-[15px] font-bold text-white mb-2 uppercase tracking-wider">Plan Usage Limits</h3>
        <p className="text-[14px] text-[#777]">Track your AI compute limits. Resets at the start of your billing cycle.</p>
      </div>
      
      <div className="space-y-10">
        <div className="grid grid-cols-[200px_1fr] gap-8 items-start">
          <div>
            <label className="text-[14px] text-[#a3a3a3] font-medium">Model compute</label>
            <p className="text-[12px] text-[#777] mt-1">Total workspace generation</p>
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[13px] font-medium text-white">
                {isUnlimited ? '∞ credits remaining' : `${safeCreditsRemaining.toLocaleString()} / ${maxCredits.toLocaleString()} remaining`}
              </span>
              <span className="text-[13px] text-[#777] font-medium">
                {isUnlimited ? '0%' : `${usagePercentage}%`} used
              </span>
            </div>
            <div className="w-full bg-[#222] h-1.5 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-1000 ease-out ${
                  usagePercentage > 90 ? 'bg-rose-500' : 'bg-blue-500'
                }`}
                style={{ width: `${isUnlimited ? 0 : usagePercentage}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[200px_1fr] gap-8 items-start pt-6 border-t border-[#222]">
          <div>
            <label className="text-[14px] text-[#a3a3a3] font-medium">Agentic Ebook Writer</label>
            <p className="text-[12px] text-[#777] mt-1">Multi-step document compilation</p>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[14px] text-[#777]">
              {currentPlanId === 'tier3' ? 'Unlocked & Active' : 'Requires Enterprise Tier'}
            </span>
            {currentPlanId !== 'tier3' && (
              <button onClick={() => setActiveTab('billing')} className="text-[13px] text-blue-400 font-medium hover:underline">
                Upgrade
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#000000] font-sans text-white flex flex-col">
      <div className="h-14 border-b border-[#141414] flex items-center px-6 shrink-0 bg-[#060606] sticky top-0 z-10">
        <Link href="/dashboard" className="flex items-center gap-2 text-[13px] font-medium text-[#888] hover:text-white transition">
          <ArrowLeft className="w-4 h-4" /> Back to Workspace
        </Link>
      </div>

      <div className="flex flex-1 max-w-[1200px] w-full mx-auto mt-8">
        <div className="w-64 pr-8 flex flex-col gap-1 shrink-0">
          <div className="text-[22px] font-semibold tracking-tight mb-6 px-3 text-white">Settings</div>
          <button onClick={() => setActiveTab('general')} className={`flex items-center gap-3 px-3 py-2 text-[14px] font-medium rounded-lg transition ${activeTab === 'general' ? 'bg-[#1c1c1c] text-white border border-[#333]' : 'text-[#888] hover:bg-[#111] hover:text-white border border-transparent'}`}>Account</button>
          <button onClick={() => setActiveTab('personalization')} className={`flex items-center gap-3 px-3 py-2 text-[14px] font-medium rounded-lg transition ${activeTab === 'personalization' ? 'bg-[#1c1c1c] text-white border border-[#333]' : 'text-[#888] hover:bg-[#111] hover:text-white border border-transparent'}`}>Strategic Memory</button>
          <button onClick={() => setActiveTab('billing')} className={`flex items-center gap-3 px-3 py-2 text-[14px] font-medium rounded-lg transition ${activeTab === 'billing' ? 'bg-[#1c1c1c] text-white border border-[#333]' : 'text-[#888] hover:bg-[#111] hover:text-white border border-transparent'}`}>Billing</button>
          <button onClick={() => setActiveTab('usage')} className={`flex items-center gap-3 px-3 py-2 text-[14px] font-medium rounded-lg transition ${activeTab === 'usage' ? 'bg-[#1c1c1c] text-white border border-[#333]' : 'text-[#888] hover:bg-[#111] hover:text-white border border-transparent'}`}>Usage</button>
        </div>

        <div className="flex-1 pl-12 border-l border-[#141414] min-h-[600px]">
          {isLoading ? (
            <div className="h-full flex items-start pt-20 justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#333]" /></div>
          ) : (
            <>
              {activeTab === 'general' && renderGeneral()}
              {activeTab === 'personalization' && renderPersonalization()}
              {activeTab === 'billing' && renderBilling()}
              {activeTab === 'usage' && renderUsage()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}