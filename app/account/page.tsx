// app/account/page.tsx

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  User, Shield, CreditCard, Activity, Loader2, ArrowLeft, CheckCircle2,
  UploadCloud, Link as LinkIcon, FileText, Clock, Trash2, ShieldAlert,
  AlertTriangle, Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useSubscriptionCheckout } from '@/lib/billing/use-subscription-checkout';
import { displayName, toAppUser } from '@/lib/user-display';

type Tab = 'general' | 'personalization' | 'billing' | 'usage';
type StrategicMemoryTab = 'identity' | 'knowledge' | 'social';

/**
 * Everything on this page reads from /api/billing/status, which is the single
 * server-side view of plan, subscription, and quota.
 *
 * The previous version read `profiles.credits_remaining` and hardcoded
 * `maxCredits = isFreeTier ? 5 : ...`, neither of which any server code wrote.
 * The meters therefore showed a number unrelated to actual usage, and the
 * upgrade buttons posted to /api/billing/razorpay, which does not exist.
 */

interface UpgradeOption {
  planId: 'starter' | 'pro' | 'agency';
  name: string;
  tagline: string;
  features: string[];
  currency: 'INR' | 'USD';
  displayPrice: string;
  paymentMethods: string[];
}

interface BillingStatus {
  planId: 'free' | 'starter' | 'pro' | 'agency';
  planName: string;
  subscription: {
    status: string;
    currency: 'INR' | 'USD';
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    graceUntil: string | null;
  } | null;
  quota: {
    windowUsed: number;
    windowBudget: number;
    windowResetsAt: string | null;
    monthlyUsed: number;
    monthlyBudget: number;
    monthlyResetsAt: string | null;
    ebooksUsed: number;
    ebooksAllowed: number;
  } | null;
  availableUpgrades: UpgradeOption[];
}

// ============================================================================
// HELPERS
// ============================================================================

function percentUsed(used: number, budget: number): number {
  if (budget <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / budget) * 100)));
}

/**
 * Quota is stored in cost micros, which is meaningless to a user. It is
 * presented as generation counts against a nominal per-generation cost.
 *
 * This is an approximation and is labelled as such in the UI: a long war-room
 * output costs several times a short reply, so the true remaining count varies
 * with usage. Showing "$0.0043 of $0.20 spent" would be precise and useless.
 */
const MICROS_PER_GENERATION = 9500;

function toGenerations(micros: number): number {
  return Math.max(0, Math.round(micros / MICROS_PER_GENERATION));
}

function formatResetCountdown(iso: string | null): string {
  if (!iso) return 'unknown';
  const target = new Date(iso).getTime();
  const remaining = target - Date.now();
  if (remaining <= 0) return 'now';

  const minutes = Math.ceil(remaining / 60000);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const leftover = minutes % 60;
    return leftover > 0 ? `${hours}h ${leftover}m` : `${hours}h`;
  }

  const days = Math.ceil(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// ============================================================================
// PAGE
// ============================================================================

export default function AccountPage() {
  const { user, setUser, setPlan, setQuota, setSubscription } = useAppStore();
  const router = useRouter();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [billing, setBilling] = useState<BillingStatus | null>(null);

  const [fullName, setFullName] = useState('');
  const [propertyFocus, setPropertyFocus] = useState('');
  const [brandDNA, setBrandDNA] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [brandTone, setBrandTone] = useState('');

  const { startCheckout, cancelSubscription, isStarting, isConfirming } =
    useSubscriptionCheckout();

  const refreshBilling = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/status', { cache: 'no-store' });
      if (!res.ok) return;

      const data: BillingStatus = await res.json();
      setBilling(data);

      // Mirror into the store so the rest of the app sees the same plan
      // without each surface fetching independently.
      setPlan(data.planId);
      setQuota(data.quota);
      setSubscription(data.subscription);
    } catch {
      // Non-fatal: the page still renders, meters just show as unavailable.
    }
  }, [setPlan, setQuota, setSubscription]);

  useEffect(() => {
    async function load() {
      if (!user) {
        setIsLoading(false);
        return;
      }

      // Read from the store's own field. The previous version read
      // user.user_metadata.full_name, which the client user object does not
      // carry, so the input rendered empty even when a name was saved.
      setFullName(user.fullName ?? '');

      const [{ data: contextData }] = await Promise.all([
        supabase
          .from('user_context')
          .select('context_type, content')
          .eq('user_id', user.id),
        refreshBilling(),
      ]);

      if (contextData) {
        for (const row of contextData) {
          if (row.context_type === 'brand_dna') setBrandDNA(row.content);
          if (row.context_type === 'target_audience') setTargetAudience(row.content);
          if (row.context_type === 'property_focus') setPropertyFocus(row.content);
          if (row.context_type === 'brand_tone') setBrandTone(row.content);
        }
      }

      setIsLoading(false);
    }

    load();
  }, [user, supabase, refreshBilling]);

  const handleUpdateProfile = async () => {
    setIsSaving(true);
    const { data, error } = await supabase.auth.updateUser({
      data: { full_name: fullName },
    });

    if (error) {
      toast.error('Failed to update name');
    } else {
      // Mapped through toAppUser so the name survives. Writing
      // { id, email } here discarded it, which is why the field emptied
      // itself immediately after a successful save.
      if (data?.user) {
        setUser(toAppUser(data.user));
      }
      toast.success('Profile updated');
    }
    setIsSaving(false);
  };

  const handleSaveContext = async (type: string, content: string) => {
    if (!user) return;
    setIsSaving(true);

    await supabase.from('user_context').delete().eq('user_id', user.id).eq('context_type', type);
    const { error } = await supabase.from('user_context').insert({
      user_id: user.id,
      context_type: type,
      content,
    });

    setIsSaving(false);
    if (error) toast.error('Failed to save');
    else toast.success('Saved');
  };

  const handleUpgrade = (planId: 'starter' | 'pro' | 'agency') => {
    if (!user?.email) {
      toast.error('Your account email is missing. Sign in again.');
      return;
    }
    startCheckout({
      planId,
      email: user.email,
      name: fullName,
      onActivated: refreshBilling,
    });
  };

  const handleCancel = async () => {
    const confirmed = window.confirm(
      'Cancel your subscription? You keep full access until the end of your current billing period.'
    );
    if (!confirmed) return;

    const ok = await cancelSubscription();
    if (ok) await refreshBilling();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-[#050505] font-sans text-zinc-100 flex flex-col selection:bg-white/20">
      <header className="h-14 border-b border-white/5 flex items-center px-6 shrink-0 bg-[#050505]/80 backdrop-blur-md sticky top-0 z-50">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Workspace
        </Link>
      </header>

      <main className="flex flex-1 max-w-7xl w-full mx-auto mt-12 px-6">
        <aside className="w-64 pr-10 flex flex-col gap-1 shrink-0">
          <h2 className="text-xl font-semibold tracking-tight mb-6 px-3 text-white">Settings</h2>
          <nav className="flex flex-col gap-1">
            <SidebarButton active={activeTab === 'general'} onClick={() => setActiveTab('general')} icon={<User className="w-4 h-4" />} label="Account" />
            <SidebarButton active={activeTab === 'personalization'} onClick={() => setActiveTab('personalization')} icon={<Shield className="w-4 h-4" />} label="Strategic Memory" />
            <SidebarButton active={activeTab === 'billing'} onClick={() => setActiveTab('billing')} icon={<CreditCard className="w-4 h-4" />} label="Billing" />
            <SidebarButton active={activeTab === 'usage'} onClick={() => setActiveTab('usage')} icon={<Activity className="w-4 h-4" />} label="Usage" />
          </nav>
        </aside>

        <section className="flex-1 min-h-[600px] pb-24 border-l border-white/5 pl-10">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              {activeTab === 'general' && (
                <GeneralSettings
                  fullName={fullName} setFullName={setFullName}
                  handleUpdateProfile={handleUpdateProfile}
                  isSaving={isSaving} userEmail={user?.email} handleLogout={handleLogout}
                  avatarInitial={displayName(user).charAt(0).toUpperCase()}
                />
              )}
              {activeTab === 'personalization' && (
                <StrategicMemorySettings
                  propertyFocus={propertyFocus} setPropertyFocus={setPropertyFocus}
                  brandDNA={brandDNA} setBrandDNA={setBrandDNA}
                  targetAudience={targetAudience} setTargetAudience={setTargetAudience}
                  brandTone={brandTone} setBrandTone={setBrandTone}
                  handleSaveContext={handleSaveContext}
                />
              )}
              {activeTab === 'billing' && (
                <BillingSettings
                  billing={billing}
                  onUpgrade={handleUpgrade}
                  onCancel={handleCancel}
                  isStarting={isStarting}
                  isConfirming={isConfirming}
                />
              )}
              {activeTab === 'usage' && (
                <UsageSettings billing={billing} setActiveTab={setActiveTab} />
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// ============================================================================
// SHARED
// ============================================================================

function SidebarButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 ${active ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'}`}>
      {icon} {label}
    </button>
  );
}

function Meter({
  label, sublabel, used, budget, resetLabel, warnAt = 80,
}: {
  label: string; sublabel: string; used: number; budget: number; resetLabel: string; warnAt?: number;
}) {
  const pct = percentUsed(used, budget);
  const remaining = Math.max(0, budget - used);

  return (
    <div className="bg-[#09090B] border border-white/5 rounded-2xl p-6 shadow-sm">
      <div className="flex justify-between items-start mb-1">
        <div>
          <div className="text-sm font-medium text-zinc-300">{label}</div>
          <div className="text-xs text-zinc-600 mt-0.5">{sublabel}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white tracking-tight leading-none">
            {toGenerations(remaining).toLocaleString()}
          </div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1">left</div>
        </div>
      </div>

      <div className="w-full bg-[#1A1A1A] h-2.5 rounded-full overflow-hidden relative mt-4">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out ${
            pct >= 100 ? 'bg-red-500' : pct > warnAt ? 'bg-amber-500' : 'bg-white'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex justify-between items-center mt-3 text-xs">
        <span className="text-zinc-500">
          {toGenerations(used).toLocaleString()} of {toGenerations(budget).toLocaleString()} used
        </span>
        <span className="text-zinc-500">Resets in {resetLabel}</span>
      </div>
    </div>
  );
}

// ============================================================================
// GENERAL
// ============================================================================

function GeneralSettings({ fullName, setFullName, handleUpdateProfile, isSaving, userEmail, handleLogout, avatarInitial }: any) {
  return (
    <div className="max-w-3xl space-y-12">
      <section>
        <div className="mb-6 border-b border-white/5 pb-4">
          <h3 className="text-lg font-semibold text-white tracking-tight">Profile</h3>
          <p className="text-sm text-zinc-500 mt-1">Manage your identity across the workspace.</p>
        </div>
        <div className="grid grid-cols-[200px_1fr] gap-8 items-center mb-8">
          <label className="text-sm text-zinc-400 font-medium">Avatar</label>
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl border border-white/10 shadow-xl" style={{ background: 'linear-gradient(135deg, #18181b 0%, #09090b 100%)' }}>
            {avatarInitial}
          </div>
        </div>
        <div className="grid grid-cols-[200px_1fr] gap-8 items-center">
          <label className="text-sm text-zinc-400 font-medium">Full name</label>
          <div className="flex gap-3 max-w-md">
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-4 py-2.5 text-sm bg-[#09090B] text-white border border-white/10 rounded-lg focus:ring-2 focus:ring-white/20 focus:border-transparent outline-none transition-all placeholder:text-zinc-600 shadow-sm" placeholder="Enter your name" />
            <button onClick={handleUpdateProfile} disabled={isSaving || !fullName} className="px-6 py-2.5 bg-white text-black text-sm font-medium rounded-lg transition-all hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[80px]">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </button>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-6 border-b border-white/5 pb-4">
          <h3 className="text-lg font-semibold text-white tracking-tight">Account Security</h3>
          <p className="text-sm text-zinc-500 mt-1">Manage your sessions and device access.</p>
        </div>
        <div className="grid grid-cols-[200px_1fr] gap-8 items-start mb-8">
          <label className="text-sm text-zinc-400 font-medium pt-3">Active sessions</label>
          <div className="w-full max-w-md bg-[#09090B] border border-white/5 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-sm font-medium text-white">Current Session</span>
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">Active</span>
            </div>
            <div className="text-xs text-zinc-500">Logged in via {userEmail}</div>
          </div>
        </div>
        <div className="grid grid-cols-[200px_1fr] gap-8 items-center">
          <label className="text-sm text-zinc-400 font-medium">Device Management</label>
          <div>
            <button onClick={handleLogout} className="px-5 py-2.5 bg-transparent border border-red-500/20 text-red-400 hover:bg-red-500/10 text-sm font-medium rounded-lg transition-colors">
              Log out of all devices
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// BILLING
// ============================================================================

function BillingSettings({
  billing, onUpgrade, onCancel, isStarting, isConfirming,
}: {
  billing: BillingStatus | null;
  onUpgrade: (planId: 'starter' | 'pro' | 'agency') => void;
  onCancel: () => void;
  isStarting: boolean;
  isConfirming: boolean;
}) {
  if (!billing) {
    return <div className="text-sm text-zinc-500">Billing information is unavailable right now.</div>;
  }

  const isFree = billing.planId === 'free';
  const sub = billing.subscription;
  const busy = isStarting || isConfirming;

  // A renewal is being retried. Access continues through the grace window,
  // which the user needs told explicitly or a failed charge looks like
  // silent, unexplained deactivation.
  const inGrace = sub?.status === 'pending' && sub.graceUntil;

  return (
    <div className="max-w-5xl space-y-10">
      <div className="mb-8 border-b border-white/5 pb-4">
        <h3 className="text-lg font-semibold text-white tracking-tight">Billing &amp; Subscription</h3>
        <p className="text-sm text-zinc-500 mt-1">Manage your plan and payment method.</p>
      </div>

      {inGrace && (
        <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-xl p-5">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-amber-400 mb-1">Payment needs attention</h4>
            <p className="text-sm text-amber-400/80 leading-relaxed">
              We could not process your last renewal and are retrying. Your access continues
              until {formatDate(sub!.graceUntil)}. Updating your payment method in the Razorpay
              email will resolve it.
            </p>
          </div>
        </div>
      )}

      {sub?.cancelAtPeriodEnd && (
        <div className="flex items-start gap-3 bg-white/[0.03] border border-white/10 rounded-xl p-5">
          <Clock className="w-5 h-5 text-zinc-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-white mb-1">Subscription ending</h4>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Your plan is cancelled and will not renew. You keep full access
              until {formatDate(sub.currentPeriodEnd)}.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-[200px_1fr] gap-8 items-start">
        <label className="text-sm text-zinc-400 font-medium pt-1">Current Plan</label>
        <div className="w-full bg-[#09090B] border border-white/10 rounded-2xl p-8 shadow-xl">
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="text-xl font-bold text-white tracking-tight">{billing.planName}</div>
                {!isFree && !sub?.cancelAtPeriodEnd && (
                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    {sub?.status === 'pending' ? 'Retrying' : 'Active'}
                  </span>
                )}
              </div>
              <div className="text-sm text-zinc-400">
                {isFree
                  ? 'You are on the free tier.'
                  : `Renews ${formatDate(sub?.currentPeriodEnd ?? null)}`}
              </div>
            </div>
            {!isFree && !sub?.cancelAtPeriodEnd && (
              <button
                onClick={onCancel}
                className="px-5 py-2.5 bg-transparent border border-red-500/20 text-red-400 hover:bg-red-500/10 text-sm font-medium rounded-lg transition-colors"
              >
                Cancel plan
              </button>
            )}
          </div>
        </div>
      </div>

      {billing.availableUpgrades.length > 0 && (
        <div className="grid grid-cols-[200px_1fr] gap-8 items-start">
          <label className="text-sm text-zinc-400 font-medium pt-1">
            {isFree ? 'Upgrade' : 'Change plan'}
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {billing.availableUpgrades.map((tier) => (
              <div key={tier.planId} className="p-6 rounded-2xl bg-[#09090B] border border-white/5 hover:border-white/10 flex flex-col justify-between transition-all duration-300">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-3">
                    {tier.name}
                  </div>
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-4xl font-bold text-white tracking-tighter">{tier.displayPrice}</span>
                    <span className="text-xs text-zinc-500 font-medium">/month</span>
                  </div>
                  <p className="text-xs text-zinc-400 mb-6 min-h-[32px] leading-relaxed">{tier.tagline}</p>
                  <ul className="text-sm text-zinc-300 mb-6 space-y-3">
                    {tier.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-zinc-600" />
                        <span className="leading-relaxed text-xs">{feat}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="text-[10px] text-zinc-600 mb-4">
                    Pay with {tier.paymentMethods.join(', ')}
                  </div>
                </div>
                <button
                  onClick={() => onUpgrade(tier.planId)}
                  disabled={busy}
                  className="w-full py-3 rounded-xl text-sm font-medium transition-all flex justify-center items-center bg-white/5 text-white hover:bg-white/10 border border-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `Choose ${tier.name}`}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isFree && (
        <p className="text-xs text-zinc-600 max-w-2xl leading-relaxed">
          To switch plans, cancel your current subscription first. You keep access until the end
          of the period you have already paid for, and can subscribe to the new plan at any time.
        </p>
      )}
    </div>
  );
}

// ============================================================================
// USAGE
// ============================================================================

function UsageSettings({
  billing, setActiveTab,
}: {
  billing: BillingStatus | null;
  setActiveTab: (tab: Tab) => void;
}) {
  // Countdown re-renders every 30s so "resets in" does not sit frozen while
  // the tab is open.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!billing?.quota) {
    return <div className="text-sm text-zinc-500">Usage information is unavailable right now.</div>;
  }

  const q = billing.quota;
  const monthlyPct = percentUsed(q.monthlyUsed, q.monthlyBudget);

  return (
    <div className="max-w-3xl space-y-10">
      <div className="mb-8 border-b border-white/5 pb-4">
        <h3 className="text-lg font-semibold text-white tracking-tight">Usage</h3>
        <p className="text-sm text-zinc-500 mt-1">
          You have two limits: a short rolling window that prevents bursts, and a monthly total.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Meter
          label="Current window"
          sublabel="Short-term burst allowance"
          used={q.windowUsed}
          budget={q.windowBudget}
          resetLabel={formatResetCountdown(q.windowResetsAt)}
        />
        <Meter
          label="This month"
          sublabel="Your total monthly allowance"
          used={q.monthlyUsed}
          budget={q.monthlyBudget}
          resetLabel={formatResetCountdown(q.monthlyResetsAt)}
        />
      </div>

      <p className="text-xs text-zinc-600 leading-relaxed">
        Counts are approximate. A short reply costs less than a long multi-agent generation,
        so the number remaining moves faster on heavy work.
      </p>

      {monthlyPct >= 80 && billing.planId !== 'agency' && (
        <div className="flex items-center justify-between gap-4 bg-[#09090B] border border-white/10 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <Zap className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-white mb-0.5">
                You have used {monthlyPct}% of this month
              </div>
              <div className="text-xs text-zinc-500">
                Upgrading raises both your window and monthly limits immediately.
              </div>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('billing')}
            className="px-5 py-2.5 bg-white text-black text-sm font-medium rounded-lg hover:bg-zinc-200 transition-colors shrink-0"
          >
            Upgrade
          </button>
        </div>
      )}

      <div className="grid grid-cols-[200px_1fr] gap-8 items-start pt-8 border-t border-white/5">
        <div>
          <label className="text-sm text-zinc-400 font-medium">Ebooks</label>
          <p className="text-xs text-zinc-600 mt-1">Multi-chapter generation</p>
        </div>
        <div className="flex items-center justify-between bg-[#09090B] border border-white/5 rounded-xl p-5 shadow-sm">
          <span className="text-sm font-medium text-zinc-300">
            {q.ebooksAllowed === 0
              ? 'Not included on your plan'
              : `${q.ebooksUsed} of ${q.ebooksAllowed} used this month`}
          </span>
          {q.ebooksUsed >= q.ebooksAllowed && billing.planId !== 'agency' && (
            <button onClick={() => setActiveTab('billing')} className="text-sm text-blue-400 font-medium hover:text-blue-300 transition-colors">
              Upgrade
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STRATEGIC MEMORY
// ============================================================================

function StrategicMemorySettings(props: any) {
  const [activeSubTab, setActiveSubTab] = useState<StrategicMemoryTab>('identity');

  return (
    <div className="max-w-4xl space-y-8">
      <div className="mb-8">
        <h3 className="text-2xl font-semibold text-white tracking-tight mb-2">Strategic Memory</h3>
        <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
          Forge retrieves this on every generation. Manual context takes priority, then source
          documents, then public profile snapshots.
        </p>
      </div>

      <div className="flex space-x-1 border-b border-white/10 mb-8 pb-px">
        {([
          ['identity', 'Core Identity', <FileText key="i" className="w-4 h-4" />],
          ['knowledge', 'Knowledge Base', <UploadCloud key="k" className="w-4 h-4" />],
          ['social', 'Social DNA', <LinkIcon key="s" className="w-4 h-4" />],
        ] as const).map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() => setActiveSubTab(id as StrategicMemoryTab)}
            className={`flex items-center space-x-2 px-5 py-3 text-sm font-medium transition-all duration-200 border-b-2 -mb-[2px] ${
              activeSubTab === id ? 'text-white border-white' : 'text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            {icon}<span>{label}</span>
          </button>
        ))}
      </div>

      <div className="bg-[#09090B] border border-white/5 rounded-2xl p-8 shadow-2xl">
        {activeSubTab === 'identity' && <CoreIdentityForm {...props} />}
        {activeSubTab === 'knowledge' && <KnowledgeBaseManager />}
        {activeSubTab === 'social' && <SocialScraperManager />}
      </div>
    </div>
  );
}

function CoreIdentityForm({ propertyFocus, setPropertyFocus, brandDNA, setBrandDNA, targetAudience, setTargetAudience, brandTone, setBrandTone, handleSaveContext }: any) {
  return (
    <div className="space-y-8 animate-in fade-in duration-300 max-w-2xl">
      <div className="grid gap-2">
        <label className="text-sm font-medium text-zinc-300">Organization Type</label>
        <select value={propertyFocus} onChange={(e) => { setPropertyFocus(e.target.value); handleSaveContext('property_focus', e.target.value); }} className="w-full bg-[#121214] border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 transition-all appearance-none text-white shadow-sm">
          <option value="">Select an option...</option>
          <option value="boutique_hotel">Boutique Hotel / Independent</option>
          <option value="resort_group">Resort Group / Multi-Property</option>
          <option value="pms_software">Hospitality SaaS / PMS</option>
          <option value="agency">Marketing Agency</option>
        </select>
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium text-zinc-300 flex justify-between items-center">
          Core Brand DNA
          <span className="text-zinc-400 text-[10px] font-bold tracking-wider bg-white/10 px-2.5 py-1 rounded-full uppercase">Highest Priority</span>
        </label>
        <p className="text-xs text-zinc-500 mb-1">What are your contrarian beliefs in the market?</p>
        <textarea rows={4} value={brandDNA} onChange={(e) => setBrandDNA(e.target.value)} onBlur={() => handleSaveContext('brand_dna', brandDNA)} className="w-full bg-[#121214] border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 transition-all resize-y placeholder:text-zinc-600 text-white shadow-sm" placeholder="e.g., We are an asymmetric warfare division for brands..." />
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium text-zinc-300">Target Audience</label>
        <textarea rows={3} value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} onBlur={() => handleSaveContext('target_audience', targetAudience)} className="w-full bg-[#121214] border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 transition-all resize-y placeholder:text-zinc-600 text-white shadow-sm" placeholder="e.g., General Managers of 50-200 room properties..." />
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium text-zinc-300">Tone &amp; Voice</label>
        <textarea rows={2} value={brandTone} onChange={(e) => setBrandTone(e.target.value)} onBlur={() => handleSaveContext('brand_tone', brandTone)} className="w-full bg-[#121214] border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 transition-all resize-y placeholder:text-zinc-600 text-white shadow-sm" placeholder="e.g., Authoritative, minimalist, slightly provocative..." />
      </div>
    </div>
  );
}

function KnowledgeBaseManager() {
  const [isUploading, setIsUploading] = useState(false);
  const [sources, setSources] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    async function fetchSources() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('brand_dna_sources')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (data) setSources(data);
    }
    fetchSources();
  }, [supabase]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File exceeds the 5MB limit.');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    // 'text' means a pasted string with no file attached, which is a different
    // code path server-side. A .txt upload is a FILE and must be sent as 'txt'
    // or createBrandDnaSource rejects it for having no textContent.
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const sourceType =
      extension === 'pdf' ? 'pdf' :
      extension === 'md' || extension === 'markdown' ? 'md' :
      extension === 'docx' ? 'docx' :
      'txt';

    formData.append('sourceType', sourceType);
    formData.append('title', file.name);

    try {
      const res = await fetch('/api/brand-dna/upload', { method: 'POST', body: formData });
      const contentType = res.headers.get('content-type');

      if (!res.ok) {
        if (contentType?.includes('application/json')) {
          const data = await res.json();
          throw new Error(data.error);
        }
        throw new Error(`Upload failed (${res.status}).`);
      }

      const { source } = await res.json();
      setSources((prev) => [source, ...prev]);
      toast.success('Source added to Knowledge Base');
    } catch (error: any) {
      toast.error(error.message || 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Scoped by user_id in addition to RLS. RLS does enforce ownership here,
    // but a delete that relies solely on a policy being correct has no second
    // line of defence if that policy is ever changed.
    const { error } = await supabase
      .from('brand_dna_sources')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) toast.error('Could not remove that source.');
    else setSources((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.md,.txt,.docx" onChange={handleFileUpload} />
      <div onClick={isUploading ? undefined : () => fileInputRef.current?.click()} className={`border-2 border-dashed bg-[#121214] rounded-xl p-12 flex flex-col items-center justify-center transition-all group shadow-sm ${isUploading ? 'border-white/10 opacity-50 cursor-not-allowed' : 'border-white/10 hover:border-white/20 hover:bg-[#151518] cursor-pointer'}`}>
        <div className="bg-zinc-800/50 p-4 rounded-full mb-4 group-hover:bg-zinc-800 transition-colors">
          {isUploading ? <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" /> : <UploadCloud className="w-6 h-6 text-zinc-400 group-hover:text-white transition-colors" />}
        </div>
        <h3 className="text-sm font-medium text-white mb-1">{isUploading ? 'Processing document...' : 'Upload Source Documents'}</h3>
        <p className="text-xs text-zinc-500 mb-6">PDF, Word, Markdown, or text files up to 5MB.</p>
        <button disabled={isUploading} className="bg-white/5 hover:bg-white/10 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors border border-white/5 disabled:opacity-50">
          {isUploading ? 'Uploading...' : 'Browse Files'}
        </button>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Active Sources</h4>
        <div className="space-y-3">
          {sources.length === 0 ? (
            <div className="flex items-center justify-center p-6 border border-white/5 rounded-xl">
              <p className="text-sm text-zinc-500">No documents uploaded yet.</p>
            </div>
          ) : (
            sources.map((source) => (
              <div key={source.id} className="flex items-center justify-between bg-[#121214] border border-white/5 p-4 rounded-lg shadow-sm">
                <div className="flex items-center space-x-4">
                  <div className="bg-blue-500/10 text-blue-400 p-2 rounded flex-shrink-0"><FileText className="w-4 h-4" /></div>
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{source.title}</p>
                    <p className="text-xs text-zinc-500">{source.source_type.toUpperCase()}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="flex items-center text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full font-medium"><CheckCircle2 className="w-3 h-3 mr-1" /> Active</span>
                  <button onClick={() => handleDelete(source.id)} className="text-zinc-500 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SocialScraperManager() {
  const [url, setUrl] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [profiles, setProfiles] = useState<any[]>([]);
  const supabase = createClient();

  useEffect(() => {
    async function fetchProfiles() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('scraped_profiles')
        .select('*')
        .eq('user_id', user.id)
        .order('scraped_at', { ascending: false });
      if (data) setProfiles(data);
    }
    fetchProfiles();
  }, [supabase]);

  const handleSyncProfile = async () => {
    if (!url.trim()) {
      toast.error('Enter a profile URL');
      return;
    }

    setIsSyncing(true);
    try {
      const res = await fetch('/api/brand-dna/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileUrl: url.trim() }),
      });

      const contentType = res.headers.get('content-type');
      if (!res.ok) {
        if (contentType?.includes('application/json')) {
          const data = await res.json();
          throw new Error(data.error);
        }
        throw new Error(`Sync failed (${res.status}).`);
      }

      const { profile } = await res.json();
      setProfiles((prev) => [profile, ...prev.filter((p) => p.id !== profile.id)]);
      toast.success('Profile synced');
      setUrl('');
    } catch (error: any) {
      toast.error(error.message || 'Sync failed. Make sure the profile is public.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('scraped_profiles')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) toast.error('Could not remove that profile.');
    else setProfiles((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-5 flex items-start space-x-4">
        <ShieldAlert className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-medium text-blue-400 mb-1">Public metadata only</h4>
          <p className="text-sm text-blue-400/80 leading-relaxed">
            Forge reads what a public profile page exposes: bio, description, and positioning.
            Follower counts and engagement metrics are not available without official platform
            API access, and Forge will say so rather than estimate them.
          </p>
        </div>
      </div>

      <div className="flex space-x-3 max-w-2xl">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><LinkIcon className="h-4 w-4 text-zinc-500" /></div>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !isSyncing && handleSyncProfile()} disabled={isSyncing} className="w-full bg-[#121214] border border-white/10 rounded-lg pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 transition-all placeholder:text-zinc-600 text-white disabled:opacity-50 shadow-sm" placeholder="https://x.com/yourhandle" />
        </div>
        <button onClick={handleSyncProfile} disabled={isSyncing || !url} className="bg-white text-black hover:bg-zinc-200 px-6 py-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex items-center min-w-[120px] justify-center shadow-sm">
          {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sync Profile'}
        </button>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Monitored Profiles</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profiles.length === 0 ? (
            <div className="col-span-full flex items-center justify-center p-6 border border-white/5 rounded-xl">
              <p className="text-sm text-zinc-500">No profiles synced yet.</p>
            </div>
          ) : (
            profiles.map((profile) => (
              <div key={profile.id} className="bg-[#121214] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-sm text-white">{profile.platform}</span>
                    {profile.handle && <span className="text-xs text-zinc-500">@{profile.handle}</span>}
                  </div>
                  <button onClick={() => handleDelete(profile.id)} className="text-zinc-600 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <p className="text-xs text-zinc-400 line-clamp-2 mb-4">{profile.summary}</p>
                <div className="flex items-center text-xs text-zinc-500 space-x-1 font-medium">
                  <Clock className="w-3 h-3" />
                  <span>Next refresh: {formatDate(profile.next_refresh_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}