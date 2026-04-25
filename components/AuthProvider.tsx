'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useAppStore } from '@/lib/store';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setPlan, setCreditsRemaining } = useAppStore();

  useEffect(() => {
    const supabase = createClient();

    // Function to pull the user's actual database row
    const fetchDatabaseProfile = async (userId: string) => {
      const { data, error } = await supabase
        .from('users')
        .select('plan, credits_remaining')
        .eq('id', userId)
        .single();

      if (!error && data) {
        // Hydrate the global store with their actual subscription data
        setPlan(data.plan as any);
        if (setCreditsRemaining) setCreditsRemaining(data.credits_remaining);
      }
    };

    // 1. Instantly check for an active session on first load
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        // FIX: Map Supabase user to strict store shape, handling undefined email
        setUser({ id: session.user.id, email: session.user.email || '' });
        fetchDatabaseProfile(session.user.id); // Fetch their plan
      } else {
        setUser(null);
        setPlan('free'); // Reset if logged out
      }
    });

    // 2. Listen continuously for login/logout events across all tabs
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          // FIX: Map Supabase user to strict store shape, handling undefined email
          setUser({ id: session.user.id, email: session.user.email || '' });
          fetchDatabaseProfile(session.user.id); // Fetch their plan on login
        } else {
          setUser(null);
          setPlan('free'); // Reset if logged out
        }
      }
    );

    // Cleanup listener on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, [setUser, setPlan, setCreditsRemaining]);

  return <>{children}</>;
}