/**
 * lib/forge/longform.ts
 *
 * Long form from existing material: a guide or short book compiled from the
 * brand's own posts, Story Bank and saved sources.
 *
 * Two steps, so the author stays in charge of what the book says:
 *
 *   1. planBook gathers the material (the posts that did best, the stories
 *      and sources that match the topic, or exactly what the author picked)
 *      and proposes a title and chapters, each citing the material it will
 *      draw on.
 *   2. compileBook writes each chapter from only its cited material, under
 *      the same truth rule as posts, and saves the result to My Ebooks with
 *      the lineage of every chapter.
 *
 * Nothing new is invented to fill a chapter. Where an argument needs a fact
 * the material does not hold, the chapter leaves a [bracket], exactly as a
 * post would.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { createMessage, structuredCall, textOf, type ToolDefinition } from '@/lib/ai/anthropic';
import { listStories, searchStories, STORY_COLUMNS } from './data/stories';
import { scopeRows, type WorkspaceRef } from './data/workspace';
import { draftText } from './draft-text';
import { HttpError } from './http';
import { metered } from './metered';
import { loadPostedPosts, scorePosts } from './playbook';
import { cleanString } from './text';
import type { DraftRecord, StoryItem } from './types';
import { brandSystemPrompt, loadBrandContext, type BrandContext } from './writer';

export type BookKind = 'guide' | 'book' | 'playbook';

export const BOOK_KINDS: Record<BookKind, { label: string; chapters: [number, number]; words: [number, number] }> = {
  guide: { label: 'Guide', chapters: [3, 6], words: [500, 900] },
  playbook: { label: 'Playbook', chapters: [4, 8], words: [400, 800] },
  book: { label: 'Short book', chapters: [6, 10], words: [900, 1500] },
};

/** One piece of the author's own material. `ref` is stable: d: drafts, s: stories, r: sources. */
export interface Material {
  ref: string;
  kind: 'post' | 'story' | 'source';
  title: string;
  text: string;
  /** For posts: performance against the author's own median, 1 is typical. */
  relative: number | null;
}

export interface ChapterPlan {
  title: string;
  purpose: string;
  refs: string[];
}

export interface BookPlan {
  title: string;
  subtitle: string;
  kind: BookKind;
  chapters: ChapterPlan[];
}

const MAX_MATERIAL_CHARACTERS = 70_000;
const MAX_POSTS = 40;
const SOURCE_EXCERPT = 6000;
const CHAPTER_CONCURRENCY = 3;

// ============================================================================
// MATERIAL
// ============================================================================

function overlaps(text: string, topic: string): boolean {
  const terms = topic.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 3);
  if (terms.length === 0) return true;
  const haystack = text.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function fromStory(story: Pick<StoryItem, 'id' | 'title' | 'body' | 'kind'>): Material {
  return { ref: `s:${story.id}`, kind: 'story', title: story.title, text: story.body, relative: null };
}

type PickedDraft = Pick<DraftRecord, 'id' | 'title' | 'kind' | 'body' | 'segments'>;
type PickedSource = { id: string; title: string; body: string };

/** Rows by id, limited to what the brand can see. */
async function pickRows<Row>(db: SupabaseClient, table: string, columns: string, userId: string, workspaceId: string | null, ids: string[]): Promise<Row[]> {
  const query = db.from(table).select(columns).in('id', ids);
  const { data, error } = await scopeRows(query, userId, workspaceId);
  if (error) throw new Error(`Could not load ${table}: ${error.message}`);
  return (data ?? []) as unknown as Row[];
}

async function recentSources(db: SupabaseClient, userId: string, workspaceId: string | null): Promise<PickedSource[]> {
  const query = db.from('repurpose_sources').select('id, title, body, created_at');
  const { data } = await scopeRows(query, userId, workspaceId).order('created_at', { ascending: false }).limit(5);
  return (data ?? []) as PickedSource[];
}

/**
 * The material a book can draw on. With `refs`, exactly those items (and
 * only ones the caller's brand can see). Without, the brand's best posts on
 * the topic, its matching stories and its five newest sources.
 */
export async function gatherMaterial(db: SupabaseClient, userId: string, workspaceId: string | null, input: { topic: string; refs?: string[] }): Promise<Material[]> {
  const material: Material[] = [];

  if (input.refs && input.refs.length > 0) {
    const ids = (prefix: string) => input.refs!.filter((r) => r.startsWith(prefix)).map((r) => r.slice(2)).slice(0, 80);
    const [draftIds, storyIds, sourceIds] = [ids('d:'), ids('s:'), ids('r:')];
    const [drafts, stories, sources] = await Promise.all([
      draftIds.length > 0 ? pickRows<PickedDraft>(db, 'drafts', 'id, title, kind, body, segments', userId, workspaceId, draftIds) : [],
      storyIds.length > 0 ? pickRows<StoryItem>(db, 'story_items', STORY_COLUMNS, userId, workspaceId, storyIds) : [],
      sourceIds.length > 0 ? pickRows<PickedSource>(db, 'repurpose_sources', 'id, title, body', userId, workspaceId, sourceIds) : [],
    ]);
    for (const d of drafts) {
      material.push({ ref: `d:${d.id}`, kind: 'post', title: d.title ?? 'Post', text: draftText(d), relative: null });
    }
    for (const s of stories) material.push(fromStory(s));
    for (const r of sources) {
      material.push({ ref: `r:${r.id}`, kind: 'source', title: r.title, text: r.body.slice(0, SOURCE_EXCERPT), relative: null });
    }
  } else {
    const [posts, stories, sources] = await Promise.all([
      loadPostedPosts(db, userId, workspaceId, 300).catch(() => []),
      (input.topic.trim() ? searchStories(db, userId, workspaceId, input.topic, 24) : listStories(db, userId, workspaceId, 30)).catch(() => []),
      recentSources(db, userId, workspaceId),
    ]);

    const scored = new Map(scorePosts(posts).map((p) => [p.draft.id, p.relative]));
    const candidates = posts
      .map((p) => ({ draft: p.draft, text: draftText(p.draft), relative: scored.get(p.draft.id) ?? null }))
      .filter((p) => p.text.length >= 120 && overlaps(p.text, input.topic))
      .sort((a, b) => (b.relative ?? 0) - (a.relative ?? 0))
      .slice(0, MAX_POSTS);
    for (const p of candidates) material.push({ ref: `d:${p.draft.id}`, kind: 'post', title: p.draft.title ?? 'Post', text: p.text, relative: p.relative });
    for (const s of stories) material.push(fromStory(s));
    for (const r of sources) {
      if (overlaps(`${r.title} ${r.body.slice(0, 4000)}`, input.topic)) {
        material.push({ ref: `r:${r.id}`, kind: 'source', title: r.title, text: r.body.slice(0, SOURCE_EXCERPT), relative: null });
      }
    }
  }

  // Keep within budget, best material first (it is already ordered that way).
  let used = 0;
  return material.filter((m) => {
    used += m.text.length + m.title.length;
    return used <= MAX_MATERIAL_CHARACTERS;
  });
}

function materialBlock(items: Material[]): string {
  return items
    .map((m) => {
      const performance = m.relative !== null ? `, ${m.relative.toFixed(1)}x the author's usual engagement` : '';
      return `<item ref="${m.ref}" kind="${m.kind}"${performance ? ` note="${performance.slice(2)}"` : ''}>\n${m.title}\n${m.text}\n</item>`;
    })
    .join('\n\n');
}

// ============================================================================
// PLANNING
// ============================================================================

const PLAN_TOOL: ToolDefinition = {
  name: 'submit_plan',
  description: 'Submit the plan for the book.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Plain, specific title. No colon-subtitle formula.' },
      subtitle: { type: 'string', description: 'One line on who it is for and what they get.' },
      chapters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            purpose: { type: 'string', description: 'One sentence: what the reader understands or can do after this chapter.' },
            refs: { type: 'array', items: { type: 'string' }, description: 'refs of the material this chapter draws on. At least one.' },
          },
          required: ['title', 'purpose', 'refs'],
        },
      },
    },
    required: ['title', 'subtitle', 'chapters'],
  },
};

export async function planBook(input: { db: SupabaseClient; userId: string; workspace: WorkspaceRef | null; topic: string; kind: BookKind; refs?: string[] }): Promise<{ plan: BookPlan; material: Material[] }> {
  const workspaceId = input.workspace?.id ?? null;
  const [context, material] = await Promise.all([
    loadBrandContext(input.db, input.userId, input.workspace),
    gatherMaterial(input.db, input.userId, workspaceId, { topic: input.topic, refs: input.refs }),
  ]);
  if (material.length < 3) {
    throw new HttpError(422, 'There is not enough material on this yet. Post about it, add stories, or pick posts and sources to build from.');
  }

  const shape = BOOK_KINDS[input.kind];
  const role = `You plan a ${shape.label.toLowerCase()} for one specific person, built entirely from their own posts, stories and notes. You are an editor arranging their thinking, not adding to it.`;
  const user = [
    `TOPIC: ${input.topic.trim() || 'Choose the strongest through-line in the material.'}`,
    `SHAPE: ${shape.chapters[0]} to ${shape.chapters[1]} chapters. Order them so each builds on the last.`,
    'Every chapter cites the refs it will draw on, and only refs listed below. Do not plan a chapter the material cannot support.',
    'Posts that did unusually well are the author\'s strongest ideas: give them weight.',
    `MATERIAL:\n${materialBlock(material)}`,
  ].join('\n\n');

  const plan = await metered(
    { userId: input.userId, route: 'longform:plan', maxOutputTokens: 1800, estimatedInputTokens: Math.ceil((brandSystemPrompt(context, role).length + user.length) / 4) },
    async () => {
      const { data, usage } = await structuredCall<Record<string, unknown>>(
        { system: brandSystemPrompt(context, role), messages: [{ role: 'user', content: user }], tool: PLAN_TOOL, temperature: 0.3, maxTokens: 1800 },
        { timeoutMs: 60_000 }
      );
      return { value: normalisePlan(data, input.kind, material), usage };
    }
  );
  if (plan.chapters.length === 0) throw new HttpError(502, 'The plan came back empty. Try again, or pick the material yourself.');
  return { plan, material };
}

export function normalisePlan(raw: Record<string, unknown>, kind: BookKind, material: Material[]): BookPlan {
  const known = new Set(material.map((m) => m.ref));
  const chapters = (Array.isArray(raw.chapters) ? raw.chapters : [])
    .map((chapter: unknown): ChapterPlan | null => {
      const value = (chapter ?? {}) as Record<string, unknown>;
      const title = cleanString(value.title, 120);
      const refs = (Array.isArray(value.refs) ? value.refs : []).filter((r): r is string => typeof r === 'string' && known.has(r));
      if (!title || refs.length === 0) return null;
      return { title, purpose: cleanString(value.purpose, 300), refs: Array.from(new Set(refs)).slice(0, 12) };
    })
    .filter((c): c is ChapterPlan => c !== null)
    .slice(0, BOOK_KINDS[kind].chapters[1]);
  return { title: cleanString(raw.title, 140) || 'Untitled', subtitle: cleanString(raw.subtitle, 240), kind, chapters };
}

// ============================================================================
// COMPILING
// ============================================================================

export type CompileEvent =
  | { type: 'start'; title: string; chapters: number }
  | { type: 'chapter'; index: number; title: string; content: string; words: number }
  | { type: 'done'; ebookId: string; words: number }
  | { type: 'error'; message: string; index?: number };

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

async function writeChapter(context: BrandContext, plan: BookPlan, index: number, material: Material[], userId: string): Promise<string> {
  const chapter = plan.chapters[index];
  const shape = BOOK_KINDS[plan.kind];
  const cited = material.filter((m) => chapter.refs.includes(m.ref));
  const role = `You are writing one chapter of "${plan.title}", a ${shape.label.toLowerCase()} by this person, from their own posts, stories and notes. In long form their voice stays the same: same words, same rhythm, more room. Treat the MATERIAL items as the STORIES the truth rule refers to.`;
  const outline = plan.chapters.map((c, i) => `${i + 1}. ${c.title}${i === index ? '  <- this chapter' : ''}`).join('\n');
  const user = [
    `BOOK: ${plan.title}${plan.subtitle ? `, ${plan.subtitle}` : ''}`,
    `OUTLINE:\n${outline}`,
    `THIS CHAPTER: ${chapter.title}. ${chapter.purpose}`,
    `LENGTH: ${shape.words[0]} to ${shape.words[1]} words.`,
    'FORMAT: Markdown. Do not repeat the chapter title. Use ### subheadings only where they help. No closing summary paragraph that repeats the chapter.',
    'Expand the ideas, connect them and give the reasoning the posts had no room for. Every personal fact must come from the material; where one is missing, write a [bracket].',
    `MATERIAL:\n${materialBlock(cited)}`,
  ].join('\n\n');
  const system = brandSystemPrompt(context, role);

  return metered(
    { userId, route: 'longform:chapter', maxOutputTokens: 3200, estimatedInputTokens: Math.ceil((system.length + user.length) / 4) },
    async () => {
      const response = await createMessage({ system, messages: [{ role: 'user', content: user }], temperature: 0.6, maxTokens: 3200 }, { timeoutMs: 90_000 });
      return { value: textOf(response).replace(/—/g, ',').replace(/^#{1,2}\s.*\n+/, '').trim(), usage: response.usage };
    }
  );
}

/**
 * Writes the chapters (a few at a time, emitted in order) and saves the book
 * to the ebooks table. The caller has already consumed an ebook credit.
 */
export async function* compileBook(input: { db: SupabaseClient; userId: string; workspace: WorkspaceRef | null; plan: BookPlan; signal?: AbortSignal }): AsyncGenerator<CompileEvent> {
  const workspaceId = input.workspace?.id ?? null;
  const refs = Array.from(new Set(input.plan.chapters.flatMap((c) => c.refs)));
  const [context, material] = await Promise.all([
    loadBrandContext(input.db, input.userId, input.workspace),
    gatherMaterial(input.db, input.userId, workspaceId, { topic: input.plan.title, refs }),
  ]);
  // Refs the caller sent that this brand cannot see were dropped by gatherMaterial.
  const known = new Set(material.map((m) => m.ref));
  const plan: BookPlan = { ...input.plan, chapters: input.plan.chapters.map((c) => ({ ...c, refs: c.refs.filter((r) => known.has(r)) })).filter((c) => c.refs.length > 0) };
  if (plan.chapters.length === 0) {
    yield { type: 'error', message: 'None of the planned material is available any more. Plan the book again.' };
    return;
  }

  yield { type: 'start', title: plan.title, chapters: plan.chapters.length };

  const pending: Promise<string>[] = [];
  const launch = (index: number) => {
    if (index >= plan.chapters.length) return;
    const chapter = writeChapter(context, plan, index, material, input.userId);
    // Rejections are handled when the chapter is awaited in order; this keeps
    // a failure in a chapter that is never reached from going unhandled.
    chapter.catch(() => undefined);
    pending[index] = chapter;
  };
  for (let i = 0; i < CHAPTER_CONCURRENCY; i += 1) launch(i);

  const written: string[] = [];
  for (let index = 0; index < plan.chapters.length; index += 1) {
    if (input.signal?.aborted) return;
    let content: string;
    try {
      content = await pending[index];
    } catch (error) {
      const message = error instanceof HttpError ? error.message : 'A chapter could not be written. The chapters so far are saved.';
      yield { type: 'error', message, index };
      break;
    }
    launch(index + CHAPTER_CONCURRENCY);
    written.push(content);
    yield { type: 'chapter', index, title: plan.chapters[index].title, content, words: words(content) };
  }

  if (written.length === 0) return;
  // Same shape the chat's ebook writer stores, so the reader renders both alike.
  const body = written.map((content, i) => `## ${plan.chapters[i].title}\n\n${content}\n\n---\n\n`).join('');
  const total = words(body);
  const { data, error } = await createServiceClient()
    .from('ebooks')
    .insert({
      user_id: input.userId,
      workspace_id: workspaceId,
      title: plan.title,
      content: plan.subtitle ? `*${plan.subtitle}*\n\n${body}` : body,
      word_count: total,
      origin: 'compiled',
      lineage: written.map((_, i) => ({ chapter: i, refs: plan.chapters[i].refs })),
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('[forge/longform] save failed:', error?.message);
    yield { type: 'error', message: 'The book was written but could not be saved. Copy it from the preview.' };
    return;
  }
  yield { type: 'done', ebookId: data.id as string, words: total };
}
