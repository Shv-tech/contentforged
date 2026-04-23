'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useAppStore } from '@/lib/store';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser } = useAppStore();

  useEffect(() => {
    const supabase = createClient();

    // 1. Instantly check for an active session on first load
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && session.user.email) {
        setUser({ id: session.user.id, email: session.user.email });
      } else {
        setUser(null);
      }
    });

    // 2. Listen continuously for login/logout events across all tabs
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user && session.user.email) {
          setUser({ id: session.user.id, email: session.user.email });
        } else {
          setUser(null);
        }
      }
    );

    // Cleanup listener on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, [setUser]);

  return <>{children}</>;
}