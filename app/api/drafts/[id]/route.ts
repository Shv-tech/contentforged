/**
 * app/api/drafts/[id]/route.ts
 *
 * GET     one draft
 * PATCH   edit text, platform, status or schedule. Text edits are recorded
 *         for edit learning and the response carries any new suggestions.
 * DELETE  archive (soft) or, with ?hard=1, delete
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { computeVoiceScore, draftText, loadDraftFor, updateDraft } from '@/lib/forge/data/drafts';
import { recordVersion } from '@/lib/forge/data/collab';
import { createServiceClient } from '@/lib/supabase/service';
import { recordEdit } from '@/lib/forge/data/rules';
import { track } from '@/lib/forge/events';
import { diffWords } from '@/lib/forge/learning';
import { HttpError, isUuid, parseJson, requireUser, route } from '@/lib/forge/http';
import { joinSegments } from '@/lib/forge/text';
import { DRAFT_PLATFORMS, type DraftRecord } from '@/lib/forge/types';

type Params = { params: { id: string } };

async function load(req: Request, id: string, mode: 'read' | 'write') {
  if (!isUuid(id)) throw new HttpError(404, 'Draft not found.');
  const ctx = await requireUser(req);
  const { draft, role } = await loadDraftFor(ctx, id, mode);
  return { ctx, draft, role };
}

export const GET = route('api/drafts/[id]:get', async (req: Request, { params }: Params) => {
  const { draft, role } = await load(req, params.id, 'read');
  return NextResponse.json({ draft, role });
});

const PatchSchema = z.object({
  body: z.string().max(20_000).optional(),
  segments: z.array(z.string().max(4000)).max(25).optional(),
  platform: z.enum(DRAFT_PLATFORMS).optional(),
  kind: z.enum(['post', 'thread', 'carousel']).optional(),
  title: z.string().max(120).nullable().optional(),
  status: z.enum(['draft', 'scheduled', 'posted', 'archived']).optional(),
  /** 'assist' for edits Forge made (rewrite chips), so they never train rules. */
  origin: z.enum(['user', 'assist']).default('user'),
});

export const PATCH = route('api/drafts/[id]:patch', async (req: Request, { params }: Params) => {
  const { ctx, draft } = await load(req, params.id, 'write');
  const input = await parseJson(req, PatchSchema);

  const patch: Partial<DraftRecord> = {};
  if (input.platform) patch.platform = input.platform;
  if (input.kind) patch.kind = input.kind;
  if (input.title !== undefined) patch.title = input.title;
  if (input.status) patch.status = input.status;

  const textChanged = input.body !== undefined || input.segments !== undefined;
  if (textChanged) {
    const segments = (input.segments ?? draft.segments).map((s) => s.trim()).filter(Boolean);
    const kind = input.kind ?? draft.kind;
    patch.segments = segments;
    patch.body = kind === 'thread' && segments.length > 0 ? joinSegments(segments) : (input.body ?? draft.body);
  }

  const before = draftText(draft);
  const afterDraft = { ...draft, ...patch } as DraftRecord;
  const after = draftText(afterDraft);

  if (textChanged && after !== before) {
    patch.voice_score = await computeVoiceScore(ctx.db, ctx.userId, draft.workspace_id, after);
    // A grade describes the text it was given; once the text changes the
    // grade is stale and is cleared rather than shown against new words.
    if (draft.grade && firstLineOf(before) !== firstLineOf(after)) patch.grade = null;
    // A client signed off on specific words. Changing them withdraws the
    // approval, so an edited draft is never published as "approved".
    if (draft.approval_status) patch.approval_status = null;
  }

  const updated = Object.keys(patch).length > 0 ? await updateDraft(ctx.db, ctx.userId, draft.id, patch) : draft;

  if (textChanged && after !== before) {
    // Text changed outside live editing: the live document is rebuilt from
    // the new text the next time someone opens the draft in the studio.
    await createServiceClient().from('drafts').update({ ydoc: null, ydoc_epoch: null }).eq('id', draft.id);
    await recordVersion(ctx.db, { draft: updated, userId: ctx.userId, reason: input.origin === 'assist' ? 'assist' : 'edit', previous: draft }).catch((error) =>
      console.error('[api/drafts/[id]] recording version failed:', error)
    );
  }

  const suggestions =
    textChanged && after !== before
      ? await recordEdit(ctx.db, ctx.userId, draft.workspace_id, draft.id, before, after, input.origin).catch((error) => {
          console.error('[api/drafts/[id]] recording edit failed:', error);
          return [];
        })
      : [];

  if (textChanged && after !== before) {
    void track(ctx.userId, 'draft.edited', { platform: draft.platform, origin: input.origin ?? 'manual', changed: changedShare(before, after) });
  }

  return NextResponse.json({ draft: updated, suggestions });
});

/** Share of words removed or added, 0 to 1, rounded. How much people rewrite Forge's drafts. */
function changedShare(before: string, after: string): number {
  const ops = diffWords(before, after);
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
  const changed = ops.filter((op) => op.kind !== 'equal').reduce((sum, op) => sum + words(op.text), 0);
  const total = Math.max(words(before), words(after), 1);
  return Math.round(Math.min(1, changed / total) * 100) / 100;
}

function firstLineOf(text: string): string {
  return (
    text
      .split('\n')
      .find((line) => line.trim())
      ?.trim() ?? ''
  );
}

export const DELETE = route('api/drafts/[id]:delete', async (req: Request, { params }: Params) => {
  const { ctx, draft } = await load(req, params.id, 'write');
  const hard = new URL(req.url).searchParams.get('hard') === '1';

  if (hard) {
    if (draft.calendar_event_id) {
      await ctx.db.from('calendar_events').delete().eq('id', draft.calendar_event_id).eq('user_id', ctx.userId);
    }
    const { error } = await ctx.db.from('drafts').delete().eq('id', draft.id);
    if (error) throw new HttpError(500, 'Could not delete the draft.');
    return NextResponse.json({ deleted: true });
  }

  const archived = await updateDraft(ctx.db, ctx.userId, draft.id, { status: 'archived' });
  return NextResponse.json({ draft: archived });
});
