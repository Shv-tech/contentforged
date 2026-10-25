/**
 * lib/forge/data/stories.ts
 *
 * Story Bank reads and writes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoryItem, StoryKind } from '../types';
import { scopeRows } from './workspace';

export const STORY_COLUMNS =
  'id, user_id, workspace_id, kind, title, body, occurred_on, tags, source, capture_id, quote, quote_start_seconds, use_count, last_used_at, created_at, updated_at';

export const STORY_KINDS: readonly StoryKind[] = ['story', 'metric', 'win', 'failure', 'opinion', 'fact'];

export async function listStories(db: SupabaseClient, userId: string, workspaceId: string | null, limit = 200): Promise<StoryItem[]> {
  const query = db.from('story_items').select(STORY_COLUMNS);
  const { data, error } = await scopeRows(query, userId, workspaceId).order('updated_at', { ascending: false }).limit(limit);
  if (error) throw new Error(`Could not load the Story Bank: ${error.message}`);
  return (data ?? []) as StoryItem[];
}

/**
 * Finds stories relevant to a topic.
 *
 * Postgres full-text search first, ranked by the database. When that finds
 * nothing (short or unusual queries), falls back to a substring match on the
 * title, then to the most-used stories, so the model always sees something
 * when the bank is not empty.
 */
export async function searchStories(db: SupabaseClient, userId: string, workspaceId: string | null, topic: string, limit = 6): Promise<StoryItem[]> {
  const cleaned = topic.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();

  if (cleaned) {
    const fullText = db
      .from('story_items')
      .select(STORY_COLUMNS)
      .textSearch('title', cleaned.split(/\s+/).slice(0, 8).join(' | '), { config: 'english', type: 'plain' });
    // Title-only full text is a cheap first pass; body search follows.
    const { data: titleHits } = await scopeRows(fullText, userId, workspaceId).limit(limit);

    const terms = cleaned
      .split(/\s+/)
      .filter((t) => t.length > 2)
      .slice(0, 6);
    let bodyHits: StoryItem[] = [];
    if (terms.length > 0) {
      const orFilter = terms.map((t) => `body.ilike.%${t}%,title.ilike.%${t}%`).join(',');
      const bodyQuery = db.from('story_items').select(STORY_COLUMNS).or(orFilter);
      const { data } = await scopeRows(bodyQuery, userId, workspaceId).limit(limit * 2);
      bodyHits = (data ?? []) as StoryItem[];
    }

    const merged = new Map<string, StoryItem>();
    for (const item of [...((titleHits ?? []) as StoryItem[]), ...rankByTermOverlap(bodyHits, terms)]) {
      if (!merged.has(item.id)) merged.set(item.id, item);
    }
    if (merged.size > 0) return Array.from(merged.values()).slice(0, limit);
  }

  const fallback = db.from('story_items').select(STORY_COLUMNS);
  const { data } = await scopeRows(fallback, userId, workspaceId)
    .order('use_count', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as StoryItem[];
}

function rankByTermOverlap(items: StoryItem[], terms: string[]): StoryItem[] {
  const lowered = terms.map((t) => t.toLowerCase());
  return [...items].sort((a, b) => overlap(b, lowered) - overlap(a, lowered));
}

function overlap(item: StoryItem, terms: string[]): number {
  const haystack = `${item.title} ${item.body}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

export interface NewStory {
  kind: StoryKind;
  title: string;
  body: string;
  occurred_on?: string | null;
  tags?: string[];
  source: StoryItem['source'];
  /** Where a kept proposal came from, so the Story Bank can show the original words. */
  capture_id?: string | null;
  quote?: string | null;
  quote_start_seconds?: number | null;
}

export async function createStory(db: SupabaseClient, userId: string, workspaceId: string | null, story: NewStory): Promise<StoryItem> {
  const { data, error } = await db
    .from('story_items')
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      kind: story.kind,
      title: story.title.trim().slice(0, 140),
      body: story.body.trim().slice(0, 4000),
      occurred_on: story.occurred_on ?? null,
      tags: (story.tags ?? [])
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8),
      source: story.source,
      capture_id: story.capture_id ?? null,
      quote: story.quote?.slice(0, 1200) ?? null,
      quote_start_seconds: story.quote_start_seconds ?? null,
    })
    .select(STORY_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not save the story: ${error?.message ?? 'unknown error'}`);
  return data as StoryItem;
}

/**
 * Records that stories were used in a draft, so frequently used ones rank
 * first. Scoped to the brand the draft was written for, so ids from another
 * brand are ignored.
 */
export async function markStoriesUsed(db: SupabaseClient, userId: string, ids: string[], workspaceId: string | null = null): Promise<void> {
  if (ids.length === 0) return;
  const query = db.from('story_items').select('id, use_count').in('id', ids);
  const { data } = await scopeRows(query, userId, workspaceId);
  const now = new Date().toISOString();
  await Promise.all(
    (data ?? []).map((row: { id: string; use_count: number }) => db.from('story_items').update({ use_count: row.use_count + 1, last_used_at: now }).eq('id', row.id))
  );
}

export function formatStoriesForModel(items: StoryItem[]): string {
  if (items.length === 0) return 'No matching stories. Use only what the user has said in this conversation, and [brackets] for anything missing.';
  return items
    .map((item) => {
      const when = item.occurred_on ? ` (${item.occurred_on})` : '';
      return `[${item.id}] ${item.kind.toUpperCase()}: ${item.title}${when}\n${item.body}`;
    })
    .join('\n\n');
}
