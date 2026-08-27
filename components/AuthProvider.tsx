'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useAppStore } from '@/lib/store';
import { toAppUser } from '@/lib/user-display';

/**
 * 
 * 
 *
 * 1. The user is mapped through toAppUser() instead of being reduced to
 *    { id, email }. The previous shape discarded the display name, so every
 *    surface fell back to the email prefix even when the user had set a name.
 *
 * 2. Plan comes from /api/billing/status rather than a direct table read. The
 *    previous version queried `users` for `plan` and `credits_remaining`:
 *    neither the table nor those columns match the current schema, and the
 *    error was swallowed, so the store silently kept whatever plan it already
 *    had. Reading through the API also applies the lapsed-subscription
 *    fallback, so a user whose period ended is correctly shown as free
 *    without any client-side date logic.
 *
 * 3. Quota and subscription are hydrated at the same time, so the sidebar and
 *    usage meters are correct on first paint instead of only after visiting
 *    the account page.
 *
 * Entitlement here is a DISPLAY CACHE. Every enforcement decision happens
 * server-side against the database. If this cache is wrong or stale, the worst
 * case is a briefly incorrect badge, never unauthorized access.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser = useAppStore((state) => state.setUser);
  const setPlan = useAppStore((state) => state.setPlan);
  const setQuota = useAppStore((state) => state.setQuota);
  const setSubscription = useAppStore((state) => state.setSubscription);

  useEffect(() => {
    const supabase = createClient();
    // Guards against writing state after the component unmounts, which React
    // warns about and which can otherwise resurrect a signed-out session.
    let active = true;

    /**
     * Pulls plan, quota and subscription from the server.
     *
     * Deliberately tolerant: a failure here leaves the user signed in with
     * default free-tier display values rather than blocking the app. The
     * server enforces the real limits regardless of what this returns.
     */
    const hydrateBilling = async () => {
      try {
        const res = await fetch('/api/billing/status', { cache: 'no-store' });
        if (!res.ok || !active) return;

        const data = await res.json();
        if (!active) return;

        setPlan(data.planId ?? 'free');
        setQuota(data.quota ?? null);
        setSubscription(data.subscription ?? null);
      } catch {
        // Network failure on a display cache is not worth surfacing to the
        // user. They will see free-tier defaults until the next load.
      }
    };

    /**
     * Reports the browser's timezone once per session.
     *
     * Fire-and-forget and deliberately silent: this is a quality-of-life
     * detail, and a user should never see an error about it. If it fails the
     * profile keeps its previous value, or UTC for a new account.
     *
     * Sent on every session start rather than only at signup, so someone who
     * moves or travels gets corrected without doing anything.
     */
    const reportTimezone = () => {
      try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (!timezone) return;

        void fetch('/api/user/timezone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timezone }),
        }).catch(() => {});
      } catch {
        // Intl is present in every browser this app supports, but a failure
        // here must not interfere with signing in.
      }
    };

    const applySession = (session: { user?: any } | null) => {
      if (!active) return;

      if (session?.user) {
        setUser(toAppUser(session.user));
        void hydrateBilling();
        reportTimezone();
      } else {
        // Full reset on sign-out. Leaving plan or quota behind would show the
        // next person to use this browser the previous user's tier.
        setUser(null);
        setPlan('free');
        setQuota(null);
        setSubscription(null);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }: any) => {
      applySession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      applySession(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
    // Store setters from Zustand are stable across renders, so this runs once.
  }, [setUser, setPlan, setQuota, setSubscription]);

  return <>{children}</>;
}