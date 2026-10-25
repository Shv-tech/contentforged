'use client';

/**
 * Search across conversation titles and everything the user has typed.
 */

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useAppStore } from '@/lib/store';
import { Spinner, relativeTime } from '@/components/forge/ui';
import { ViewShell } from '@/components/forge/views/ViewShell';

interface Result {
  id: string;
  title: string;
  preview: string | null;
  at: string;
}

export function SearchPane() {
  const { user, setActiveSessionId, setSidebarView } = useAppStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q || !user) {
      setResults([]);
      setLoading(false);
      return;
    }
    const request = ++requestRef.current;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      // PostgREST ilike patterns treat % and _ as wildcards; escape them so
      // a search for "100%" means the text "100%".
      const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const supabase = createClient();
      const [sessions, messages] = await Promise.all([
        supabase.from('chat_sessions').select('id, title, created_at').eq('user_id', user.id).ilike('title', pattern).order('created_at', { ascending: false }).limit(10),
        supabase
          .from('chat_messages')
          .select('content, session_id, created_at, chat_sessions!inner(title, user_id)')
          .eq('chat_sessions.user_id', user.id)
          .eq('role', 'user')
          .ilike('content', pattern)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);
      if (request !== requestRef.current) return;

      const map = new Map<string, Result>();
      for (const s of sessions.data ?? []) map.set(s.id, { id: s.id, title: s.title, preview: null, at: s.created_at });
      for (const m of (messages.data ?? []) as Array<{ content: string; session_id: string; created_at: string; chat_sessions: { title: string } | { title: string }[] }>) {
        if (map.has(m.session_id)) continue;
        const session = Array.isArray(m.chat_sessions) ? m.chat_sessions[0] : m.chat_sessions;
        const index = m.content.toLowerCase().indexOf(q.toLowerCase());
        const start = Math.max(0, index - 40);
        map.set(m.session_id, {
          id: m.session_id,
          title: session?.title ?? 'Untitled',
          preview: `${start > 0 ? '…' : ''}${m.content.slice(start, start + 140)}`,
          at: m.created_at,
        });
      }
      setResults(Array.from(map.values()));
      setLoading(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, user]);

  return (
    <ViewShell title="Search" subtitle="Every conversation, by title or by anything you wrote in it.">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your chats"
        aria-label="Search your chats"
        className="h-12 w-full rounded-full border border-white/[0.09] bg-white/[0.03] px-5 text-[16px] text-white outline-none placeholder:text-white/35 focus:border-white/25"
      />
      <div className="mt-6">
        {loading && (
          <div className="flex items-center gap-2 py-6 text-[13.5px] text-white/45">
            <Spinner /> Searching
          </div>
        )}
        {!loading && query.trim() && results.length === 0 && <p className="py-6 text-[14px] text-white/45">Nothing matches &ldquo;{query.trim()}&rdquo;.</p>}
        <ul className="flex flex-col gap-1">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  setActiveSessionId(r.id);
                  setSidebarView('chat');
                }}
                className="w-full rounded-[16px] px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[14.5px] font-medium text-white">{r.title}</span>
                  <span className="shrink-0 text-[12px] text-white/35">{relativeTime(r.at)}</span>
                </span>
                {r.preview && <span className="mt-1 line-clamp-2 block text-[13px] text-white/50">{r.preview}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </ViewShell>
  );
}
