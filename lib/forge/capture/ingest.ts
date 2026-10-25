/**
 * lib/forge/capture/ingest.ts
 *
 * The capture pipeline: store raw material, extract proposals and ideas
 * from it, and let a person keep or discard each proposal.
 *
 * Every path into Forge (a voice note, an interview, an email, a shared
 * link, a source sync, the extension) ends here, so they all behave the
 * same: material is stored as-is, nothing becomes a "fact" without a person
 * saying so, and a failed extraction can be retried without re-uploading.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createStory } from '../data/stories';
import { HttpError } from '../http';
import { metered, estimateTokens } from '../metered';
import { timestampedText, type TranscriptSegment } from '../transcribe';
import type { StoryItem, StoryKind, WritingLanguage } from '../types';
import { extractFromMaterial, type CaptureSource } from './extract';

export interface CaptureRecord {
  id: string;
  user_id: string;
  workspace_id: string | null;
  source: CaptureSource;
  title: string | null;
  raw_text: string;
  segments: TranscriptSegment[] | null;
  metadata: Record<string, unknown>;
  external_id: string | null;
  audio_path: string | null;
  duration_seconds: number | null;
  status: 'processing' | 'ready' | 'failed';
  error: string | null;
  proposal_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProposalRecord {
  id: string;
  user_id: string;
  workspace_id: string | null;
  capture_id: string;
  kind: StoryKind;
  title: string;
  body: string;
  quote: string | null;
  quote_start_seconds: number | null;
  occurred_on: string | null;
  status: 'pending' | 'kept' | 'discarded';
  story_id: string | null;
  decided_at: string | null;
  created_at: string;
}

export const CAPTURE_COLUMNS =
  'id, user_id, workspace_id, source, title, raw_text, segments, metadata, external_id, audio_path, duration_seconds, status, error, proposal_count, created_at, updated_at';
export const CAPTURE_SUMMARY_COLUMNS = 'id, user_id, workspace_id, source, title, metadata, external_id, audio_path, duration_seconds, status, error, proposal_count, created_at, updated_at';
export const PROPOSAL_COLUMNS = 'id, user_id, workspace_id, capture_id, kind, title, body, quote, quote_start_seconds, occurred_on, status, story_id, decided_at, created_at';

/** Material shorter than this has nothing to extract from. */
const MIN_MATERIAL = 24;

export interface NewCapture {
  source: CaptureSource;
  title?: string | null;
  rawText: string;
  segments?: TranscriptSegment[] | null;
  metadata?: Record<string, unknown>;
  externalId?: string | null;
  audioPath?: string | null;
  durationSeconds?: number | null;
}

/**
 * Stores a capture. Returns null when the source already sent this exact
 * item (same external id), which is how syncs and email retries stay
 * idempotent.
 */
export async function createCapture(db: SupabaseClient, userId: string, workspaceId: string | null, input: NewCapture): Promise<CaptureRecord | null> {
  const row = {
    user_id: userId,
    workspace_id: workspaceId,
    source: input.source,
    title: input.title?.slice(0, 200) ?? null,
    raw_text: input.rawText.slice(0, 200_000),
    segments: input.segments ?? null,
    metadata: input.metadata ?? {},
    external_id: input.externalId ?? null,
    audio_path: input.audioPath ?? null,
    duration_seconds: input.durationSeconds ?? null,
    status: 'processing' as const,
  };

  const { data, error } = await db.from('captures').insert(row).select(CAPTURE_COLUMNS).single();
  if (error) {
    // 23505: the unique (user, source, external_id) index. Already captured.
    if (error.code === '23505') return null;
    throw new Error(`Could not save the capture: ${error.message}`);
  }
  return data as CaptureRecord;
}

/**
 * Extracts proposals and ideas from a capture and stores them. Spends the
 * owner's quota. Marks the capture ready or failed; never throws for a
 * model failure, so callers can return the capture either way.
 */
export async function processCapture(
  db: SupabaseClient,
  capture: CaptureRecord,
  options: { language: WritingLanguage; subject?: string | null }
): Promise<CaptureRecord> {
  const material = capture.segments && capture.segments.length > 0 ? timestampedText(capture.segments) : capture.raw_text;

  if (material.trim().length < MIN_MATERIAL) {
    return finish(db, capture.id, { status: 'ready', error: null, proposal_count: 0 });
  }

  try {
    const extraction = await metered(
      {
        userId: capture.user_id,
        route: `capture:${capture.source}`,
        maxOutputTokens: 3000,
        estimatedInputTokens: estimateTokens(material) + 900,
      },
      async () => {
        const result = await extractFromMaterial({
          source: capture.source,
          material,
          language: options.language,
          today: new Date().toISOString().slice(0, 10),
          subject: options.subject ?? null,
        });
        return { value: result.extraction, usage: result.usage };
      }
    );

    if (extraction.proposals.length > 0) {
      const { error } = await db.from('story_proposals').insert(
        extraction.proposals.map((proposal) => ({
          user_id: capture.user_id,
          workspace_id: capture.workspace_id,
          capture_id: capture.id,
          kind: proposal.kind,
          title: proposal.title,
          body: proposal.body,
          quote: proposal.quote,
          quote_start_seconds: proposal.startSeconds,
          occurred_on: proposal.occurredOn,
        }))
      );
      if (error) throw new Error(error.message);
    }

    if (extraction.ideas.length > 0) {
      await db.from('ideas').insert(
        extraction.ideas.map((idea, index) => ({
          user_id: capture.user_id,
          workspace_id: capture.workspace_id,
          source: 'capture',
          angle: idea.angle,
          rationale: idea.rationale,
          capture_id: capture.id,
          // Fresh, first-hand material ranks above generic signals.
          score: 0.8 - index * 0.05,
        }))
      );
    }

    return finish(db, capture.id, {
      status: 'ready',
      error: null,
      proposal_count: extraction.proposals.length,
      title: capture.title ?? extraction.title,
    });
  } catch (error) {
    const message =
      error instanceof HttpError && error.status === 429
        ? 'Your plan’s allowance is used up for now, so this was saved but not read yet. Try again when it resets.'
        : 'Forge could not read this yet. Try again.';
    console.error('[forge/capture] extraction failed for', capture.id, error);
    return finish(db, capture.id, { status: 'failed', error: message });
  }
}

async function finish(db: SupabaseClient, id: string, patch: Partial<CaptureRecord>): Promise<CaptureRecord> {
  const { data, error } = await db.from('captures').update(patch).eq('id', id).select(CAPTURE_COLUMNS).single();
  if (error || !data) throw new Error(`Could not update the capture: ${error?.message ?? 'not found'}`);
  return data as CaptureRecord;
}

/**
 * Keeps a proposal (optionally edited) as a Story Bank entry, or discards
 * it. Kept stories remember the capture and quote they came from.
 */
export async function decideProposal(
  db: SupabaseClient,
  userId: string,
  proposal: ProposalRecord,
  decision: { action: 'keep' | 'discard'; edits?: { title?: string; body?: string; kind?: StoryKind } },
  captureSource: CaptureSource
): Promise<{ proposal: ProposalRecord; story: StoryItem | null }> {
  if (proposal.status !== 'pending') throw new HttpError(409, 'This proposal has already been decided.');

  let story: StoryItem | null = null;
  if (decision.action === 'keep') {
    story = await createStory(db, userId, proposal.workspace_id, {
      kind: decision.edits?.kind ?? proposal.kind,
      title: decision.edits?.title?.trim() || proposal.title,
      body: decision.edits?.body?.trim() || proposal.body,
      occurred_on: proposal.occurred_on,
      source: captureSource === 'interview' ? 'interview' : 'capture',
      capture_id: proposal.capture_id,
      quote: proposal.quote,
      quote_start_seconds: proposal.quote_start_seconds,
    });
  }

  const { data, error } = await db
    .from('story_proposals')
    .update({
      status: decision.action === 'keep' ? 'kept' : 'discarded',
      story_id: story?.id ?? null,
      decided_by: userId,
      decided_at: new Date().toISOString(),
    })
    .eq('id', proposal.id)
    .eq('status', 'pending')
    .select(PROPOSAL_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Could not record the decision: ${error.message}`);
  if (!data) throw new HttpError(409, 'This proposal has already been decided.');

  return { proposal: data as ProposalRecord, story };
}
