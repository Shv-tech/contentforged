/**
 * app/api/capture/route.ts
 *
 * GET   the capture inbox for the active brand: pending proposals with the
 *       capture each came from, and recent captures
 * POST  { text, title? }  capture a typed note and read it for proposals
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { brandRequest } from '@/lib/forge/brand-request';
import { CAPTURE_SUMMARY_COLUMNS, createCapture, processCapture, PROPOSAL_COLUMNS, type ProposalRecord } from '@/lib/forge/capture/ingest';
import { scopeRows } from '@/lib/forge/data/workspace';
import { track } from '@/lib/forge/events';
import { HttpError, parseJson, route } from '@/lib/forge/http';
import { brandLanguage } from '@/lib/forge/profile';

export const GET = route('api/capture:get', async (req: Request) => {
  const { ctx, workspaceId } = await brandRequest(req);

  const proposalsQuery = ctx.db.from('story_proposals').select(PROPOSAL_COLUMNS).eq('status', 'pending');
  const capturesQuery = ctx.db.from('captures').select(CAPTURE_SUMMARY_COLUMNS);
  const [proposals, captures] = await Promise.all([
    scopeRows(proposalsQuery, ctx.userId, workspaceId).order('created_at', { ascending: false }).limit(100),
    scopeRows(capturesQuery, ctx.userId, workspaceId).order('created_at', { ascending: false }).limit(40),
  ]);
  if (proposals.error) throw new Error(proposals.error.message);
  if (captures.error) throw new Error(captures.error.message);

  return NextResponse.json({ proposals: (proposals.data ?? []) as ProposalRecord[], captures: captures.data ?? [] });
});

const NoteSchema = z.object({
  text: z.string().trim().min(10, 'Write a little more for Forge to work with.').max(50_000),
  title: z.string().trim().max(200).optional(),
});

export const POST = route('api/capture:post', async (req: Request) => {
  const { ctx, workspaceId } = await brandRequest(req, { write: true, feature: 'capture' });
  const input = await parseJson(req, NoteSchema);

  const capture = await createCapture(ctx.db, ctx.userId, workspaceId, { source: 'manual', title: input.title ?? null, rawText: input.text });
  if (!capture) throw new HttpError(409, 'That note was already captured.');
  const processed = await processCapture(ctx.db, capture, { language: await brandLanguage(ctx.userId, workspaceId) });

  await track(ctx.userId, 'capture.created', { source: 'manual', proposals: processed.proposal_count });
  return NextResponse.json({ capture: processed }, { status: 201 });
});
