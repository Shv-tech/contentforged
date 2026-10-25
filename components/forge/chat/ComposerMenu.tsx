'use client';

/**
 * The menu that opens above the composer for "/" commands and "@" story
 * mentions. Keyboard handling stays with the composer (it owns the caret);
 * this component renders the list and reports picks.
 */

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/forge/client';
import type { StoryItem } from '@/lib/forge/types';
import { STORY_KIND_LABELS } from '@/lib/forge/types';
import { Kbd, Spinner, cn } from '../ui';

export interface ComposerMenuItem {
  id: string;
  primary: string;
  secondary?: string;
  meta?: string;
}

export function ComposerMenu({
  title,
  items,
  activeIndex,
  loading = false,
  empty,
  onPick,
  onHover,
}: {
  title: string;
  items: ComposerMenuItem[];
  activeIndex: number;
  loading?: boolean;
  empty: string;
  onPick: (index: number) => void;
  onHover: (index: number) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-50 mb-3 overflow-hidden rounded-[20px] border border-white/[0.08] bg-forge-panel shadow-[0_16px_48px_rgba(0,0,0,0.6)]"
      role="listbox"
      aria-label={title}
    >
      <div className="flex items-center justify-between px-4 pb-1.5 pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/35">{title}</span>
        <span className="hidden items-center gap-1 text-[11px] text-white/30 sm:flex">
          <Kbd>Up</Kbd>
          <Kbd>Down</Kbd>
          <Kbd>Enter</Kbd>
        </span>
      </div>
      {loading && items.length === 0 ? (
        <div className="flex items-center gap-2 px-4 pb-4 pt-2 text-[13px] text-white/45">
          <Spinner className="h-3.5 w-3.5" /> Searching
        </div>
      ) : items.length === 0 ? (
        <p className="px-4 pb-4 pt-2 text-[13px] text-white/45">{empty}</p>
      ) : (
        <ul ref={listRef} className="max-h-[280px] overflow-y-auto px-1.5 pb-1.5">
          {items.map((item, index) => (
            <li key={item.id} data-index={index}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                // mousedown, not click: the textarea would blur first and
                // the composer would close the menu before the pick landed.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(index);
                }}
                onMouseEnter={() => onHover(index)}
                className={cn(
                  'flex w-full items-baseline gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors',
                  index === activeIndex ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                )}
              >
                <span className="shrink-0 text-[14px] font-medium text-white">{item.primary}</span>
                {item.secondary && <span className="min-w-0 flex-1 truncate text-[13px] text-white/45">{item.secondary}</span>}
                {item.meta && <span className="shrink-0 text-[11.5px] text-white/30">{item.meta}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Story Bank search for the mention picker, debounced so each keystroke does
 * not become a request. Null query means the picker is closed.
 */
export function useStorySearch(query: string | null): { stories: StoryItem[]; loading: boolean } {
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query === null) return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const path = query ? `/api/stories?q=${encodeURIComponent(query)}` : '/api/stories';
        const data = await api<{ stories: StoryItem[] }>(path);
        if (!cancelled) setStories(data.stories.slice(0, 8));
      } catch {
        if (!cancelled) setStories([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return { stories, loading };
}

export function storyMenuItem(story: StoryItem): ComposerMenuItem {
  return {
    id: story.id,
    primary: story.title,
    secondary: story.body,
    meta: STORY_KIND_LABELS[story.kind],
  };
}
