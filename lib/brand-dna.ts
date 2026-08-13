/**
 * lib/brand-dna.ts
 *
 * Owns everything related to assembling a user's Brand DNA context for
 * injection into the FORGE system prompt, plus the CRUD operations behind
 * the brand-dna API routes.
 *
 * Three independent sources feed into one identity block:
 *   1. Manual text      — the account page textarea (user_context, context_type='brand_dna')
 *   2. Uploaded sources  — brand_dna_sources (pdf/md/text files, multi-file)
 *   3. Scraped profiles  — scraped_profiles (public social profile snapshots)
 *
 * ORDERING MATTERS FOR PROMPT CACHING.
 * Blocks are concatenated in a stable order — manual text first, uploaded
 * sources in ascending created_at, scraped summaries last. New sources are
 * always appended, never prepended, so adding a source only ever changes the
 * tail of the identity block. That keeps the shared prefix (and therefore
 * the cache hit) intact across edits instead of invalidating the whole
 * block on every change.
 *
 * TRUNCATION PRIORITY.
 * If everything combined exceeds the budget, the least authoritative
 * material is dropped first: scraped summaries, then the newest uploaded
 * sources. Manual text — the thing the user deliberately typed — is never
 * truncated.
 */

import { createClient } from '@/lib/supabase/server';
import { parseAttachment, type RawAttachment } from '@/lib/file-parsers';

// ============================================================================
// TYPES
// ============================================================================

/**
 * 'text' means a pasted string with no file. Everything else is a file upload.
 *
 * The distinction matters: createBrandDnaSource branches on it, and a .txt
 * upload previously arrived as 'text', hit the pasted-string branch, found no
 * textContent, and threw. Every .txt upload failed with a 500 for that reason.
 */
export type BrandDnaSourceType = 'text' | 'pdf' | 'md' | 'txt' | 'docx';

/** File-backed source types, i.e. everything except pasted text. */
export const FILE_SOURCE_TYPES: BrandDnaSourceType[] = ['pdf', 'md', 'txt', 'docx'];

export function isBrandDnaSourceType(value: unknown): value is BrandDnaSourceType {
  return (
    value === 'text' || value === 'pdf' || value === 'md' ||
    value === 'txt' || value === 'docx'
  );
}

export interface BrandDnaSourceRecord {
  id: string;
  source_type: BrandDnaSourceType;
  title: string;
  content: string;
  original_filename: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScrapedProfileRecord {
  id: string;
  platform: string;
  profile_url: string;
  handle: string | null;
  summary: string | null;
  scraped_at: string | null;
  next_refresh_at: string | null;
}

// Total character budget for the assembled identity block. Sized generously
// above the 512/1024-token prompt-caching minimums (see Anthropic prompt
// caching docs) while staying well clear of context-window pressure.
const MAX_IDENTITY_CHARS = 60_000;

// ============================================================================
// READS
// ============================================================================

export async function getManualBrandDnaText(userId: string): Promise<string | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('user_context')
    .select('content')
    .eq('user_id', userId)
    .eq('context_type', 'brand_dna')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  const content = data[0].content?.trim();
  return content && content.length > 0 ? content : null;
}

export async function listBrandDnaSources(userId: string): Promise<BrandDnaSourceRecord[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('brand_dna_sources')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to list brand DNA sources: ${error.message}`);
  return (data ?? []) as BrandDnaSourceRecord[];
}

async function getActiveBrandDnaSources(userId: string): Promise<BrandDnaSourceRecord[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('brand_dna_sources')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to load brand DNA sources: ${error.message}`);
  return (data ?? []) as BrandDnaSourceRecord[];
}

async function getScrapedProfileSummaries(userId: string): Promise<ScrapedProfileRecord[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('scraped_profiles')
    .select('id, platform, profile_url, handle, summary, scraped_at, next_refresh_at')
    .eq('user_id', userId)
    .not('summary', 'is', null)
    .order('platform', { ascending: true });

  if (error) throw new Error(`Failed to load scraped profiles: ${error.message}`);
  return (data ?? []) as ScrapedProfileRecord[];
}

// ============================================================================
// WRITES
// ============================================================================

export interface CreateBrandDnaSourceInput {
  userId: string;
  sourceType: BrandDnaSourceType;
  title: string;
  /** Required when sourceType === 'text'. */
  textContent?: string;
  /** Required when sourceType is 'pdf' or 'md'. */
  file?: RawAttachment;
}

export async function createBrandDnaSource(
  input: CreateBrandDnaSourceInput
): Promise<BrandDnaSourceRecord> {
  const { userId, sourceType, title } = input;

  let content: string;
  let originalFilename: string | null = null;

  if (sourceType === 'text') {
    if (!input.textContent || input.textContent.trim().length === 0) {
      throw new Error('textContent is required for a text brand DNA source.');
    }
    content = input.textContent.trim();
  } else {
    if (!input.file) {
      throw new Error(`A file is required for a "${sourceType}" brand DNA source.`);
    }
    const parsed = await parseAttachment(input.file);
    content = parsed.extractedText;
    originalFilename = input.file.name;
  }

  if (!content || content.trim().length === 0) {
    throw new Error('No usable content was extracted from this source.');
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('brand_dna_sources')
    .insert({
      user_id: userId,
      source_type: sourceType,
      title: title?.trim() || originalFilename || 'Untitled Source',
      content,
      original_filename: originalFilename,
      is_active: true,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to save brand DNA source: ${error?.message ?? 'unknown error'}`);
  }

  return data as BrandDnaSourceRecord;
}

export async function setBrandDnaSourceActive(
  userId: string,
  sourceId: string,
  isActive: boolean
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('brand_dna_sources')
    .update({ is_active: isActive })
    .eq('id', sourceId)
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to update brand DNA source: ${error.message}`);
}

export async function deleteBrandDnaSource(userId: string, sourceId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('brand_dna_sources')
    .delete()
    .eq('id', sourceId)
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to delete brand DNA source: ${error.message}`);
}

// ============================================================================
// ASSEMBLY
// ============================================================================

interface IdentityBlock {
  /** Lower = higher priority = kept when truncating. */
  priority: number;
  label: string;
  text: string;
}

/**
 * Builds the single context block injected into the FORGE system prompt.
 * Returns null when the user has no brand identity configured anywhere,
 * preserving the existing "Database EMPTY" onboarding flow in chat/route.ts.
 */
export async function assembleBrandIdentity(userId: string): Promise<string | null> {
  const [manualText, uploadedSources, scrapedProfiles] = await Promise.all([
    getManualBrandDnaText(userId),
    getActiveBrandDnaSources(userId).catch(() => [] as BrandDnaSourceRecord[]),
    getScrapedProfileSummaries(userId).catch(() => [] as ScrapedProfileRecord[]),
  ]);

  const blocks: IdentityBlock[] = [];

  if (manualText) {
    blocks.push({ priority: 0, label: 'Manual Brand DNA', text: manualText });
  }

  uploadedSources.forEach((source, index) => {
    blocks.push({
      priority: 1,
      label: `Uploaded Source: ${source.title} (${source.source_type.toUpperCase()})`,
      text: source.content,
    });
  });

  scrapedProfiles.forEach((profile) => {
    if (!profile.summary) return;
    blocks.push({
      priority: 2,
      label: `Public Profile Snapshot: ${profile.platform}${
        profile.handle ? ` (@${profile.handle})` : ''
      }`,
      text: profile.summary,
    });
  });

  if (blocks.length === 0) return null;

  return renderIdentityBlocks(blocks);
}

function renderIdentityBlocks(blocks: IdentityBlock[]): string {
  const rendered = blocks.map((b) => `### ${b.label}\n${b.text.trim()}`);
  const joined = rendered.join('\n\n');

  if (joined.length <= MAX_IDENTITY_CHARS) return joined;

  // Over budget: drop lowest-priority blocks from the end until it fits.
  // Manual text (priority 0) is never dropped.
  const sortedByPriorityDesc = [...blocks].sort((a, b) => b.priority - a.priority);
  const droppedLabels: string[] = [];
  const kept = new Set(blocks);

  for (const candidate of sortedByPriorityDesc) {
    if (candidate.priority === 0) break; // never drop manual text

    const currentText = [...blocks]
      .filter((b) => kept.has(b))
      .map((b) => `### ${b.label}\n${b.text.trim()}`)
      .join('\n\n');

    if (currentText.length <= MAX_IDENTITY_CHARS) break;

    kept.delete(candidate);
    droppedLabels.push(candidate.label);
  }

  const finalText = blocks
    .filter((b) => kept.has(b))
    .map((b) => `### ${b.label}\n${b.text.trim()}`)
    .join('\n\n');

  const truncationNote =
    droppedLabels.length > 0
      ? `\n\n[NOTE: ${droppedLabels.length} lower-priority source(s) omitted to stay within the context budget: ${droppedLabels.join(', ')}]`
      : '';

  return (finalText + truncationNote).slice(0, MAX_IDENTITY_CHARS);
}