// SearchPane.tsx
'use client';

import { useState, useCallback } from 'react';
import { Search, MessageSquare, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import { useAppStore } from '@/lib/store';

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number) {
  let t: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function SearchPane() {
  const { user, setActiveSessionId, setSidebarView } = useAppStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const runSearch = useCallback(
    debounce(async (q: string) => {
      if (!q.trim() || !user) { setResults([]); return; }
      setLoading(true);

      const { data: sessions } = await supabase
        .from('chat_sessions')
        .select('id, title, created_at')
        .eq('user_id', user.id)
        .ilike('title', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(8);

      const { data: messages } = await supabase
        .from('chat_messages')
        .select('id, content, session_id, created_at, chat_sessions!inner(title, user_id)')
        .eq('chat_sessions.user_id', user.id)
        .eq('role', 'user')
        .ilike('content', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(15);

      const map = new Map<string, any>();
      (sessions || []).forEach(s => map.set(s.id, { ...s, matchType: 'title', preview: s.title }));
      (messages || []).forEach((m: any) => {
        if (!map.has(m.session_id)) {
          map.set(m.session_id, {
            id: m.session_id,
            title: m.chat_sessions?.title || 'Untitled',
            matchType: 'message',
            preview: m.content.slice(0, 120),
          });
        }
      });

      setResults(Array.from(map.values()));
      setLoading(false);
    }, 300),
    [user]
  );

  const openSession = (id: string) => {
    setActiveSessionId(id);
    setSidebarView('chat');
  };

  return (
    <div className="w-full h-full min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar bg-[#000] px-4 sm:px-6 pt-16 sm:pt-12 pb-12">
      <div className="relative max-w-xl mx-auto mb-8 sm:mb-10">
        {/*
          autoFocus is desktop-only. On a phone it opens the keyboard the
          instant the pane mounts, which collapses the viewport before the user
          has seen the screen they navigated to.
        */}
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); runSearch(e.target.value); }}
          placeholder="Search chat..."
          className="w-full bg-[#161616] border border-[#2a2a2a] rounded-full pl-5 sm:pl-6 pr-14 py-3.5 text-[16px] sm:text-[14px] text-white placeholder:text-[#666] outline-none focus:border-[#444] transition"
        />
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'radial-gradient(circle at center, #bf671d 0%, #3b1803 100%)' }}>
          {loading ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Search className="w-4 h-4 text-white" />}
        </div>
      </div>

      <div className="max-w-xl mx-auto space-y-1">
        {!loading && query && results.length === 0 && (
          <p className="text-[13px] text-[#555] text-center pt-6">No results for &ldquo;{query}&rdquo;</p>
        )}
        {results.map(r => (
          <button key={r.id} onClick={() => openSession(r.id)} className="w-full min-w-0 text-left px-3 sm:px-4 py-3 rounded-xl hover:bg-[#161616] active:bg-[#161616] transition">
            <div className="flex items-center gap-2 mb-1 min-w-0">
              <MessageSquare className="w-3.5 h-3.5 text-[#d18a5e] shrink-0" />
              <span className="text-[14px] font-medium text-white truncate">{r.title}</span>
              {r.matchType === 'message' && <span className="text-[10px] text-[#666] bg-[#1a1a1a] px-1.5 py-0.5 rounded ml-auto shrink-0">in message</span>}
            </div>
            {r.matchType === 'message' && <p className="text-[12px] text-[#777] pl-5 line-clamp-2 break-words">{r.preview}</p>}
          </button>
        ))}
      </div>
    </div>
  );
}