'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, MessageSquare, Settings, LogOut, MoreVertical, Trash2, Edit2, PanelLeftClose } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

// 1. Define the props interface to include your onOpenSettings function
interface SidebarPaneProps {
  onOpenSettings: () => void;
}

// 2. Pass the defined props to the component signature
export function SidebarPane({ onOpenSettings }: SidebarPaneProps) {
  const { user, setUser, activeSessionId, setActiveSessionId, isSidebarOpen, toggleSidebar } = useAppStore();
  const [sessions, setSessions] = useState<any[]>([]);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  // Fetch Chat History dynamically
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
    
    // Listen for the Editor renaming a session so the sidebar instantly updates
    window.addEventListener('refresh-sidebar', fetchSessions);
    return () => window.removeEventListener('refresh-sidebar', fetchSessions);
  }, [user, supabase, activeSessionId]);

  // --- INSTANT WORKSPACE CREATION ---
  const handleNewWorkspace = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: user.id,
        title: 'New Workspace' // Placeholder name, the Editor will auto-rename this later
      })
      .select()
      .single();

    if (error) {
      toast.error('Database Error: Could not create workspace. Check RLS policies.');
      return;
    }

    if (data) {
      setSessions([data, ...sessions]); // Instantly push to top of sidebar
      setActiveSessionId(data.id);      // Instantly switch the editor to this blank canvas
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.push('/');
  };

  const deleteSession = async (id: string) => {
    await supabase.from('chat_sessions').delete().eq('id', id);
    setSessions(sessions.filter(s => s.id !== id));
    if (activeSessionId === id) setActiveSessionId(null);
    setMenuOpen(null);
  };

  if (!isSidebarOpen) return null;

  return (
    <aside className="h-full w-[260px] bg-[#F9FAF8] border-r border-gray-200 flex flex-col flex-shrink-0 font-sans transition-all duration-300">
      
      {/* HEADER & NEW CHAT */}
      <div className="p-3 flex items-center justify-between gap-2">
        <button 
          onClick={handleNewWorkspace}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-white border border-gray-200 shadow-sm rounded-xl text-[13px] font-medium text-gray-800 hover:bg-gray-50 transition"
        >
          <Plus className="w-4 h-4" /> New Workspace
        </button>
        <button 
          onClick={() => toggleSidebar()}
          className="p-2.5 text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded-xl transition"
          title="Close Sidebar"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* CHAT HISTORY LIST */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 custom-scrollbar">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-2">Recent</div>
        
        {sessions.map((session) => (
          <div 
            key={session.id}
            onMouseLeave={() => setMenuOpen(null)}
            className={`group relative flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition ${
              activeSessionId === session.id ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900'
            }`}
            onClick={() => setActiveSessionId(session.id)}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <MessageSquare className="w-4 h-4 flex-shrink-0" />
              <span className="text-[13px] truncate">{session.title}</span>
            </div>

            {/* 3-Dot Hover Menu */}
            <button 
              onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === session.id ? null : session.id); }}
              className={`p-1 rounded-md opacity-0 group-hover:opacity-100 transition ${menuOpen === session.id ? 'opacity-100 bg-gray-300' : 'hover:bg-gray-300'}`}
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {/* Dropdown Options */}
            {menuOpen === session.id && (
              <div className="absolute right-2 top-8 w-32 bg-white border border-gray-100 shadow-lg rounded-lg py-1 z-50">
                <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                  <Edit2 className="w-3.5 h-3.5" /> Rename
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

     
        <Link href="/account" className="flex items-center gap-3 px-3 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition">
          <Settings className="w-4 h-4" /> Account Settings
        </Link>
        <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 text-[13px] font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
          <LogOut className="w-4 h-4" /> Log Out
        </button>
    </aside>
  );
} 