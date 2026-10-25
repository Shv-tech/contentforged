'use client';

/**
 * app/account/page.tsx
 *
 * One page for everything about the person rather than a piece of content:
 * the brief Forge reads before it writes, the documents and profiles behind
 * it, the plan, what is left this month, and the account itself.
 *
 * It scrolls as one page. The floating navigation follows the section in
 * view, and ?tab=brief|knowledge|billing|usage|notifications|connections|
 * developers|account|data deep-links into it (upgrade notes elsewhere in the
 * app link to ?tab=billing).
 *
 * Plan, subscription and quota come only from /api/billing/status, the
 * single server-side view of entitlement. The brief is stored in
 * user_context, which the chat's context builder reads on every turn.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowUpRight, Check, Loader2, Plus, X } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import { useSubscriptionCheckout } from '@/lib/billing/use-subscription-checkout';
import { displayName, toAppUser } from '@/lib/user-display';
import { Plate, cn, focusRing, type PlateName } from '@/components/forge/ui';
import { SectionHead, fieldDark, pillGhost, pillWhite } from '@/components/forge/account/accountStyle';
import { ApiKeysSection, ConnectionsSection, DataSection, InvoicesSection, NotificationsSection } from '@/components/forge/account/AccountSections';

// ============================================================================
// TYPES
// ============================================================================

type Section = 'brief' | 'knowledge' | 'billing' | 'usage' | 'notifications' | 'connections' | 'developers' | 'account';

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

interface BriefState {
  role: string;
  beliefs: string;
  audience: string;
  tone: string;
}

/** user_context.context_type for each brief field. Keys are read by lib/brand-dna. */
const CONTEXT_TYPES: Record<keyof BriefState, string> = {
  role: 'property_focus',
  beliefs: 'brand_dna',
  audience: 'target_audience',
  tone: 'brand_tone',
};

const ROLES: ReadonlyArray<{ value: string; label: string; hint: string }> = [
  { value: 'creator', label: 'Creator', hint: 'Writing as yourself' },
  { value: 'founder', label: 'Founder', hint: 'Building in public' },
  { value: 'consultant', label: 'Consultant or coach', hint: 'Selling expertise' },
  { value: 'ghostwriter', label: 'Ghostwriter', hint: 'Writing for clients' },
  { value: 'agency', label: 'Agency or team', hint: 'Many brands, one desk' },
  { value: 'company', label: 'Company brand', hint: 'An organisation account' },
];

const NAV: ReadonlyArray<{ id: Section; label: string }> = [
  { id: 'brief', label: 'Brief' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'billing', label: 'Plan' },
  { id: 'usage', label: 'Usage' },
  { id: 'notifications', label: 'Alerts' },
  { id: 'connections', label: 'Connections' },
  { id: 'developers', label: 'API' },
  { id: 'account', label: 'Account' },
];

// ============================================================================
// HELPERS
// ============================================================================

function percentUsed(used: number, budget: number): number {
  if (budget <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / budget) * 100)));
}

/**
 * Quota is metered in cost micros, which mean nothing to a person, so it is
 * shown as generations against a nominal cost per generation. The page says
 * the count is approximate: a War Room run costs several times a short reply.
 */
const MICROS_PER_GENERATION = 9500;

function toGenerations(micros: number): number {
  return Math.max(0, Math.round(micros / MICROS_PER_GENERATION));
}

function formatCountdown(iso: string | null): string {
  if (!iso) return 'soon';
  const remaining = new Date(iso).getTime() - Date.now();
  if (remaining <= 0) return 'now';
  const minutes = Math.ceil(remaining / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  const days = Math.ceil(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'not set';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const PLAN_PLATES: Record<string, PlateName> = { starter: 'ingot', pro: 'molten', agency: 'sparks' };

// ============================================================================
// BRIEF STRENGTH
//
// How much Forge has to work with, as one number and one next step. Each
// part maps to something the context builder actually reads, weighted by
// how much it changes the drafts.
// ============================================================================

interface StrengthInput {
  brief: BriefState;
  documents: number;
  profiles: number;
  voiceSamples: number | null;
}

interface StrengthPart {
  id: string;
  label: string;
  weight: number;
  done: boolean;
  next: string;
  target: Section | 'brand';
}

function strengthParts({ brief, documents, profiles, voiceSamples }: StrengthInput): StrengthPart[] {
  return [
    { id: 'beliefs', label: 'What you believe', weight: 25, done: brief.beliefs.trim().length >= 40, next: 'Write what you believe that others in your space do not.', target: 'brief' },
    { id: 'audience', label: 'Who you write for', weight: 20, done: brief.audience.trim().length >= 30, next: 'Describe who you write for, as specifically as you can.', target: 'brief' },
    { id: 'voice', label: 'Measured voice', weight: 20, done: (voiceSamples ?? 0) >= 5, next: 'Add five of your own posts so Forge can measure your voice.', target: 'brand' },
    { id: 'documents', label: 'Source documents', weight: 15, done: documents > 0, next: 'Add a document: a brand guide, an old deck, your best posts.', target: 'knowledge' },
    { id: 'tone', label: 'How you sound', weight: 10, done: brief.tone.trim().length >= 8, next: 'Say how you want to sound in a few words.', target: 'brief' },
    { id: 'role', label: 'What you are', weight: 5, done: brief.role !== '', next: 'Choose what best describes you.', target: 'brief' },
    { id: 'profiles', label: 'Public profiles', weight: 5, done: profiles > 0, next: 'Add the public profile you post from.', target: 'knowledge' },
  ];
}

// ============================================================================
// PAGE
// ============================================================================

export default function AccountPage() {
  const { user, setUser, setPlan, setQuota, setSubscription } = useAppStore();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [active, setActive] = useState<Section>('brief');
  const [isLoading, setIsLoading] = useState(true);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [fullName, setFullName] = useState('');
  const [brief, setBrief] = useState<BriefState>({ role: '', beliefs: '', audience: '', tone: '' });
  const [documents, setDocuments] = useState(0);
  const [profiles, setProfiles] = useState(0);
  const [voiceSamples, setVoiceSamples] = useState<number | null>(null);

  const { startCheckout, cancelSubscription, isStarting, isConfirming } = useSubscriptionCheckout();

  const refreshBilling = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/status', { cache: 'no-store' });
      if (!res.ok) return;
      const data: BillingStatus = await res.json();
      setBilling(data);
      // Mirrored into the store so every other surface shows the same plan.
      setPlan(data.planId);
      setQuota(data.quota);
      setSubscription(data.subscription);
    } catch {
      // Non-fatal: the sections say the data did not load.
    }
  }, [setPlan, setQuota, setSubscription]);

  // The store's user arrives from AuthProvider after the first render, and is
  // replaced with a new object on every auth event, so loading is keyed on
  // the id. Middleware guarantees a session here, so no user means not yet.
  const userId = user?.id ?? null;
  const storedName = user?.fullName ?? '';

  useEffect(() => {
    setFullName(storedName);
  }, [storedName]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function load() {
      const [{ data: contextRows }] = await Promise.all([
        supabase.from('user_context').select('context_type, content').eq('user_id', userId),
        refreshBilling(),
        fetch('/api/voice', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => !cancelled && setVoiceSamples(data?.fingerprint?.sample_count ?? data?.samples?.length ?? 0))
          .catch(() => !cancelled && setVoiceSamples(null)),
      ]);
      if (cancelled) return;

      const next: BriefState = { role: '', beliefs: '', audience: '', tone: '' };
      for (const row of contextRows ?? []) {
        const key = (Object.keys(CONTEXT_TYPES) as Array<keyof BriefState>).find((k) => CONTEXT_TYPES[k] === row.context_type);
        if (key) next[key] = row.content ?? '';
      }
      // Values saved before the role list changed are not shown as a choice.
      if (!ROLES.some((r) => r.value === next.role)) next.role = '';
      setBrief(next);
      setIsLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, supabase, refreshBilling]);

  // ----- navigation -----------------------------------------------------------

  const goTo = useCallback((section: Section) => {
    setActive(section);
    document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Deep link once the sections exist.
  useEffect(() => {
    if (isLoading) return;
    const requested = new URLSearchParams(window.location.search).get('tab');
    const alias: Record<string, string> = { general: 'account', personalization: 'brief', plan: 'billing', api: 'developers' };
    const target = requested ? (alias[requested] ?? requested) : null;
    // Invoices and data are parts of the plan and account sections without their own tab.
    const section = (target === 'invoices' ? 'billing' : target === 'data' ? 'account' : target) as Section | null;
    if (target && section && NAV.some((n) => n.id === section)) {
      requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: 'start' }));
      setActive(section);
      return;
    }
    if (section && NAV.some((n) => n.id === section)) {
      requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ block: 'start' }));
      setActive(section);
    }
  }, [isLoading]);

  // The navigation follows the section in view.
  useEffect(() => {
    if (isLoading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id as Section);
      },
      { rootMargin: '-35% 0px -55% 0px' }
    );
    NAV.forEach((n) => {
      const el = document.getElementById(n.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [isLoading]);

  // ----- actions --------------------------------------------------------------

  const saveName = async () => {
    const name = fullName.trim();
    if (!name) return false;
    const { data, error } = await supabase.auth.updateUser({ data: { full_name: name } });
    if (error) {
      toast.error('Could not save your name.');
      return false;
    }
    // Mapped through toAppUser so the name survives in the store.
    if (data?.user) setUser(toAppUser(data.user));
    return true;
  };

  const saveBriefField = useCallback(
    async (key: keyof BriefState, value: string): Promise<boolean> => {
      if (!userId) return false;
      const type = CONTEXT_TYPES[key];
      // One row per type: replace rather than accumulate versions. A failed
      // delete stops here, or the insert would leave two rows for one field.
      const removed = await supabase.from('user_context').delete().eq('user_id', userId).eq('context_type', type);
      const inserted =
        removed.error || !value.trim()
          ? removed
          : await supabase.from('user_context').insert({ user_id: userId, context_type: type, content: value.trim() });
      if (inserted.error) {
        toast.error('Could not save that. Check your connection and try again.');
        return false;
      }
      return true;
    },
    [supabase, userId]
  );

  const upgrade = (planId: UpgradeOption['planId']) => {
    if (!user?.email) {
      toast.error('Your account email is missing. Sign in again.');
      return;
    }
    startCheckout({ planId, email: user.email, name: fullName, onActivated: refreshBilling });
  };

  const cancel = async () => {
    const ok = await cancelSubscription();
    if (ok) await refreshBilling();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.push('/');
  };

  const parts = strengthParts({ brief, documents, profiles, voiceSamples });
  const strength = parts.reduce((sum, p) => sum + (p.done ? p.weight : 0), 0);
  const nextStep = parts.find((p) => !p.done) ?? null;
  const firstName = (fullName || displayName(user)).split(' ')[0];
  const generationsLeft = billing?.quota ? toGenerations(Math.max(0, billing.quota.monthlyBudget - billing.quota.monthlyUsed)) : null;

  const openStep = (step: StrengthPart) => {
    if (step.target === 'brand') router.push('/dashboard?view=brand&tab=voice');
    else goTo(step.target);
  };

  return (
    <div className="min-h-screen bg-black font-sans text-white antialiased selection:bg-white/20">
      <FloatingNav active={active} onSelect={goTo} />

      {isLoading ? (
        <div className="flex h-screen items-center justify-center text-white/40">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <main className="mx-auto max-w-[1180px] px-5 sm:px-8">
          <header className="grid gap-12 pb-24 pt-36 sm:pb-32 sm:pt-44 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-end">
            <div>
              <Reveal>
                <h1 className="text-[48px] font-semibold leading-[0.98] tracking-[-0.045em] sm:text-[84px]">
                  {greeting()}, {firstName}.
                </h1>
              </Reveal>
              <Reveal delay={0.08}>
                <p className="mt-7 max-w-[520px] text-[18px] leading-[1.55] text-white/55">
                  What Forge knows about you, the plan you are on, and how much you have left this month.
                </p>
              </Reveal>
            </div>
            <Reveal delay={0.16}>
              <StatusPanel
                strength={strength}
                nextStep={nextStep}
                onNextStep={openStep}
                planName={billing?.planName ?? 'Free'}
                generationsLeft={generationsLeft}
                onPlan={() => goTo('billing')}
                onUsage={() => goTo('usage')}
              />
            </Reveal>
          </header>

          <div className="space-y-32 pb-40 sm:space-y-44">
            <BriefSection brief={brief} setBrief={setBrief} onSave={saveBriefField} strength={strength} parts={parts} onStep={openStep} />
            <KnowledgeSection userId={userId!} onDocuments={setDocuments} onProfiles={setProfiles} />
            <div className="space-y-5">
              <PlanSection billing={billing} onUpgrade={upgrade} onCancel={cancel} busy={isStarting || isConfirming} />
              <InvoicesSection />
            </div>
            <UsageSection billing={billing} onPlans={() => goTo('billing')} />
            <NotificationsSection />
            <ConnectionsSection />
            <ApiKeysSection />
            <div className="space-y-5">
              <AccountSection fullName={fullName} setFullName={setFullName} onSaveName={saveName} email={user?.email ?? ''} onSignOut={signOut} />
              <DataSection />
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

// ============================================================================
// CHROME
// ============================================================================

function FloatingNav({ active, onSelect }: { active: Section; onSelect: (s: Section) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <nav
        aria-label="Account sections"
        className="pointer-events-auto flex w-full max-w-[1040px] items-center gap-1 rounded-full border border-white/[0.08] bg-[#0C0C0C]/80 p-1.5 pl-5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      >
        <Link href="/dashboard" className={cn('mr-auto rounded-full text-[14px] font-semibold tracking-[0.18em] text-white', focusRing)}>
          FORGE
        </Link>
        <div className="hidden items-center lg:flex">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onSelect(n.id)}
              aria-current={active === n.id ? 'true' : undefined}
              className={cn('relative rounded-full px-3.5 py-2 text-[14px] transition-colors', active === n.id ? 'text-white' : 'text-white/55 hover:text-white', focusRing)}
            >
              {active === n.id && (
                <motion.span layoutId="account-nav-pill" className="absolute inset-0 rounded-full bg-white/[0.08]" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
              )}
              <span className="relative">{n.label}</span>
            </button>
          ))}
        </div>
        <Link href="/dashboard" className={cn(pillWhite, 'ml-2 !py-2')}>
          Workspace
        </Link>
      </nav>
      {/* Below lg the sections move to a scrollable strip under the bar. */}
      <div className="pointer-events-auto absolute inset-x-0 top-[60px] flex justify-center px-4 lg:hidden">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-white/[0.08] bg-[#0C0C0C]/80 p-1 backdrop-blur-xl [scrollbar-width:none]">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onSelect(n.id)}
              aria-current={active === n.id ? 'true' : undefined}
              className={cn('shrink-0 rounded-full px-3.5 py-1.5 text-[13px] transition-colors', active === n.id ? 'bg-white text-black' : 'text-white/60', focusRing)}
            >
              {n.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** One orchestrated entrance for the hero; nothing else animates on its own. */
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 18, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Chip({ children, dot = '#FF8A2B' }: { children: React.ReactNode; dot?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-[12.5px] text-white/80 backdrop-blur">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      {children}
    </span>
  );
}

/** A circular gauge for brief strength. */
function Ring({ value, size = 64 }: { value: number; size?: number }) {
  const reduce = useReducedMotion();
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Brief strength ${value} percent`} className="-rotate-90">
      <defs>
        <linearGradient id="ring-ember" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFB067" />
          <stop offset="1" stopColor="#E0570A" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#ring-ember)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        initial={reduce ? false : { strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - value / 100) }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}

// ============================================================================
// HERO STATUS
// ============================================================================

function StatusPanel({
  strength,
  nextStep,
  onNextStep,
  planName,
  generationsLeft,
  onPlan,
  onUsage,
}: {
  strength: number;
  nextStep: StrengthPart | null;
  onNextStep: (step: StrengthPart) => void;
  planName: string;
  generationsLeft: number | null;
  onPlan: () => void;
  onUsage: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0B0B0B]">
      <div className="flex items-center gap-5 p-6">
        <div className="relative shrink-0">
          <Ring value={strength} />
          <span className="absolute inset-0 flex items-center justify-center text-[15px] font-semibold tabular-nums">{strength}</span>
        </div>
        <div className="min-w-0">
          <p className="text-[13px] text-white/45">Brief strength</p>
          {nextStep ? (
            <button type="button" onClick={() => onNextStep(nextStep)} className={cn('mt-1 text-left text-[15px] leading-snug text-white hover:text-[#FFB067]', focusRing, 'rounded-sm')}>
              {nextStep.next} <ArrowUpRight className="inline h-3.5 w-3.5" />
            </button>
          ) : (
            <p className="mt-1 text-[15px] text-white">Forge has everything it needs to write like you.</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 border-t border-white/[0.06]">
        <button type="button" onClick={onPlan} className={cn('px-6 py-4 text-left transition-colors hover:bg-white/[0.03]', focusRing)}>
          <span className="block text-[12.5px] text-white/40">Plan</span>
          <span className="mt-0.5 block text-[17px] font-semibold">{planName}</span>
        </button>
        <button type="button" onClick={onUsage} className={cn('border-l border-white/[0.06] px-6 py-4 text-left transition-colors hover:bg-white/[0.03]', focusRing)}>
          <span className="block text-[12.5px] text-white/40">Left this month</span>
          <span className="mt-0.5 block text-[17px] font-semibold tabular-nums">{generationsLeft === null ? 'Unavailable' : `${generationsLeft.toLocaleString()} generations`}</span>
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// BRIEF
// ============================================================================

type SaveState = 'idle' | 'saving' | 'saved';

/**
 * A field that saves on blur, only when its value changed, and says so in
 * place. A toast for every blur was noise; an inline "Saved" is enough.
 */
function useFieldSaver(save: (value: string) => Promise<boolean>, initial: string) {
  const [state, setState] = useState<SaveState>('idle');
  // Sections mount after the brief has loaded, so the first value is the saved one.
  const last = useRef(initial);
  const timer = useRef<number | null>(null);

  const commit = useCallback(
    async (value: string) => {
      if (value.trim() === last.current.trim()) return;
      setState('saving');
      const ok = await save(value);
      if (ok) {
        last.current = value;
        setState('saved');
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setState('idle'), 2200);
      } else {
        setState('idle');
      }
    },
    [save]
  );

  return { state, commit };
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-white/45" aria-live="polite">
      {state === 'saving' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-[#8EE3B0]" strokeWidth={2.5} />}
      {state === 'saving' ? 'Saving' : 'Saved'}
    </span>
  );
}

const briefField =
  'block w-full resize-none bg-transparent text-[21px] font-medium leading-[1.4] tracking-[-0.015em] text-white placeholder:text-white/[0.18] outline-none [field-sizing:content] min-h-[1.4em] sm:text-[22px]';

function BriefRow({
  id,
  label,
  note,
  state,
  count,
  children,
}: {
  id: string;
  label: string;
  note?: string;
  state: SaveState;
  count?: { value: number; good: number };
  children: React.ReactNode;
}) {
  return (
    <div className="group border-t border-white/[0.08] py-6 first:border-t-0 first:pt-0">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13.5px] text-white/50 transition-colors group-focus-within:text-white/80">
          {label}
        </label>
        <span className="flex items-center gap-3">
          <SaveIndicator state={state} />
          {note && state === 'idle' && <span className="text-[12.5px] text-[#FF9A52]">{note}</span>}
          {count && (
            <span className={cn('text-[12px] tabular-nums transition-opacity', count.value >= count.good ? 'text-white/30' : 'text-white/45', 'opacity-0 group-focus-within:opacity-100')}>
              {count.value}
            </span>
          )}
        </span>
      </div>
      {children}
    </div>
  );
}

function BriefTextField({
  id,
  label,
  note,
  value,
  onChange,
  onSave,
  placeholder,
  goodLength,
}: {
  id: string;
  label: string;
  note?: string;
  value: string;
  onChange: (value: string) => void;
  onSave: (value: string) => Promise<boolean>;
  placeholder: string;
  goodLength: number;
}) {
  const { state, commit } = useFieldSaver(onSave, value);
  return (
    <BriefRow id={id} label={label} note={note} state={state} count={{ value: value.trim().length, good: goodLength }}>
      <textarea
        id={id}
        rows={2}
        value={value}
        maxLength={2000}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => void commit(value)}
        className={briefField}
        placeholder={placeholder}
      />
    </BriefRow>
  );
}

function BriefSection({
  brief,
  setBrief,
  onSave,
  strength,
  parts,
  onStep,
}: {
  brief: BriefState;
  setBrief: React.Dispatch<React.SetStateAction<BriefState>>;
  onSave: (key: keyof BriefState, value: string) => Promise<boolean>;
  strength: number;
  parts: StrengthPart[];
  onStep: (step: StrengthPart) => void;
}) {
  const roleSaver = useFieldSaver((value) => onSave('role', value), brief.role);
  const set = (key: keyof BriefState) => (value: string) => setBrief((prev) => ({ ...prev, [key]: value }));
  const quote = brief.beliefs.trim();

  return (
    <section id="brief" className="scroll-mt-36 lg:scroll-mt-28">
      <SectionHead
        title="This is how Forge hears you."
        lead="Forge reads this before it writes a word. What you write here comes first, then your documents and profiles, then your measured voice."
      />

      <div className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[32px] bg-[#0E0E0E] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Plate name="molten" className="flex min-h-[320px] flex-col justify-between p-7 sm:p-9 lg:min-h-[620px]" dim={0.55} position="50% 70%">
          <div className="relative">
            <Chip dot="#FFB067">Your brief</Chip>
          </div>
          <div className="relative">
            <p className="max-w-[380px] text-[24px] font-semibold leading-[1.15] tracking-[-0.03em] text-white sm:text-[28px]">
              {quote ? `“${quote.length > 110 ? `${quote.slice(0, 108).trimEnd()}…` : quote}”` : 'Tell Forge what you believe.'}
            </p>
            <ul className="mt-8 flex flex-col gap-2">
              {parts.map((part) => (
                <li key={part.id}>
                  <button
                    type="button"
                    onClick={() => onStep(part)}
                    className={cn('flex items-center gap-2.5 rounded-sm text-[13.5px] transition-colors', part.done ? 'text-white/80' : 'text-white/45 hover:text-white', focusRing)}
                  >
                    <span
                      aria-hidden
                      className={cn('flex h-4 w-4 items-center justify-center rounded-full border', part.done ? 'border-transparent bg-white text-black' : 'border-white/30')}
                    >
                      {part.done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                    </span>
                    {part.label}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-[13px] text-white/55">{strength}% complete</p>
          </div>
        </Plate>

        <div className="min-w-0 p-7 sm:p-10">
          <BriefRow id="role" label="What best describes you" state={roleSaver.state}>
            <div role="radiogroup" aria-labelledby="role" className="flex flex-wrap gap-2 pt-1">
              {ROLES.map((role) => {
                const selected = brief.role === role.value;
                return (
                  <button
                    key={role.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      const next = selected ? '' : role.value;
                      setBrief((prev) => ({ ...prev, role: next }));
                      void roleSaver.commit(next);
                    }}
                    className={cn(
                      'group/role flex flex-col items-start rounded-[18px] border px-4 py-2.5 text-left transition-colors',
                      selected ? 'border-white bg-white text-black' : 'border-white/[0.12] text-white hover:border-white/30',
                      focusRing
                    )}
                  >
                    <span className="text-[14.5px] font-medium">{role.label}</span>
                    <span className={cn('text-[12px]', selected ? 'text-black/55' : 'text-white/40')}>{role.hint}</span>
                  </button>
                );
              })}
            </div>
          </BriefRow>

          <BriefTextField
            id="brand-dna"
            label="What you believe that others in your space don't"
            note="Weighted highest"
            value={brief.beliefs}
            onChange={set('beliefs')}
            onSave={(v) => onSave('beliefs', v)}
            placeholder="Most creators post more. We think they should post better."
            goodLength={40}
          />
          <BriefTextField
            id="target-audience"
            label="Who you're writing for"
            value={brief.audience}
            onChange={set('audience')}
            onSave={(v) => onSave('audience', v)}
            placeholder="Solo founders who know their product but hate writing about it."
            goodLength={30}
          />
          <BriefTextField
            id="brand-tone"
            label="How you want to sound"
            value={brief.tone}
            onChange={set('tone')}
            onSave={(v) => onSave('tone', v)}
            placeholder="Plain, direct, a little dry."
            goodLength={8}
          />
          <p className="pt-2 text-[13px] text-white/35">Saves when you leave a field.</p>
        </div>
      </div>

      <Link
        href="/dashboard?view=brand&tab=voice"
        className={cn(
          'group mt-5 flex flex-col gap-4 rounded-[28px] border border-white/[0.07] bg-[#0B0B0B] p-6 transition-colors hover:border-white/15 sm:flex-row sm:items-center sm:justify-between sm:p-7',
          focusRing
        )}
      >
        <div className="min-w-0">
          <p className="text-[17px] font-semibold text-white">Your voice, stories and rules live in Brand.</p>
          <p className="mt-1 text-[14.5px] leading-relaxed text-white/50">
            The measured Voice Fingerprint, the Story Bank Forge writes from, and the rules it has learned from your edits.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[14px] font-medium text-white">
          Open Brand <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </span>
      </Link>
    </section>
  );
}

// ============================================================================
// KNOWLEDGE
// ============================================================================

function KnowledgeSection({ userId, onDocuments, onProfiles }: { userId: string; onDocuments: (n: number) => void; onProfiles: (n: number) => void }) {
  return (
    <section id="knowledge" className="scroll-mt-36 lg:scroll-mt-28">
      <SectionHead
        title="What Forge has read."
        lead="Documents and public profiles fill in what the brief leaves out: your offer, your history, how you position yourself."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <DocumentsCard userId={userId} onCount={onDocuments} />
        <ProfilesCard userId={userId} onCount={onProfiles} />
      </div>
    </section>
  );
}

interface SourceRow {
  id: string;
  title: string;
  source_type: string;
  created_at: string;
}

const ACCEPTED = ['pdf', 'md', 'markdown', 'txt', 'docx'];

function DocumentsCard({ userId, onCount }: { userId: string; onCount: (n: number) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('brand_dna_sources').select('id, title, source_type, created_at').eq('user_id', userId).order('created_at', { ascending: false });
      if (data) setSources(data as SourceRow[]);
    })();
  }, [supabase, userId]);

  useEffect(() => onCount(sources.length), [sources.length, onCount]);

  const upload = async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ACCEPTED.includes(extension)) {
      toast.error('Use a PDF, Word, Markdown or text file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('That file is over 5 MB.');
      return;
    }

    // 'text' is the pasted-string path server-side; a .txt upload is a file
    // and must be sent as 'txt' or the source is rejected for having no text.
    const sourceType = extension === 'pdf' ? 'pdf' : extension === 'md' || extension === 'markdown' ? 'md' : extension === 'docx' ? 'docx' : 'txt';
    const form = new FormData();
    form.append('file', file);
    form.append('sourceType', sourceType);
    form.append('title', file.name);

    setUploading(file.name);
    try {
      const res = await fetch('/api/brand-dna/upload', { method: 'POST', body: form });
      if (!res.ok) {
        const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
        throw new Error(data?.error ?? `Upload failed (${res.status}).`);
      }
      const { source } = await res.json();
      setSources((prev) => [source, ...prev]);
      toast.success(`Forge read ${file.name}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setUploading(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async (id: string) => {
    // Scoped by user_id as well as RLS: a second line of defence if a policy changes.
    const { error } = await supabase.from('brand_dna_sources').delete().eq('id', id).eq('user_id', userId);
    if (error) toast.error('Could not remove that document.');
    else setSources((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div
      className={cn('flex flex-col rounded-[32px] bg-[#0E0E0E] p-7 transition-shadow sm:p-9', dragging && 'shadow-[inset_0_0_0_2px_rgba(255,176,103,0.6)]')}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void upload(file);
      }}
    >
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        accept=".pdf,.md,.markdown,.txt,.docx"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <Chip dot="#9AA8B8">Documents</Chip>
          <h3 className="mt-5 text-[26px] font-semibold leading-tight tracking-[-0.025em]">
            {sources.length === 0 ? 'Nothing to read yet.' : `${sources.length} document${sources.length === 1 ? '' : 's'} in memory.`}
          </h3>
          <p className="mt-2 max-w-[360px] text-[15px] leading-relaxed text-white/50">Brand guides, decks, your best posts. PDF, Word, Markdown or text, up to 5 MB. Drop a file here.</p>
        </div>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading !== null}
          aria-label="Add a document"
          className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/85 disabled:opacity-50', focusRing)}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
        </button>
      </div>

      {uploading && <p className="mt-6 text-[14px] text-white/55">Reading {uploading}</p>}

      {sources.length > 0 && (
        <ul className="mt-7 divide-y divide-white/[0.07]">
          {sources.map((source) => (
            <li key={source.id} className="flex items-center gap-4 py-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-[10.5px] font-semibold tracking-wide text-white/60">
                {source.source_type.toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-white/85">{source.title}</span>
                <span className="block text-[12px] text-white/35">Added {formatDate(source.created_at)}</span>
              </span>
              <button
                type="button"
                onClick={() => remove(source.id)}
                aria-label={`Remove ${source.title}`}
                className={cn('rounded-full p-2 text-white/30 transition hover:bg-white/[0.06] hover:text-white', focusRing)}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ProfileRow {
  id: string;
  platform: string;
  handle: string | null;
  summary: string | null;
  scraped_at: string | null;
}

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  x: 'X',
  twitter: 'X',
  threads: 'Threads',
  bluesky: 'Bluesky',
  instagram: 'Instagram',
  youtube: 'YouTube',
  website: 'Website',
};

function ProfilesCard({ userId, onCount }: { userId: string; onCount: (n: number) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [url, setUrl] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('scraped_profiles').select('id, platform, handle, summary, scraped_at').eq('user_id', userId).order('scraped_at', { ascending: false });
      if (data) setProfiles(data as ProfileRow[]);
    })();
  }, [supabase, userId]);

  useEffect(() => onCount(profiles.length), [profiles.length, onCount]);

  const sync = async () => {
    const value = url.trim();
    if (!value) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/brand-dna/scrape', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profileUrl: /^https?:\/\//.test(value) ? value : `https://${value}` }),
      });
      if (!res.ok) {
        const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
        throw new Error(data?.error ?? `Could not read that profile (${res.status}).`);
      }
      const { profile } = await res.json();
      setProfiles((prev) => [profile, ...prev.filter((p) => p.id !== profile.id)]);
      setUrl('');
      toast.success('Profile read.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read that profile. Make sure it is public.');
    } finally {
      setSyncing(false);
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('scraped_profiles').delete().eq('id', id).eq('user_id', userId);
    if (error) toast.error('Could not remove that profile.');
    else setProfiles((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="flex flex-col rounded-[32px] bg-[#0E0E0E] p-7 sm:p-9">
      <div className="self-start">
        <Chip dot="#8EE3B0">Public profiles</Chip>
      </div>
      <h3 className="mt-5 text-[26px] font-semibold leading-tight tracking-[-0.025em]">
        {profiles.length === 0 ? 'Where do you post?' : `${profiles.length} profile${profiles.length === 1 ? '' : 's'} read.`}
      </h3>
      <p className="mt-2 max-w-[380px] text-[15px] leading-relaxed text-white/50">
        Forge reads the public page only: bio and positioning. It never guesses at follower counts it cannot verify.
      </p>

      <form
        className="mt-7 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!syncing) void sync();
        }}
      >
        <label htmlFor="profile-url" className="sr-only">
          Public profile URL
        </label>
        <input
          id="profile-url"
          type="text"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={syncing}
          className={cn(fieldDark, 'disabled:opacity-50')}
          placeholder="linkedin.com/in/you"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button type="submit" disabled={syncing || !url.trim()} className={cn(pillWhite, 'shrink-0')}>
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
        </button>
      </form>

      {profiles.length > 0 && (
        <ul className="mt-6 divide-y divide-white/[0.07]">
          {profiles.map((profile) => (
            <li key={profile.id} className="flex items-start gap-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] text-white">
                  <span>{PLATFORM_LABELS[profile.platform] ?? profile.platform}</span>
                  {profile.handle && <span className="text-white/45"> @{profile.handle}</span>}
                </div>
                {profile.summary && <p className="mt-1 line-clamp-2 text-[14px] leading-relaxed text-white/50">{profile.summary}</p>}
                {/* Read once; add it again to refresh. */}
                <p className="mt-2 text-[12.5px] text-white/30">Read {formatDate(profile.scraped_at)}</p>
              </div>
              <button
                type="button"
                onClick={() => remove(profile.id)}
                aria-label={`Remove ${profile.handle ?? profile.platform}`}
                className={cn('rounded-full p-2 text-white/30 transition hover:bg-white/[0.06] hover:text-white', focusRing)}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================================
// PLAN
// ============================================================================

function PlanSection({
  billing,
  onUpgrade,
  onCancel,
  busy,
}: {
  billing: BillingStatus | null;
  onUpgrade: (planId: UpgradeOption['planId']) => void;
  onCancel: () => Promise<void>;
  busy: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (!billing) {
    return (
      <section id="billing" className="scroll-mt-36 lg:scroll-mt-28">
        <SectionHead title="Your plan." lead="Plan details did not load. Refresh the page to try again." />
      </section>
    );
  }

  const isFree = billing.planId === 'free';
  const sub = billing.subscription;
  // A renewal is being retried. Access continues through the grace window,
  // and the user needs to be told, or a failed charge looks like a silent shutdown.
  const inGrace = sub?.status === 'pending' && Boolean(sub.graceUntil);

  const lead = isFree
    ? 'Upgrade when Forge becomes part of how you work. Free keeps the grader, drafts, voice and Story Bank.'
    : sub?.cancelAtPeriodEnd
      ? `Cancelled. You keep everything until ${formatDate(sub.currentPeriodEnd)}.`
      : `Renews ${formatDate(sub?.currentPeriodEnd)}.`;

  const confirmCancel = async () => {
    setCancelling(true);
    await onCancel();
    setCancelling(false);
    setConfirming(false);
  };

  return (
    <section id="billing" className="scroll-mt-36 lg:scroll-mt-28">
      <SectionHead
        title={isFree ? 'You’re on Free.' : `You’re on ${billing.planName}.`}
        lead={lead}
        aside={
          !isFree && !sub?.cancelAtPeriodEnd ? (
            confirming ? (
              <div className="flex flex-col items-start gap-3 rounded-[22px] border border-white/[0.1] bg-[#0B0B0B] p-4 md:items-end">
                <p className="max-w-[300px] text-[13.5px] leading-relaxed text-white/65">You keep full access until the end of the period you have paid for.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setConfirming(false)} className={pillGhost}>
                    Keep plan
                  </button>
                  <button type="button" onClick={confirmCancel} disabled={cancelling} className={cn(pillGhost, '!border-[#FF8A65]/40 !text-[#FF9A85]')}>
                    {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancel plan'}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className={pillGhost}>
                Cancel plan
              </button>
            )
          ) : undefined
        }
      />

      {inGrace && (
        <div role="status" className="mb-6 rounded-[24px] bg-[#2A1B05] px-7 py-5 text-[15px] leading-relaxed text-[#FFD08A]">
          Your last payment did not go through, so it is being retried. You keep full access until {formatDate(sub!.graceUntil)}. Updating your payment method from the
          Razorpay email fixes it.
        </div>
      )}

      {billing.availableUpgrades.length > 0 && (
        <>
          <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
            {billing.availableUpgrades.map((tier) => (
              <article key={tier.planId} className="flex flex-col overflow-hidden rounded-[32px] bg-[#0E0E0E]">
                <Plate name={PLAN_PLATES[tier.planId] ?? 'steel'} className="flex aspect-[16/10] flex-col justify-between p-6" dim={0.45}>
                  <div className="relative">
                    <Chip dot="rgba(255,255,255,0.9)">{tier.name}</Chip>
                  </div>
                  <div className="relative flex items-baseline gap-1.5">
                    <span className="text-[52px] font-semibold leading-none tracking-[-0.045em] tabular-nums">{tier.displayPrice}</span>
                    <span className="text-[14px] text-white/75">a month</span>
                  </div>
                </Plate>
                <div className="flex flex-1 flex-col p-7">
                  <p className="text-[17px] leading-snug text-white/85">{tier.tagline}</p>
                  <ul className="mt-6 flex-1 space-y-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex gap-3 text-[15px] leading-snug text-white/60">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-white/80" strokeWidth={2.25} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => onUpgrade(tier.planId)} disabled={busy} className={cn(pillWhite, 'mt-8 w-full py-3')}>
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Choose {tier.name} <ArrowUpRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                  <p className="mt-3 text-center text-[12.5px] text-white/35">Pay with {tier.paymentMethods.join(', ')}</p>
                </div>
              </article>
            ))}
          </div>
          {!isFree && (
            <p className="mt-6 max-w-[620px] text-[14px] leading-relaxed text-white/40">
              To switch plans, cancel this one first. You keep it until the period you have paid for ends, then you can start the new one.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ============================================================================
// USAGE
// ============================================================================

function UsageSection({ billing, onPlans }: { billing: BillingStatus | null; onPlans: () => void }) {
  // Re-render every 30 seconds so "resets in" does not sit frozen.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!billing?.quota) {
    return (
      <section id="usage" className="scroll-mt-36 lg:scroll-mt-28">
        <SectionHead title="Usage." lead="Usage did not load. Refresh the page to try again." />
      </section>
    );
  }

  const q = billing.quota;
  const monthlyPct = percentUsed(q.monthlyUsed, q.monthlyBudget);
  const monthlyLeft = toGenerations(Math.max(0, q.monthlyBudget - q.monthlyUsed));
  const canUpgrade = billing.planId !== 'agency';

  return (
    <section id="usage" className="scroll-mt-36 lg:scroll-mt-28">
      <SectionHead
        title={`${monthlyLeft.toLocaleString()} generations left this month.`}
        lead="Counts are approximate. A long, multi-step piece like a War Room run uses more than a short reply."
        aside={
          monthlyPct >= 80 && canUpgrade ? (
            <button type="button" onClick={onPlans} className={pillWhite}>
              Raise my limits
            </button>
          ) : undefined
        }
      />
      <div className="grid gap-5 md:grid-cols-3">
        <BigStat
          value={`${monthlyPct}%`}
          label="of this month used"
          detail={`${toGenerations(q.monthlyUsed).toLocaleString()} of ${toGenerations(q.monthlyBudget).toLocaleString()}. Resets in ${formatCountdown(q.monthlyResetsAt)}.`}
          pct={monthlyPct}
        />
        <BigStat
          value={toGenerations(Math.max(0, q.windowBudget - q.windowUsed)).toLocaleString()}
          label="left in this window"
          detail={`A short-term limit that smooths out bursts. Resets in ${formatCountdown(q.windowResetsAt)}.`}
          pct={percentUsed(q.windowUsed, q.windowBudget)}
        />
        <BigStat
          value={q.ebooksAllowed === 0 ? 'None' : `${q.ebooksUsed}/${q.ebooksAllowed}`}
          label="ebooks this month"
          detail={q.ebooksAllowed === 0 ? 'Not included on your plan.' : 'Full, multi-chapter books.'}
          pct={q.ebooksAllowed === 0 ? 0 : percentUsed(q.ebooksUsed, q.ebooksAllowed)}
          action={
            (q.ebooksAllowed === 0 || q.ebooksUsed >= q.ebooksAllowed) && canUpgrade ? (
              <button type="button" onClick={onPlans} className={cn('rounded-sm text-[14px] font-medium text-white underline decoration-white/30 underline-offset-4 hover:decoration-white', focusRing)}>
                See plans
              </button>
            ) : undefined
          }
        />
      </div>
    </section>
  );
}

function BigStat({ value, label, detail, pct, action }: { value: string; label: string; detail: string; pct: number; action?: React.ReactNode }) {
  const reduce = useReducedMotion();
  const fill = pct >= 100 ? '#FF8A65' : pct > 80 ? 'linear-gradient(90deg,#E0570A,#FFB067)' : '#FFFFFF';
  return (
    <div className="flex flex-col rounded-[32px] bg-[#0E0E0E] p-7 sm:p-9">
      <div className="text-[62px] font-semibold leading-none tracking-[-0.05em] tabular-nums sm:text-[74px]">{value}</div>
      <div className="mt-3 text-[17px] text-white/80">{label}</div>
      <div className="mt-8 h-[3px] overflow-hidden rounded-full bg-white/[0.08]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: fill }}
          initial={reduce ? false : { width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <p className="text-[13.5px] leading-relaxed text-white/40">{detail}</p>
        {action}
      </div>
    </div>
  );
}

// ============================================================================
// ACCOUNT
// ============================================================================

function AccountSection({
  fullName,
  setFullName,
  onSaveName,
  email,
  onSignOut,
}: {
  fullName: string;
  setFullName: (value: string) => void;
  onSaveName: () => Promise<boolean>;
  email: string;
  onSignOut: () => Promise<void>;
}) {
  const [state, setState] = useState<SaveState>('idle');
  const [signingOut, setSigningOut] = useState(false);

  const save = async () => {
    setState('saving');
    const ok = await onSaveName();
    setState(ok ? 'saved' : 'idle');
    if (ok) window.setTimeout(() => setState('idle'), 2200);
  };

  return (
    <section id="account" className="scroll-mt-36 lg:scroll-mt-28">
      <SectionHead title="Account." lead={email ? `Signed in as ${email}.` : undefined} />
      <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
        <div className="rounded-[32px] bg-[#0E0E0E] p-7 sm:p-9">
          <div className="flex items-center justify-between">
            <label htmlFor="full-name" className="text-[13.5px] text-white/45">
              Your name
            </label>
            <SaveIndicator state={state} />
          </div>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (state !== 'saving' && fullName.trim()) void save();
            }}
          >
            <input id="full-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className={fieldDark} placeholder="Your name" autoComplete="name" maxLength={80} />
            <button type="submit" disabled={state === 'saving' || !fullName.trim()} className={cn(pillWhite, 'min-w-[84px] shrink-0')}>
              {state === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </button>
          </form>
          <p className="mt-4 text-[13.5px] text-white/35">How Forge greets you, here and in the workspace.</p>
        </div>

        <div className="flex flex-col justify-between rounded-[32px] bg-[#0E0E0E] p-7 sm:p-9">
          <div>
            <div className="flex items-center gap-2 text-[13.5px] text-white/45">
              <span className="h-1.5 w-1.5 rounded-full bg-[#8EE3B0]" /> Signed in on this browser
            </div>
            <p className="mt-4 text-[15px] leading-relaxed text-white/60">Signing out ends this session. Browser extension tokens stay valid until you revoke them under Settings in Brand.</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              setSigningOut(true);
              await onSignOut();
            }}
            disabled={signingOut}
            className={cn(pillGhost, 'mt-8 self-start !text-[#FF9A85] hover:!border-[#FF8A65]/50')}
          >
            {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign out'}
          </button>
        </div>
      </div>
    </section>
  );
}
