'use client';

/**
 * The navigation column: new chat, the views, Recents, and the account.
 *
 * Recents are ordered by last activity (chat_sessions.last_message_at, kept
 * current by the chat route), not creation time, and grouped by when they
 * were last used. The previous ordering by created_at buried a conversation
 * the user was still working in under every chat started since.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { MoreVertical, Edit2, Share2, Trash2 } from 'lucide-react';
import { useAppStore, type SidebarView } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import { displayName, userInitial } from '@/lib/user-display';
import { PLANS } from '@/lib/billing/plans';
import { cn, focusRing, useDismiss } from '@/components/forge/ui';
import { WorkspaceSwitcher } from '@/components/forge/workspaces/WorkspaceSwitcher';
import { useWorkspaceStore } from '@/lib/forge/client';

interface SessionRow {
  id: string;
  title: string;
  created_at: string;
  last_message_at: string | null;
}

const NAV: ReadonlyArray<{ view: SidebarView; label: string; icon: string }> = [
  { view: 'search', label: 'Search', icon: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4' },
  { view: 'inbox', label: 'Inbox', icon: 'M4 13.5 6.5 5h11l2.5 8.5V19H4v-5.5ZM4 13.5h4.5l1.5 2.5h4l1.5-2.5H20' },
  { view: 'plan', label: 'This week', icon: 'M4 6h16v14H4V6ZM4 10h16M8 3v4M16 3v4M8 14l2.5 2.5L16 13' },
  { view: 'drafts', label: 'Drafts', icon: 'M5 4h10l4 4v12H5V4ZM15 4v4h4M8.5 12h7M8.5 16h5' },
  { view: 'brand', label: 'Brand', icon: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM8.5 14c.9 1.2 2 1.8 3.5 1.8s2.6-.6 3.5-1.8M9 9.5h.01M15 9.5h.01' },
  { view: 'signals', label: 'Signals', icon: 'M4 18a8 8 0 0 1 16 0M7.5 18a4.5 4.5 0 0 1 9 0M12 18h.01M12 4v3' },
  { view: 'playbook', label: 'Playbook', icon: 'M4 20V10M10 20V4M16 20v-7M21 20H3' },
  { view: 'formats', label: 'Formats', icon: 'M4 5h7v6H4V5ZM13 5h7v3h-7V5ZM13 10h7v9h-7v-9ZM4 13h7v6H4v-6Z' },
  { view: 'team', label: 'Team', icon: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.8c1.7.7 2.8 2.5 3 5.2' },
  { view: 'calendar', label: 'Calendar', icon: 'M4 6h16v14H4V6ZM4 10h16M8 3v4M16 3v4' },
  { view: 'ebooks', label: 'Ebooks', icon: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15ZM5 19.5A1.5 1.5 0 0 0 6.5 21H19' },
];

function NavIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** "Today", "Yesterday", "This week", "This month", "Older". */
function activityGroup(iso: string, now: Date): string {
  const date = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const t = date.getTime();
  if (t >= startOfToday) return 'Today';
  if (t >= startOfToday - day) return 'Yesterday';
  if (t >= startOfToday - 6 * day) return 'This week';
  if (t >= startOfToday - 29 * day) return 'This month';
  return 'Older';
}

export function SidebarPane() {
  const { user, activeSessionId, setActiveSessionId, isSidebarOpen, toggleSidebar, sidebarView, plan, setSidebarView } = useAppStore();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const workspaceId = useWorkspaceStore((s) => s.activeId);
  const workspacesLoaded = useWorkspaceStore((s) => s.loaded);

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const menuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const closeMenu = useCallback(() => {
    setMenuOpen(null);
    setConfirmDelete(false);
  }, []);
  useDismiss(menuOpen !== null, closeMenu, [menuRef]);

  /**
   * On a phone the sidebar covers what it navigates to, so it closes after a
   * choice. On desktop it is a persistent column and stays.
   */
  const closeOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768 && isSidebarOpen) toggleSidebar();
  };

  const fetchSessions = useCallback(async () => {
    if (!user || !workspacesLoaded) return;
    const base = supabase.from('chat_sessions').select('id, title, created_at, last_message_at').eq('user_id', user.id);
    // Each brand has its own Recents.
    const scoped = workspaceId ? base.eq('workspace_id', workspaceId) : base.is('workspace_id', null);
    const { data } = await scoped
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(150);
    if (data) setSessions(data as SessionRow[]);
  }, [supabase, user, workspaceId, workspacesLoaded]);

  useEffect(() => {
    void fetchSessions();
    const refresh = () => void fetchSessions();
    window.addEventListener('refresh-sidebar', refresh);
    return () => window.removeEventListener('refresh-sidebar', refresh);
  }, [fetchSessions, activeSessionId]);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  const grouped = useMemo(() => {
    const now = new Date();
    const groups: Array<{ label: string; items: SessionRow[] }> = [];
    for (const session of sessions) {
      const label = activityGroup(session.last_message_at ?? session.created_at, now);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(session);
      else groups.push({ label, items: [session] });
    }
    return groups;
  }, [sessions]);

  const newChat = () => {
    // A session row is created when the first message is sent, so an
    // abandoned "New chat" never leaves an empty entry in Recents.
    setActiveSessionId(null);
    setSidebarView('chat');
    closeOnMobile();
  };

  const open = (view: SidebarView) => {
    setSidebarView(view);
    closeOnMobile();
  };

  const deleteSession = async (id: string) => {
    if (!user) return;
    // Scoped by user_id as well as id: RLS enforces ownership, and this is
    // the second line of defence if a policy ever changes.
    const { error } = await supabase.from('chat_sessions').delete().eq('id', id).eq('user_id', user.id);
    if (error) {
      toast.error('Could not delete that conversation.');
      return;
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) setActiveSessionId(null);
    closeMenu();
  };

  const shareSession = async (id: string) => {
    const { data, error } = await supabase.from('chat_sessions').update({ is_public: true }).eq('id', id).select('share_token').single();
    closeMenu();
    if (error || !data) {
      toast.error('Could not create a share link.');
      return;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/${data.share_token}`);
      toast.success('Share link copied. Anyone with it can read this conversation.');
    } catch {
      toast.error('Could not copy the link.');
    }
  };

  const saveRename = async (id: string) => {
    const title = editTitle.trim();
    setEditingId(null);
    if (!title) return;
    const { error } = await supabase.from('chat_sessions').update({ title }).eq('id', id);
    if (error) {
      toast.error('Could not rename that conversation.');
      return;
    }
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
  };

  const name = displayName(user);
  const planLabel = PLANS[plan]?.name ?? 'Free';

  return (
    <>
      {/*
        Scrim: mobile only, while the drawer is open. The drawer and scrim sit
        above everything in the main column (its composer and floating
        buttons use z-40 to z-70), so the drawer is never covered on a phone.
      */}
      {isSidebarOpen && <div onClick={() => toggleSidebar()} className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-[2px] md:hidden" aria-hidden />}

      {/*
        Stays mounted when closed so it can animate out on mobile and keep the
        Recents scroll position. On desktop it collapses to zero width.
      */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-[90] flex w-[280px] max-w-[85vw] flex-col border-r border-white/[0.05] bg-forge-panel font-sans transition-transform duration-300 ease-out',
          'md:static md:z-20 md:flex-shrink-0 md:translate-x-0 md:transition-all',
          isSidebarOpen ? 'translate-x-0 md:w-[272px]' : '-translate-x-full md:w-0 md:overflow-hidden md:border-r-0'
        )}
        style={{ height: '100dvh' }}
        aria-label="Navigation"
      >
        <div className="flex shrink-0 items-center justify-between px-4 pb-3 pt-5">
          <WorkspaceSwitcher />
          <button onClick={() => toggleSidebar()} className={cn('-m-2 rounded-full p-2 text-white/40 transition-colors hover:text-white', focusRing)} title="Collapse sidebar" aria-label="Collapse sidebar">
            <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
              <path d="M9.5 4.5v15" />
            </svg>
          </button>
        </div>

        <div className="shrink-0 px-3">
          <button
            onClick={newChat}
            className={cn(
              'flex h-11 w-full items-center gap-3 rounded-[14px] border border-white/[0.07] bg-gradient-to-b from-white/[0.06] to-white/[0.02] px-3.5 text-[14.5px] font-semibold text-white transition-colors hover:border-white/[0.14]',
              focusRing
            )}
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] text-forge-gold" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            New chat
          </button>

          <nav className="mt-4 flex flex-col gap-0.5">
            {NAV.map((item) => {
              const active = sidebarView === item.view;
              return (
                <button
                  key={item.view}
                  onClick={() => open(item.view)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-10 items-center gap-3 rounded-[12px] px-3 text-left text-[14.5px] font-medium transition-colors',
                    active ? 'bg-white/[0.06] text-white' : 'text-white/55 hover:bg-white/[0.03] hover:text-white/90',
                    focusRing
                  )}
                >
                  <NavIcon d={item.icon} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          <div className="custom-scrollbar flex-1 overflow-y-auto px-3 pb-4">
            {sessions.length === 0 && <p className="px-3 pt-2 text-[13px] leading-relaxed text-white/35">Conversations you start appear here.</p>}
            {grouped.map((group) => (
              <section key={group.label} className="mb-4">
                <h3 className="mb-1 px-3 text-[11.5px] font-semibold text-white/30">{group.label}</h3>
                <ul className="flex flex-col">
                  {group.items.map((session) => {
                    const active = activeSessionId === session.id && sidebarView === 'chat';
                    return (
                      <li key={session.id} className="group relative">
                        {editingId === session.id ? (
                          <input
                            ref={editInputRef}
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onBlur={() => saveRename(session.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveRename(session.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="h-9 w-full rounded-[10px] border border-white/15 bg-white/[0.04] px-3 text-[14px] text-white outline-none"
                            aria-label="Conversation title"
                          />
                        ) : (
                          <button
                            onClick={() => {
                              setActiveSessionId(session.id);
                              setSidebarView('chat');
                              closeOnMobile();
                            }}
                            className={cn(
                              'flex h-9 w-full items-center rounded-[10px] pl-3 pr-9 text-left text-[14px] transition-colors',
                              active ? 'bg-white/[0.06] text-white' : 'text-white/70 hover:bg-white/[0.03] hover:text-white',
                              focusRing
                            )}
                          >
                            <span className="truncate">{session.title}</span>
                          </button>
                        )}

                        {editingId !== session.id && (
                          <button
                            onClick={() => {
                              setConfirmDelete(false);
                              setMenuOpen(menuOpen === session.id ? null : session.id);
                            }}
                            className={cn(
                              'absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-white/45 transition hover:text-white',
                              menuOpen === session.id ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100'
                            )}
                            aria-label={`Options for ${session.title}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        )}

                        {menuOpen === session.id && (
                          <div ref={menuRef} className="absolute right-0 top-9 z-50 w-[210px] rounded-[14px] border border-white/[0.08] bg-forge-raised py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.55)]">
                            <MenuItem
                              icon={<Edit2 className="h-4 w-4" />}
                              label="Rename"
                              onClick={() => {
                                setEditingId(session.id);
                                setEditTitle(session.title);
                                closeMenu();
                              }}
                            />
                            <MenuItem icon={<Share2 className="h-4 w-4" />} label="Copy share link" onClick={() => shareSession(session.id)} />
                            <MenuItem
                              icon={<Trash2 className="h-4 w-4" />}
                              label={confirmDelete ? 'Delete for good' : 'Delete'}
                              danger={confirmDelete}
                              onClick={() => (confirmDelete ? deleteSession(session.id) : setConfirmDelete(true))}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>

        <div className="shrink-0 border-t border-white/[0.05] p-3">
          <button
            type="button"
            onClick={() => router.push('/account')}
            className={cn('flex w-full items-center gap-3 rounded-[14px] p-2.5 text-left transition-colors hover:bg-white/[0.04]', focusRing)}
            aria-label="Account and settings"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-forge-ember to-forge-ember2 text-[13.5px] font-semibold text-black">
              {userInitial(user)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[14px] font-medium text-white">{name}</span>
              <span className="text-[12px] text-white/40">{planLabel}</span>
            </span>
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 text-white/40" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
        </div>
      </aside>
    </>
  );
}

function MenuItem({ icon, label, onClick, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-3.5 py-2.5 text-[13.5px] font-medium transition-colors hover:bg-white/[0.05]',
        danger ? 'text-forge-bad' : 'text-white/80 hover:text-white'
      )}
    >
      <span className={danger ? 'text-forge-bad' : 'text-white/45'}>{icon}</span>
      {label}
    </button>
  );
}
