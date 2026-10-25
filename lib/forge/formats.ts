/**
 * lib/forge/formats.ts
 *
 * Shared formats: the structure of a post that worked, with every personal
 * fact taken out, published so other people can fill it with their own
 * material.
 *
 * A format is a short list of slots ("The admission", "The number that
 * changed my mind", "What I do now"), each with guidance on what goes there.
 * Applying one writes a draft that follows the slots in order using only the
 * applier's own Story Bank, so a format can never carry someone else's facts
 * into your post.
 *
 * How formats perform is shown only in aggregate, from people who opted in
 * to anonymous insights, and only once at least K_ANONYMITY of them have
 * posted with it (see computeFormatStats).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { structuredCall, type ToolDefinition } from '@/lib/ai/anthropic';
import type { TokenUsage } from '@/lib/billing/plans';
import { createDraft } from './data/drafts';
import type { WorkspaceRef } from './data/workspace';
import { draftText } from './draft-text';
import { HttpError } from './http';
import { K_ANONYMITY } from './niche-insights';
import { loadPostedPosts, scorePosts } from './playbook';
import { cleanString as clean } from './text';
import { DRAFT_PLATFORMS, type DraftPlatform, type DraftRecord } from './types';
import { loadBrandContext, writePost, estimateWriteTokens, type FormatSlot } from './writer';
import { metered } from './metered';

export const MAX_SLOTS = 8;
export const MIN_SLOTS = 2;
const MAX_FORMATS_PER_AUTHOR = 40;

export interface FormatRecord {
  id: string;
  author_id: string | null;
  title: string;
  summary: string | null;
  platform: DraftPlatform | null;
  structure: FormatSlot[];
  example: string | null;
  source_draft_id: string | null;
  visibility: 'public' | 'unlisted';
  use_count: number;
  created_at: string;
  updated_at: string;
}

export interface FormatStats {
  user_count: number;
  post_count: number;
  /** Median of each contributor's median performance relative to their own baseline. 1 is typical. */
  median_relative: number;
}

export interface GalleryFormat extends FormatRecord {
  stats: FormatStats | null;
  mine: boolean;
  author_name: string | null;
}

export const FORMAT_COLUMNS = 'id, author_id, title, summary, platform, structure, example, source_draft_id, visibility, use_count, created_at, updated_at';

// ============================================================================
// EXTRACTING A FORMAT FROM A POST
// ============================================================================

export interface FormatProposal {
  title: string;
  summary: string;
  platform: DraftPlatform;
  structure: FormatSlot[];
}

const EXTRACT_TOOL: ToolDefinition = {
  name: 'record_format',
  description: 'Record the reusable structure of the post, with no personal facts.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'A plain name for the structure, 3 to 60 characters. Not clever.' },
      summary: { type: 'string', description: 'One sentence on when this structure fits.' },
      slots: {
        type: 'array',
        minItems: MIN_SLOTS,
        maxItems: MAX_SLOTS,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Two to five words naming the move, e.g. "The admission".' },
            guidance: { type: 'string', description: 'One or two sentences on what goes here, generic enough for anyone to fill.' },
          },
          required: ['label', 'guidance'],
        },
      },
    },
    required: ['title', 'summary', 'slots'],
  },
};

const EXTRACT_SYSTEM = `You turn a social post into a reusable structure other writers can fill with their own experiences.

Describe the moves the post makes, in order. Each slot names one move and says what kind of material goes there.

Never carry over anything specific to the author: no names, companies, products, numbers, places, dates, quotes or events. "A number from your own work that surprised you" is right; "The 40% churn drop" is wrong.
Keep slots few and distinct. Merge moves that do the same job.`;

export async function extractFormat(draft: DraftRecord): Promise<{ proposal: FormatProposal; usage: TokenUsage }> {
  const text = draftText(draft).slice(0, 6000);
  if (text.trim().length < 80) throw new HttpError(422, 'This post is too short to have a structure worth sharing.');

  const { data, usage } = await structuredCall<Record<string, unknown>>(
    {
      system: EXTRACT_SYSTEM,
      messages: [{ role: 'user', content: `Platform: ${draft.platform}${draft.kind !== 'post' ? ` (${draft.kind})` : ''}\n\nPOST:\n${text}` }],
      tool: EXTRACT_TOOL,
      temperature: 0.2,
      maxTokens: 1200,
    },
    { timeoutMs: 40_000 }
  );

  const structure = normaliseSlots(data.slots);
  if (structure.length < MIN_SLOTS) throw new HttpError(422, 'Could not find a structure in this post. Try one with clearer parts.');
  return {
    proposal: {
      title: clean(data.title, 80) || 'Untitled format',
      summary: clean(data.summary, 300),
      platform: draft.platform,
      structure,
    },
    usage,
  };
}

export function normaliseSlots(raw: unknown): FormatSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((slot: unknown) => {
      const value = (slot ?? {}) as Record<string, unknown>;
      const label = clean(value.label, 60);
      const guidance = clean(value.guidance, 280);
      return label && guidance ? { label, guidance } : null;
    })
    .filter((slot): slot is FormatSlot => slot !== null)
    .slice(0, MAX_SLOTS);
}

// ============================================================================
// PUBLISHING AND THE GALLERY
// ============================================================================

export interface NewFormat {
  title: string;
  summary: string | null;
  platform: DraftPlatform | null;
  structure: FormatSlot[];
  /** The author's own post as an example, only when they choose to include it. */
  example: string | null;
  sourceDraftId: string | null;
  visibility: 'public' | 'unlisted';
}

/** Formats are written with the service role: the table has no insert policy so nothing bypasses these checks. */
export async function publishFormat(userId: string, input: NewFormat): Promise<FormatRecord> {
  const service = createServiceClient();
  const structure = normaliseSlots(input.structure);
  if (structure.length < MIN_SLOTS) throw new HttpError(400, `A format needs at least ${MIN_SLOTS} parts.`);

  const { count } = await service.from('formats').select('id', { count: 'exact', head: true }).eq('author_id', userId).is('removed_at', null);
  if ((count ?? 0) >= MAX_FORMATS_PER_AUTHOR) throw new HttpError(409, `You have published ${MAX_FORMATS_PER_AUTHOR} formats. Remove one to publish another.`);

  const { data, error } = await service
    .from('formats')
    .insert({
      author_id: userId,
      title: input.title.trim().slice(0, 80),
      summary: input.summary?.trim().slice(0, 300) || null,
      platform: input.platform,
      structure,
      example: input.example?.trim().slice(0, 3000) || null,
      source_draft_id: input.sourceDraftId,
      visibility: input.visibility,
    })
    .select(FORMAT_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not publish the format: ${error?.message ?? 'unknown error'}`);
  return data as FormatRecord;
}

export interface GalleryQuery {
  platform?: DraftPlatform | null;
  sort?: 'popular' | 'new' | 'proven' | 'mine';
  search?: string | null;
  limit?: number;
}

export async function listGallery(db: SupabaseClient, userId: string, query: GalleryQuery = {}): Promise<GalleryFormat[]> {
  const limit = Math.min(Math.max(query.limit ?? 60, 1), 100);
  let request = db.from('formats').select(FORMAT_COLUMNS).is('removed_at', null);
  if (query.sort === 'mine') request = request.eq('author_id', userId);
  else request = request.eq('visibility', 'public');
  if (query.platform && (DRAFT_PLATFORMS as readonly string[]).includes(query.platform)) request = request.eq('platform', query.platform);
  const search = query.search?.trim().replace(/[%_,()]/g, ' ').slice(0, 60);
  if (search) request = request.or(`title.ilike.%${search}%,summary.ilike.%${search}%`);
  request = query.sort === 'new' || query.sort === 'mine' ? request.order('created_at', { ascending: false }) : request.order('use_count', { ascending: false }).order('created_at', { ascending: false });

  const { data, error } = await request.limit(query.sort === 'proven' ? 100 : limit);
  if (error) throw new Error(`Could not load formats: ${error.message}`);
  const formats = (data ?? []) as FormatRecord[];
  const decorated = await decorate(formats, userId);
  if (query.sort !== 'proven') return decorated;
  return decorated
    .filter((f) => f.stats !== null)
    .sort((a, b) => (b.stats?.median_relative ?? 0) - (a.stats?.median_relative ?? 0))
    .slice(0, limit);
}

export async function getFormat(db: SupabaseClient, userId: string, id: string): Promise<GalleryFormat | null> {
  const { data } = await db.from('formats').select(FORMAT_COLUMNS).eq('id', id).is('removed_at', null).maybeSingle();
  if (!data) return null;
  const [format] = await decorate([data as FormatRecord], userId);
  return format;
}

async function decorate(formats: FormatRecord[], userId: string): Promise<GalleryFormat[]> {
  if (formats.length === 0) return [];
  const service = createServiceClient();
  const ids = formats.map((f) => f.id);
  const authorIds = Array.from(new Set(formats.map((f) => f.author_id).filter((id): id is string => Boolean(id))));
  const [stats, authors] = await Promise.all([
    service.from('format_stats').select('format_id, user_count, post_count, median_relative').in('format_id', ids).gte('user_count', K_ANONYMITY),
    authorIds.length > 0 ? service.from('profiles').select('id, full_name').in('id', authorIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);
  const statsById = new Map((stats.data ?? []).map((s: { format_id: string } & FormatStats) => [s.format_id, s]));
  const nameById = new Map((authors.data ?? []).map((a: { id: string; full_name: string | null }) => [a.id, a.full_name]));

  return formats.map((format) => {
    const s = statsById.get(format.id);
    return {
      ...format,
      structure: normaliseSlots(format.structure),
      stats: s ? { user_count: s.user_count, post_count: s.post_count, median_relative: Number(s.median_relative) } : null,
      mine: format.author_id === userId,
      // First name only: the gallery credits authors without exposing them.
      author_name: format.author_id ? (nameById.get(format.author_id)?.split(' ')[0] ?? null) : null,
    };
  });
}

export async function removeFormat(userId: string, id: string): Promise<void> {
  const { data, error } = await createServiceClient()
    .from('formats')
    .update({ removed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('author_id', userId)
    .is('removed_at', null)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new HttpError(404, 'Format not found.');
}

// ============================================================================
// APPLYING A FORMAT
// ============================================================================

export async function applyFormat(input: {
  db: SupabaseClient;
  userId: string;
  workspace: WorkspaceRef | null;
  format: FormatRecord;
  angle: string;
  platform: DraftPlatform;
}): Promise<{ draft: DraftRecord; missingFacts: string[] }> {
  const context = await loadBrandContext(input.db, input.userId, input.workspace);
  const request = {
    angle: input.angle,
    platform: input.platform,
    kind: input.platform === 'x' && input.format.structure.length > 4 ? ('thread' as const) : ('post' as const),
    format: { title: input.format.title, slots: normaliseSlots(input.format.structure) },
  };

  const written = await metered(
    { userId: input.userId, route: 'formats:apply', maxOutputTokens: 2400, estimatedInputTokens: estimateWriteTokens(context, request) + 400 },
    async () => {
      const result = await writePost(context, request);
      return { value: result.draft, usage: result.usage };
    }
  );

  const draft = await createDraft(input.db, input.userId, input.workspace?.id ?? null, {
    platform: written.platform,
    kind: written.kind,
    body: written.body,
    segments: written.segments,
    title: written.title,
    notes: written.missingFacts.length > 0 ? `Fill in before posting: ${written.missingFacts.join('; ')}.` : null,
    formatId: input.format.id,
    language: context.language,
  });

  const { error } = await createServiceClient().rpc('forge_bump_format_use', { p_format_id: input.format.id });
  if (error) console.error('[forge/formats] use count:', error.message);
  return { draft, missingFacts: written.missingFacts };
}

// ============================================================================
// AGGREGATE RESULTS
// ============================================================================

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Recomputes format_stats from people who opted in to anonymous insights.
 * Each contributor adds one number per format (the median of their posts
 * with it, relative to their own baseline), and a format's stats are kept
 * only when at least K_ANONYMITY people contribute. Stale rows for formats
 * that fell below the bar are removed.
 */
export async function computeFormatStats(db: SupabaseClient): Promise<{ formats: number }> {
  const { data: contributors, error } = await db.from('profiles').select('id').eq('share_anonymous_insights', true);
  if (error) throw new Error(error.message);

  const byFormat = new Map<string, { medians: number[]; posts: number }>();
  for (const contributor of contributors ?? []) {
    const scored = scorePosts(await loadPostedPosts(db, contributor.id, null, 300)).filter((p) => p.draft.format_id);
    const grouped = new Map<string, number[]>();
    for (const post of scored) {
      const id = post.draft.format_id as string;
      grouped.set(id, [...(grouped.get(id) ?? []), post.relative]);
    }
    for (const [formatId, values] of grouped) {
      const entry = byFormat.get(formatId) ?? { medians: [], posts: 0 };
      entry.medians.push(median(values));
      entry.posts += values.length;
      byFormat.set(formatId, entry);
    }
  }

  const rows = Array.from(byFormat.entries())
    .filter(([, entry]) => entry.medians.length >= K_ANONYMITY)
    .map(([formatId, entry]) => ({
      format_id: formatId,
      user_count: entry.medians.length,
      post_count: entry.posts,
      median_relative: Math.round(median(entry.medians) * 100) / 100,
      computed_at: new Date().toISOString(),
    }));

  if (rows.length > 0) {
    const { error: upsertError } = await db.from('format_stats').upsert(rows, { onConflict: 'format_id' });
    if (upsertError) throw new Error(upsertError.message);
  }
  const keep = rows.map((r) => r.format_id);
  const stale = db.from('format_stats').delete();
  const { error: deleteError } = keep.length > 0 ? await stale.not('format_id', 'in', `(${keep.join(',')})`) : await stale.neq('format_id', '00000000-0000-0000-0000-000000000000');
  if (deleteError) console.error('[forge/formats] stale stats:', deleteError.message);
  return { formats: rows.length };
}
