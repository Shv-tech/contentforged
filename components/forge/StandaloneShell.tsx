'use client';

/**
 * The frame for the full-screen pages that open from the phone's home
 * screen or a notification (capture, review, the draft studio): Forge's
 * mark, the brand being worked on, and a way back to the workspace.
 * Loads the stores the dashboard would otherwise have loaded.
 */

import Link from 'next/link';
import { useEffect } from 'react';
import { useActiveBrand, useProfileStore, useWorkspaceStore } from '@/lib/forge/client';
import { registerServiceWorker } from '@/lib/forge/push-client';
import { trackSessionStart } from '@/lib/forge/telemetry';
import { ForgeMark } from '@/components/forge/icons';
import { cn, focusRing } from '@/components/forge/ui';

export function StandaloneShell({
  title,
  surface,
  children,
  actions,
  width = 'narrow',
  showBrand = true,
}: {
  title: string;
  /** For the session event: which surface the person opened. */
  surface: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  width?: 'narrow' | 'wide';
  /** Off for pages about the whole product rather than one brand. */
  showBrand?: boolean;
}) {
  const loadWorkspaces = useWorkspaceStore((s) => s.load);
  const loadProfile = useProfileStore((s) => s.load);
  const brand = useActiveBrand();

  useEffect(() => {
    void loadWorkspaces();
    void loadProfile();
    void registerServiceWorker();
    trackSessionStart(surface);
  }, [loadWorkspaces, loadProfile, surface]);

  return (
    <div className="min-h-[100dvh] bg-forge-ink font-sans text-white">
      <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-black/80 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className={cn('mx-auto flex h-14 items-center gap-3 px-4', width === 'wide' ? 'max-w-[1240px]' : 'max-w-[720px]')}>
          <Link href="/dashboard" className={cn('flex items-center gap-2.5 rounded-full', focusRing)} aria-label="Back to Forge">
            <ForgeMark className="h-6 w-6" />
          </Link>
          <div className="min-w-0 flex-1 leading-tight">
            <h1 className="truncate text-[15px] font-semibold text-white">{title}</h1>
            {showBrand && <p className="truncate text-[11.5px] text-white/40">{brand.name}</p>}
          </div>
          {actions}
        </div>
      </header>
      <main className={cn('mx-auto w-full px-4 pb-[calc(env(safe-area-inset-bottom)+40px)] pt-6', width === 'wide' ? 'max-w-[1240px]' : 'max-w-[720px]')}>{children}</main>
    </div>
  );
}
