'use client';

/**
 * The frame every non-chat view sits in: a scroll container, a top bar that
 * keeps the sidebar reachable on a phone, and a title block.
 */

import { useAppStore } from '@/lib/store';
import { PaneHeader, cn, focusRing } from '../ui';

export function ViewShell({
  title,
  subtitle,
  actions,
  children,
  width = 'default',
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  width?: 'default' | 'wide';
}) {
  const { isSidebarOpen, toggleSidebar } = useAppStore();

  return (
    <div className="custom-scrollbar h-full w-full min-w-0 overflow-y-auto overflow-x-hidden bg-forge-ink">
      <div className="sticky top-0 z-20 flex h-14 items-center px-4">
        <button
          type="button"
          onClick={() => toggleSidebar()}
          className={cn(
            'rounded-full border border-white/[0.08] bg-forge-raised p-2.5 text-white/55 transition-colors hover:text-white',
            isSidebarOpen && 'md:hidden',
            focusRing
          )}
          aria-label="Open navigation"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
            <path d="M9.5 4.5v15" />
          </svg>
        </button>
      </div>
      <div className={cn('mx-auto w-full px-4 pb-24 sm:px-8', width === 'wide' ? 'max-w-[1120px]' : 'max-w-[880px]')}>
        <PaneHeader title={title} subtitle={subtitle} actions={actions} className="mb-8" />
        {children}
      </div>
    </div>
  );
}

/**
 * Opens the chat with text in the composer. Views use this for "Write about
 * this" style actions instead of reaching into the editor's state.
 */
export const COMPOSE_EVENT = 'forge:compose';

export interface ComposeDetail {
  text: string;
  /** Send immediately instead of leaving it in the composer. */
  send?: boolean;
  /** Start a new conversation first. */
  fresh?: boolean;
  tool?: string | null;
}

let pendingCompose: ComposeDetail | null = null;

export function composeInChat(detail: ComposeDetail) {
  const store = useAppStore.getState();
  if (detail.fresh) store.setActiveSessionId(null);
  if (detail.tool !== undefined) store.setActiveTool(detail.tool);
  pendingCompose = detail;
  store.setSidebarView('chat');
  // A mounted editor picks it up from the event; one that mounts because of
  // the view switch takes it on mount.
  window.dispatchEvent(new Event(COMPOSE_EVENT));
}

/** Returns and clears the pending compose request. */
export function takePendingCompose(): ComposeDetail | null {
  const detail = pendingCompose;
  pendingCompose = null;
  return detail;
}
