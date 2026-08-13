'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MoreVertical, Trash2, Edit2, Share2 } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { displayName, userInitial } from '@/lib/user-display';
import { PLANS } from '@/lib/billing/plans';

export function SidebarPane() {
  const {
    user,
    activeSessionId,
    setActiveSessionId,
    isSidebarOpen,
    toggleSidebar,
    sidebarView,
    plan,
    setSidebarView,
  } = useAppStore();

  const [sessions, setSessions] = useState<any[]>([]);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionTitle, setEditSessionTitle] = useState('');

  const menuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  /**
   * Closes the drawer after a navigation action, on mobile only.
   *
   * On a phone the sidebar covers the content it navigates to, so leaving it
   * open after a selection means the user taps a chat and appears to land
   * nowhere. On desktop it is a persistent column and must stay put.
   */
  const closeOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768 && isSidebarOpen) {
      toggleSidebar();
    }
  };

  const fetchSessions = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setSessions(data);
  };

  useEffect(() => {
    fetchSessions();
    window.addEventListener('refresh-sidebar', fetchSessions);
    return () => window.removeEventListener('refresh-sidebar', fetchSessions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, supabase, activeSessionId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(null);
      }
    };

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (editingSessionId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingSessionId]);

  const handleNewWorkspace = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({ user_id: user.id, title: 'New Workspace' })
      .select()
      .single();

    if (error) {
      toast.error('Database Error: Could not create workspace. Check RLS policies.');
      return;
    }
    if (data) {
      setSessions([data, ...sessions]);
      setActiveSessionId(data.id);
      setSidebarView('chat');
    }
  };

  const deleteSession = async (id: string) => {
    if (!user) return;

    // Scoped by user_id as well as id. RLS enforces ownership, but a delete
    // that depends solely on a policy being correct has no second line of
    // defence if that policy is ever changed.
    const { error } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      toast.error('Could not delete that workspace.');
      return;
    }

    setSessions(sessions.filter((s) => s.id !== id));
    if (activeSessionId === id) setActiveSessionId(null);
    setMenuOpen(null);
  };

  const handleShareSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();

    const { data, error } = await supabase
      .from('chat_sessions')
      .update({ is_public: true })
      .eq('id', id)
      .select('share_token')
      .single();

    if (error || !data) {
      toast.error('Failed to generate secure share link.');
      return;
    }

    const shareUrl = `${window.location.origin}/share/${data.share_token}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Secure share link copied!');
    } catch {
      toast.error('Failed to copy link');
    }
    setMenuOpen(null);
  };

  const startRenaming = (e: React.MouseEvent, id: string, currentTitle: string) => {
    e.stopPropagation();
    setEditingSessionId(id);
    setEditSessionTitle(currentTitle);
    setMenuOpen(null);
  };

  const saveRename = async (id: string) => {
    if (!editSessionTitle.trim()) {
      setEditingSessionId(null);
      return;
    }

    const newTitle = editSessionTitle.trim();

    const { error } = await supabase
      .from('chat_sessions')
      .update({ title: newTitle })
      .eq('id', id);

    if (!error) {
      setSessions(sessions.map((s) => (s.id === id ? { ...s, title: newTitle } : s)));
    } else {
      toast.error('Failed to rename workspace.');
    }

    setEditingSessionId(null);
  };

  // Deliberately NOT `if (!isSidebarOpen) return null`.
  //
  // On mobile the sidebar is an overlay that slides in, and an element that
  // unmounts cannot animate out. It stays mounted and is translated off-screen
  // instead, which also keeps the scroll position of the Recents list when it
  // is reopened.
  //
  // On desktop it still collapses to zero width so the editor reclaims the
  // space, which is the behaviour that already existed.

  // Derived through the shared helper so the sidebar, the editor greeting and
  // the account page cannot disagree. The previous version read
  // user.user_metadata.full_name, a field the client user object does not
  // carry, so it always fell through to the email prefix even when the user
  // had set a name for themselves.
  const userName = displayName(user).split(' ')[0];
  const initial = userInitial(user);

  // The plan label was hardcoded to "PRO" for every visitor, including users
  // on the free tier, which advertised a paid plan to people who had not
  // bought one. It now reflects the plan the server actually granted.
  const planLabel = (PLANS[plan]?.name ?? 'Free').toUpperCase();

  return (
    <>
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/*
        Scrim. Mobile only, and only while the drawer is open.

        Tapping anywhere outside the sidebar closes it, which is the gesture
        people expect from a drawer. Without it the only way out is the small
        hamburger, which is a poor target on a phone.
      */}
      {isSidebarOpen && (
        <div
          onClick={() => toggleSidebar()}
          className="md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200"
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          bg-[#060606] border-r border-[#141414] flex flex-col font-sans
          p-[24px_20px_20px_20px]
          transition-transform duration-300 ease-out
          fixed inset-y-0 left-0 z-40 w-[280px] max-w-[85vw]
          md:static md:z-20 md:translate-x-0 md:flex-shrink-0
          md:transition-all
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          ${isSidebarOpen ? 'md:w-[270px]' : 'md:w-0 md:p-0 md:overflow-hidden md:border-r-0'}
        `}
        style={{ height: '100dvh' }}
      >

        <div className="flex justify-end mb-6 shrink-0">
          <button
            onClick={() => toggleSidebar()}
            // Enlarged tap target. A 20px icon is below the ~44px minimum that
            // reads as reliably tappable on a touch screen; negative margin
            // keeps the visual position unchanged on desktop.
            className="text-[#666] hover:text-white transition-colors p-2 -m-2"
            title="Collapse sidebar"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-[26px] mb-[45px]">

          <button
            onClick={handleNewWorkspace}
            className="flex items-center gap-[14px] px-[16px] py-[12px] rounded-[12px] text-[15px] font-bold text-[#e0e0e0] transition-colors -ml-[16px]"
            style={{
              background: 'linear-gradient(180deg, rgba(30,30,30,0.8) 0%, rgba(15,15,15,0.8) 100%)',
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="#888" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
              <line x1="9" y1="12" x2="15" y2="12"></line>
              <line x1="12" y1="9" x2="12" y2="15"></line>
            </svg>
            New chat
          </button>

          <nav className="flex flex-col gap-[28px]">
            <button onClick={() => { setSidebarView('search'); closeOnMobile(); }} className={`flex items-center gap-[14px] text-[15px] font-medium transition-colors text-left ${sidebarView === 'search' ? 'text-white' : 'text-[#888] hover:text-[#ddd]'}`}>
              <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                <circle cx="10" cy="10" r="3"></circle>
                <line x1="12.1" y1="12.1" x2="15" y2="15"></line>
              </svg>
              Search chat
            </button>
            <button onClick={() => { setSidebarView('ebooks'); closeOnMobile(); }} className={`flex items-center gap-[14px] text-[15px] font-medium transition-colors text-left ${sidebarView === 'ebooks' ? 'text-white' : 'text-[#888] hover:text-[#ddd]'}`}>
              <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              </svg>
              My Ebooks
            </button>
            <button onClick={() => { setSidebarView('calendar'); closeOnMobile(); }} className={`flex items-center gap-[14px] text-[15px] font-medium transition-colors text-left ${sidebarView === 'calendar' ? 'text-white' : 'text-[#888] hover:text-[#ddd]'}`}>
              <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              Calendar
            </button>
          </nav>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <span className="text-[13px] font-semibold text-[#666] mb-[20px] tracking-[0.3px]">Recents</span>

          <div className="flex-1 overflow-y-auto flex flex-col gap-[18px] hide-scrollbar pb-4">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="group relative flex items-center justify-between cursor-pointer"
                onClick={() => {
                  setActiveSessionId(session.id);
                  setSidebarView('chat');
                  closeOnMobile();
                }}
              >
                {editingSessionId === session.id ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editSessionTitle}
                    onChange={(e) => setEditSessionTitle(e.target.value)}
                    onBlur={() => saveRename(session.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        saveRename(session.id);
                      } else if (e.key === 'Escape') {
                        setEditingSessionId(null);
                      }
                    }}
                    className="flex-1 bg-[#1a1a1a] text-white text-[14px] font-medium outline-none border border-[#333] rounded px-2 py-0.5 w-[140px] mr-2"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className={`text-[15px] font-medium truncate transition-colors flex-1 pr-2 ${activeSessionId === session.id ? 'text-white' : 'text-[#e0e0e0] hover:text-white'}`}>
                    {session.title}
                  </div>
                )}

                {!editingSessionId && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === session.id ? null : session.id); }}
                    className={`p-1 rounded-md opacity-0 group-hover:opacity-100 transition text-[#888] hover:text-white ${menuOpen === session.id ? 'opacity-100' : ''}`}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                )}

                {menuOpen === session.id && (
                  <div
                    ref={menuRef}
                    className="absolute right-0 top-8 w-[200px] bg-[#1c1c1c] border border-[#2a2a2a] shadow-[0_8px_30px_rgb(0,0,0,0.4)] rounded-[12px] py-2 z-50"
                  >
                    <button
                      onClick={(e) => startRenaming(e, session.id, session.title)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium text-[#e0e0e0] hover:bg-[#2a2a2a] hover:text-white transition-colors"
                    >
                      <Edit2 className="w-4 h-4 text-[#888]" /> Rename
                    </button>

                    <button
                      onClick={(e) => handleShareSession(e, session.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium text-[#e0e0e0] hover:bg-[#2a2a2a] hover:text-white transition-colors"
                    >
                      <Share2 className="w-4 h-4 text-[#888]" /> Share conversation
                    </button>

                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium text-[#e0e0e0] hover:bg-[#2a2a2a] hover:text-white transition-colors mt-2"
                    >
                      <Trash2 className="w-4 h-4 text-[#888]" /> Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/*
          The whole card navigates to the account page. It was already styled
          with cursor-pointer but only the gear icon carried the click handler,
          so most of the target looked interactive and did nothing.
        */}
        <button
          type="button"
          onClick={() => router.push('/account')}
          className="mt-[20px] w-full text-left border border-[#222] hover:border-[#333] rounded-[12px] p-[12px_14px] flex items-center gap-[12px] cursor-pointer transition-colors"
          style={{ background: 'linear-gradient(180deg, #181818 0%, #0d0d0d 100%)' }}
        >
          <div className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[14px] font-medium text-[#ffc4a3] bg-[#4a2411] shrink-0">
            {initial}
          </div>

          <div className="flex flex-col flex-1 leading-tight min-w-0">
            <span className="text-[14px] font-medium text-white mb-[2px] truncate">{userName}</span>
            <span className="text-[10px] font-medium text-[#777] tracking-[0.5px]">{planLabel}</span>
          </div>

          <span className="text-[#888] hover:text-white transition flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </span>
        </button>

      </aside>
    </>
  );
}