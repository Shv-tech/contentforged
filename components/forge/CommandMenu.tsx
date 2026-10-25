'use client';

/**
 * Cmd+K (Ctrl+K): everything in Forge from the keyboard. Views, tools,
 * composer commands and settings, filtered as you type.
 *
 * Global shortcuts registered here:
 *   Cmd/Ctrl+K         open this menu
 *   Cmd/Ctrl+Shift+O   new chat
 *   Cmd/Ctrl+B         toggle the sidebar
 */

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore, type SidebarView } from '@/lib/store';
import { CHAT_TOOLS, canUseTool, planName } from '@/lib/forge/entitlements';
import { SLASH_COMMANDS } from '@/lib/forge/commands';
import { Kbd, cn } from './ui';
import { composeInChat } from './views/ViewShell';

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  keywords?: string;
  run: () => void;
}

const VIEWS: ReadonlyArray<{ view: SidebarView; label: string; keywords: string }> = [
  { view: 'chat', label: 'Chat', keywords: 'conversation editor' },
  { view: 'inbox', label: 'Inbox', keywords: 'capture voice note stories proposals ideas sources email repurpose' },
  { view: 'plan', label: 'This week', keywords: 'weekly plan review approve monday' },
  { view: 'drafts', label: 'Drafts', keywords: 'library posts evergreen repost' },
  { view: 'brand', label: 'Brand', keywords: 'voice story bank rules settings connections' },
  { view: 'signals', label: 'Signals', keywords: 'audit pulse radar competitors x' },
  { view: 'playbook', label: 'Playbook', keywords: 'results analytics what works' },
  { view: 'formats', label: 'Formats', keywords: 'templates structures gallery shared' },
  { view: 'team', label: 'Team', keywords: 'members roles invite audit reports clients api' },
  { view: 'calendar', label: 'Calendar', keywords: 'schedule plan' },
  { view: 'ebooks', label: 'Ebooks', keywords: 'books' },
  { view: 'search', label: 'Search chats', keywords: 'find history' },
];

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
}

export function CommandMenu() {
  const router = useRouter();
  const { plan, setSidebarView, setActiveSessionId, setActiveTool, toggleSidebar } = useAppStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setIndex(0);
  }, []);

  const newChat = useCallback(() => {
    setActiveSessionId(null);
    setActiveTool(null);
    setSidebarView('chat');
  }, [setActiveSessionId, setActiveTool, setSidebarView]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      } else if (key === 'o' && event.shiftKey) {
        event.preventDefault();
        newChat();
      } else if (key === 'b' && !event.shiftKey) {
        const target = event.target as HTMLElement | null;
        // Leave Cmd+B to rich text fields that use it for bold.
        if (target?.isContentEditable) return;
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newChat, toggleSidebar]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [
      { id: 'new-chat', group: 'Start', label: 'New chat', hint: `${isMac() ? 'Cmd' : 'Ctrl'} Shift O`, keywords: 'start fresh', run: newChat },
      ...SLASH_COMMANDS.map((command) => ({
        id: `cmd-${command.name}`,
        group: 'Start',
        label: `${command.label}  ${command.description}`,
        keywords: command.argument,
        run: () => composeInChat({ fresh: true, text: `${command.label} ` }),
      })),
      ...VIEWS.map((view) => ({
        id: `view-${view.view}`,
        group: 'Go to',
        label: view.label,
        keywords: view.keywords,
        run: () => setSidebarView(view.view),
      })),
      ...CHAT_TOOLS.map((tool) => {
        const allowed = canUseTool(plan, tool.id);
        return {
          id: `tool-${tool.id}`,
          group: 'Tools',
          label: tool.name,
          hint: allowed ? undefined : planName(tool.minPlan),
          keywords: tool.description,
          run: () => {
            if (!allowed) {
              router.push('/account?tab=billing');
              return;
            }
            setActiveTool(tool.id);
            setSidebarView('chat');
          },
        };
      }),
      { id: 'account', group: 'Settings', label: 'Account', keywords: 'profile name personalization brand dna', run: () => router.push('/account') },
      { id: 'billing', group: 'Settings', label: 'Plan and billing', keywords: 'upgrade subscription usage', run: () => router.push('/account?tab=billing') },
      { id: 'audit', group: 'Settings', label: 'Public X audit page', keywords: 'share free', run: () => window.open('/audit', '_blank', 'noopener') },
      { id: 'sidebar', group: 'Settings', label: 'Toggle sidebar', hint: `${isMac() ? 'Cmd' : 'Ctrl'} B`, run: () => toggleSidebar() },
    ];
    return list;
  }, [newChat, plan, router, setActiveTool, setSidebarView, toggleSidebar]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const terms = q.split(/\s+/);
    return items.filter((item) => {
      const haystack = `${item.label} ${item.group} ${item.keywords ?? ''}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [items, query]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const runItem = (item: Item | undefined) => {
    if (!item) return;
    close();
    item.run();
  };

  if (!open || typeof document === 'undefined') return null;

  let lastGroup = '';

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        className="w-full max-w-[580px] overflow-hidden rounded-[22px] border border-white/[0.09] bg-[#0F0F0F] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
            else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              runItem(filtered[index]);
            }
          }}
          placeholder="Go to, start or find a tool"
          aria-label="Search commands"
          className="h-14 w-full border-b border-white/[0.06] bg-transparent px-5 text-[16px] text-white outline-none placeholder:text-white/35"
        />
        <ul ref={listRef} className="max-h-[52vh] overflow-y-auto p-2" role="listbox">
          {filtered.length === 0 && <li className="px-3 py-6 text-center text-[13.5px] text-white/40">Nothing matches.</li>}
          {filtered.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.id} data-index={i}>
                {header && <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/30">{header}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === index}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => runItem(item)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2.5 text-left text-[14px]',
                    i === index ? 'bg-white/[0.07] text-white' : 'text-white/75'
                  )}
                >
                  <span className="truncate">{item.label}</span>
                  {item.hint && <span className="shrink-0 text-[11.5px] text-white/35">{item.hint}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-2.5 text-[11.5px] text-white/35">
          <span className="flex items-center gap-1">
            <Kbd>Up</Kbd>
            <Kbd>Down</Kbd> move
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Enter</Kbd> open
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Esc</Kbd> close
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
