/**
 * app/api/drafts/[id]/collab/route.ts
 *
 * GET  the draft's live-editing state. The first open creates it from the
 *      draft's text, once: concurrent first opens race on a conditional
 *      write and everyone gets the winner, so the text is never duplicated.
 * PUT  { state }  an editor's full document state. Merged with the stored
 *      state (a CRDT merge, so order and repetition do not matter), saved,
 *      and written through to the draft's text with a version.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { collabTextOf, fromBase64, fromCollabText, initialState, mergeStates, toBase64 } from '@/lib/forge/collab-doc';
import { recordAudit, recordVersion } from '@/lib/forge/data/collab';
import { computeVoiceScore, loadDraftFor, updateDraft } from '@/lib/forge/data/drafts';
import { draftText } from '@/lib/forge/draft-text';
import { HttpError, isUuid, parseJson, requireUser, route } from '@/lib/forge/http';
import { firstLine } from '@/lib/forge/text';
import { createServiceClient } from '@/lib/supabase/service';
import type { DraftRecord } from '@/lib/forge/types';

type Params = { params: { id: string } };

async function storedState(draftId: string): Promise<{ state: string | null; epoch: string | null }> {
  const { data } = await createServiceClient().from('drafts').select('ydoc, ydoc_epoch').eq('id', draftId).maybeSingle();
  return { state: (data?.ydoc as string | null) ?? null, epoch: (data?.ydoc_epoch as string | null) ?? null };
}

export const GET = route('api/drafts/[id]/collab:get', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Draft not found.');
  const ctx = await requireUser(req);
  const { draft, role } = await loadDraftFor(ctx, params.id, 'read');

  let stored = await storedState(draft.id);
  if (!stored.state || !stored.epoch) {
    const created = toBase64(initialState(collabTextOf(draft)));
    await createServiceClient().from('drafts').update({ ydoc: created, ydoc_epoch: randomUUID() }).eq('id', draft.id).is('ydoc', null);
    stored = await storedState(draft.id);
  }
  return NextResponse.json({ state: stored.state, epoch: stored.epoch, text: collabTextOf(draft), kind: draft.kind, role, updatedAt: draft.updated_at });
});

const PutSchema = z.object({ state: z.string().min(4).max(2_800_000), epoch: z.string().min(8).max(64) });

export const PUT = route('api/drafts/[id]/collab:put', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Draft not found.');
  const { state, epoch } = await parseJson(req, PutSchema);
  const ctx = await requireUser(req);
  const { draft } = await loadDraftFor(ctx, params.id, 'write');
  if (draft.status === 'posted') throw new HttpError(409, 'A posted draft keeps the words that went out.');

  // The text was reset outside live editing since this editor opened it:
  // merging its old document would bring the old text back alongside the new.
  const stored = await storedState(draft.id);
  if (!stored.state || stored.epoch !== epoch) {
    throw new HttpError(409, 'This draft changed outside live editing. Reloading it.', { reset: true });
  }

  let merged: { state: Uint8Array; text: string };
  try {
    merged = mergeStates(fromBase64(stored.state), fromBase64(state));
  } catch {
    throw new HttpError(400, 'That editing state could not be read. Reload the draft.');
  }
  if (merged.text.length > 20_000) throw new HttpError(413, 'Drafts can be up to 20,000 characters.');

  await createServiceClient().from('drafts').update({ ydoc: toBase64(merged.state) }).eq('id', draft.id).eq('ydoc_epoch', epoch);

  let updated: DraftRecord = draft;
  if (merged.text !== collabTextOf(draft)) {
    const { body, segments } = fromCollabText(draft.kind, merged.text);
    const next = { ...draft, body, segments };
    const before = draftText(draft);
    const after = draftText(next);
    updated = await updateDraft(ctx.db, ctx.userId, draft.id, {
      body,
      segments,
      voice_score: await computeVoiceScore(ctx.db, ctx.userId, draft.workspace_id, after),
      // A grade belongs to an opening; approval belongs to exact words.
      ...(draft.grade && firstLine(before) !== firstLine(after) ? { grade: null } : {}),
      ...(draft.approval_status ? { approval_status: null } : {}),
    });
    await recordVersion(ctx.db, { draft: updated, userId: ctx.userId, reason: 'collab', previous: draft });
    await recordAudit(draft.workspace_id, ctx.userId, 'draft.edited', { type: 'draft', id: draft.id, detail: { live: true } });
  }

  return NextResponse.json({ state: toBase64(merged.state), draft: updated });
});
