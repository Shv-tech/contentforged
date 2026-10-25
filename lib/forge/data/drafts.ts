/**
 * lib/forge/data/drafts.ts
 *
 * Draft persistence. A draft is the unit everything else hangs off: grades,
 * the voice score, edits, the calendar slot, the posted URL and its results,
 * comments, versions, its plan, its source and its experiment arm.
 *
 * Access: a personal draft belongs to its user_id; a workspace draft belongs
 * to the workspace and is readable by every member and writable by owners
 * and editors. `loadDraftFor` is the one gate routes use, and it holds on the
 * service client too, so token requests are checked the same way.
 */

import { track } from '../events';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError, isUuid } from '../http';
import { joinSegments } from '../text';
import { draftText } from '../draft-text';
import { scoreVoice } from '../voice';
import type { DraftKind, DraftPlatform, DraftRecord, Grade, WritingLanguage } from '../types';
import { bannedPhrasesFrom, acceptedRules } from './rules';
import { getFingerprint } from './voice';
import { canWrite, resolveRole, ROLE_LABELS, type WorkspaceRole } from './workspace';

export const DRAFT_COLUMNS =
  'id, user_id, workspace_id, session_id, campaign_id, parent_draft_id, platform, kind, title, body, segments, notes, grade, voice_score, status, scheduled_for, auto_publish, publish_error, calendar_event_id, posted_at, post_url, external_id, approval_status, created_by, plan_id, review_status, idea_id, capture_id, source_id, experiment_id, experiment_arm, format_id, language, visual, composer_filled_at, suggested_for, comments_synced_at, created_at, updated_at';

export interface NewDraft {
  platform: DraftPlatform;
  kind: DraftKind;
  body: string;
  segments?: string[];
  title?: string | null;
  notes?: string | null;
  sessionId?: string | null;
  campaignId?: string | null;
  parentDraftId?: string | null;
  grade?: Grade | null;
  planId?: string | null;
  reviewStatus?: DraftRecord['review_status'];
  ideaId?: string | null;
  captureId?: string | null;
  sourceId?: string | null;
  experimentId?: string | null;
  experimentArm?: 'a' | 'b' | null;
  formatId?: string | null;
  language?: WritingLanguage;
  scheduledFor?: string | null;
  suggestedFor?: string | null;
}

export { draftText };

export async function computeVoiceScore(db: SupabaseClient, userId: string, workspaceId: string | null, text: string): Promise<number | null> {
  const [fingerprint, rules] = await Promise.all([getFingerprint(db, userId, workspaceId), acceptedRules(db, userId, workspaceId).catch(() => [])]);
  return scoreVoice(text, fingerprint?.profile ?? null, bannedPhrasesFrom(rules)).score;
}

export async function createDraft(db: SupabaseClient, userId: string, workspaceId: string | null, input: NewDraft): Promise<DraftRecord> {
  const segments = (input.segments ?? []).map((s) => s.trim()).filter(Boolean);
  const body = input.kind === 'thread' && segments.length > 0 ? joinSegments(segments) : input.body.trim();
  const voiceScore = await computeVoiceScore(db, userId, workspaceId, body);

  const { data, error } = await db
    .from('drafts')
    .insert({
      user_id: userId,
      created_by: userId,
      workspace_id: workspaceId,
      session_id: input.sessionId ?? null,
      campaign_id: input.campaignId ?? null,
      parent_draft_id: input.parentDraftId ?? null,
      platform: input.platform,
      kind: input.kind,
      title: input.title ?? null,
      body,
      segments,
      notes: input.notes ?? null,
      grade: input.grade ?? null,
      voice_score: voiceScore,
      plan_id: input.planId ?? null,
      review_status: input.reviewStatus ?? null,
      idea_id: input.ideaId ?? null,
      capture_id: input.captureId ?? null,
      source_id: input.sourceId ?? null,
      experiment_id: input.experimentId ?? null,
      experiment_arm: input.experimentArm ?? null,
      format_id: input.formatId ?? null,
      language: input.language ?? 'en',
      suggested_for: input.suggestedFor ?? null,
      ...(input.scheduledFor ? { scheduled_for: input.scheduledFor, status: 'scheduled' } : {}),
    })
    .select(DRAFT_COLUMNS)
    .single();

  if (error || !data) throw new Error(`Could not save the draft: ${error?.message ?? 'unknown error'}`);
  const draft = data as DraftRecord;
  void track(userId, 'draft.created', { platform: draft.platform, kind: draft.kind, origin: draftOrigin(input), workspace: Boolean(workspaceId) });
  return draft;
}

/** Where a draft came from, for the product event. Never content. */
function draftOrigin(input: NewDraft): string {
  if (input.planId) return 'plan';
  if (input.experimentId) return 'experiment';
  if (input.formatId) return 'format';
  if (input.sourceId) return 'repurpose';
  if (input.captureId) return 'capture';
  if (input.ideaId) return 'idea';
  if (input.parentDraftId) return 'variant';
  if (input.sessionId) return 'chat';
  return 'other';
}

/**
 * One draft the caller may read, or null. Works on both the RLS-scoped
 * session client and the service client.
 */
export async function getDraft(db: SupabaseClient, userId: string, draftId: string): Promise<DraftRecord | null> {
  const access = await draftAccess(db, userId, draftId);
  return access?.draft ?? null;
}

async function draftAccess(db: SupabaseClient, userId: string, draftId: string): Promise<{ draft: DraftRecord; role: WorkspaceRole } | null> {
  if (!isUuid(draftId)) return null;
  const { data } = await db.from('drafts').select(DRAFT_COLUMNS).eq('id', draftId).maybeSingle();
  if (!data) return null;
  const draft = data as DraftRecord;

  if (!draft.workspace_id) return draft.user_id === userId ? { draft, role: 'owner' } : null;
  const membership = await resolveRole(db, userId, draft.workspace_id);
  return membership ? { draft, role: membership.role } : null;
}

/**
 * The gate every /api/drafts/[id] route goes through: 404 when the draft is
 * not visible to the caller, 403 when it is visible but `write` was asked
 * for and the caller's role is read-only.
 */
export async function loadDraftFor(
  ctx: { db: SupabaseClient; userId: string },
  draftId: string,
  mode: 'read' | 'write'
): Promise<{ draft: DraftRecord; role: WorkspaceRole }> {
  const access = await draftAccess(ctx.db, ctx.userId, draftId);
  if (!access) throw new HttpError(404, 'Draft not found.');
  if (mode === 'write' && !canWrite(access.role)) {
    throw new HttpError(403, `As a ${ROLE_LABELS[access.role].toLowerCase()} you can comment on this draft but not change it.`);
  }
  return access;
}

/**
 * Updates a draft. Callers check access first (loadDraftFor, or a cron job
 * acting for the draft's owner); the user filter here only prevents a
 * personal draft from being touched by anyone but its owner.
 */
export async function updateDraft(
  db: SupabaseClient,
  userId: string,
  draftId: string,
  patch: Partial<Omit<DraftRecord, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<DraftRecord> {
  const { data, error } = await db
    .from('drafts')
    .update(patch)
    .eq('id', draftId)
    .or(`user_id.eq.${userId},workspace_id.not.is.null`)
    .select(DRAFT_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not update the draft: ${error?.message ?? 'not found'}`);
  return data as DraftRecord;
}
