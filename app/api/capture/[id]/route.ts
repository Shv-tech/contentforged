/**
 * app/api/capture/[id]/route.ts
 *
 * GET     one capture with its transcript, proposals, and a short-lived
 *         link to its recording
 * POST    { action: 'retry' }  read it again after a failed extraction
 * DELETE  remove it, its proposals and its recording. Stories already kept
 *         from it stay in the Story Bank.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { brandRequest } from '@/lib/forge/brand-request';
import { CAPTURE_COLUMNS, processCapture, PROPOSAL_COLUMNS, type CaptureRecord } from '@/lib/forge/capture/ingest';
import { scopeRows } from '@/lib/forge/data/workspace';
import { HttpError, isUuid, parseJson, route } from '@/lib/forge/http';
import { brandLanguage } from '@/lib/forge/profile';
import { removeObjects, signedReadUrl } from '@/lib/forge/storage';
import type { SupabaseClient } from '@supabase/supabase-js';

type Params = { params: { id: string } };

async function loadCapture(db: SupabaseClient, userId: string, workspaceId: string | null, id: string): Promise<CaptureRecord> {
  if (!isUuid(id)) throw new HttpError(404, 'Capture not found.');
  const query = db.from('captures').select(CAPTURE_COLUMNS).eq('id', id);
  const { data } = await scopeRows(query, userId, workspaceId).maybeSingle();
  if (!data) throw new HttpError(404, 'Capture not found.');
  return data as CaptureRecord;
}

export const GET = route('api/capture/[id]:get', async (req: Request, { params }: Params) => {
  const { ctx, workspaceId } = await brandRequest(req);
  const capture = await loadCapture(ctx.db, ctx.userId, workspaceId, params.id);
  const { data: proposals } = await ctx.db.from('story_proposals').select(PROPOSAL_COLUMNS).eq('capture_id', capture.id).order('created_at');
  const audioUrl = capture.audio_path ? await signedReadUrl('captures', capture.audio_path, 3600) : null;
  return NextResponse.json({ capture, proposals: proposals ?? [], audioUrl });
});

const ActionSchema = z.object({ action: z.literal('retry') });

export const POST = route('api/capture/[id]:post', async (req: Request, { params }: Params) => {
  await parseJson(req, ActionSchema);
  const { ctx, workspaceId } = await brandRequest(req, { write: true });
  const capture = await loadCapture(ctx.db, ctx.userId, workspaceId, params.id);
  if (capture.status === 'processing' && Date.now() - new Date(capture.updated_at).getTime() < 120_000) {
    throw new HttpError(409, 'Forge is still reading this.');
  }

  // Undecided proposals from an earlier run are replaced, decided ones kept.
  await ctx.db.from('story_proposals').delete().eq('capture_id', capture.id).eq('status', 'pending');
  await ctx.db.from('captures').update({ status: 'processing', error: null }).eq('id', capture.id);
  const processed = await processCapture(ctx.db, capture, {
    language: await brandLanguage(ctx.userId, workspaceId),
    subject: typeof capture.metadata.subject === 'string' ? capture.metadata.subject : null,
  });
  return NextResponse.json({ capture: processed });
});

export const DELETE = route('api/capture/[id]:delete', async (req: Request, { params }: Params) => {
  const { ctx, workspaceId } = await brandRequest(req, { write: true });
  const capture = await loadCapture(ctx.db, ctx.userId, workspaceId, params.id);
  const { error } = await ctx.db.from('captures').delete().eq('id', capture.id);
  if (error) throw new Error(error.message);
  if (capture.audio_path) await removeObjects('captures', [capture.audio_path]);
  return NextResponse.json({ deleted: true });
});
