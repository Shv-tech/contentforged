/**
 * app/api/drafts/[id]/versions/route.ts
 *
 * GET   the draft's history, newest first, with who made each change
 * POST  { versionId }  restore a version. The restore is itself a version,
 *       so nothing is lost by restoring.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listVersions, peopleNamed, recordAudit, recordVersion } from '@/lib/forge/data/collab';
import { computeVoiceScore, loadDraftFor, updateDraft } from '@/lib/forge/data/drafts';
import { HttpError, isUuid, parseJson, requireUser, route } from '@/lib/forge/http';
import { joinSegments } from '@/lib/forge/text';
import { createServiceClient } from '@/lib/supabase/service';

type Params = { params: { id: string } };

export const GET = route('api/drafts/[id]/versions:get', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Draft not found.');
  const ctx = await requireUser(req);
  const { draft } = await loadDraftFor(ctx, params.id, 'read');
  const versions = await listVersions(createServiceClient(), draft.id);
  const people = await peopleNamed(versions.map((v) => v.user_id).filter((id): id is string => Boolean(id)));
  return NextResponse.json({ versions: versions.map((v) => ({ ...v, author: v.user_id ? (people[v.user_id]?.name ?? 'Someone') : 'Forge' })) });
});

export const POST = route('api/drafts/[id]/versions:post', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Draft not found.');
  const { versionId } = await parseJson(req, z.object({ versionId: z.string().uuid() }));
  const ctx = await requireUser(req);
  const { draft } = await loadDraftFor(ctx, params.id, 'write');
  if (draft.status === 'posted') throw new HttpError(409, 'A posted draft keeps the words that went out.');

  const { data: version } = await createServiceClient().from('draft_versions').select('body, segments').eq('id', versionId).eq('draft_id', draft.id).maybeSingle();
  if (!version) throw new HttpError(404, 'Version not found.');

  const segments = (version.segments ?? []) as string[];
  const body = draft.kind === 'thread' && segments.length > 0 ? joinSegments(segments) : version.body;
  const updated = await updateDraft(ctx.db, ctx.userId, draft.id, {
    body,
    segments,
    voice_score: await computeVoiceScore(ctx.db, ctx.userId, draft.workspace_id, body),
    grade: null,
    approval_status: null,
  });
  // Live-editing state describes the old text; editors rebuild it from the body.
  await createServiceClient().from('drafts').update({ ydoc: null, ydoc_epoch: null }).eq('id', draft.id);
  await recordVersion(ctx.db, { draft: updated, userId: ctx.userId, reason: 'restore', previous: draft });
  await recordAudit(draft.workspace_id, ctx.userId, 'draft.restored', { type: 'draft', id: draft.id, detail: { versionId } });
  return NextResponse.json({ draft: updated });
});
