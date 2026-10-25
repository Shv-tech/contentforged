/**
 * app/api/capture/proposals/[id]/route.ts
 *
 * POST { action: 'keep' | 'discard', edits? }
 *
 * Keeping a proposal adds it to the Story Bank, with the quote and capture
 * it came from, so the person can always see where a fact was said.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { brandRequest } from '@/lib/forge/brand-request';
import type { CaptureSource } from '@/lib/forge/capture/extract';
import { decideProposal, PROPOSAL_COLUMNS, type ProposalRecord } from '@/lib/forge/capture/ingest';
import { STORY_KINDS } from '@/lib/forge/data/stories';
import { scopeRows } from '@/lib/forge/data/workspace';
import { track } from '@/lib/forge/events';
import { HttpError, isUuid, parseJson, route } from '@/lib/forge/http';
import type { StoryKind } from '@/lib/forge/types';

type Params = { params: { id: string } };

const BodySchema = z.object({
  action: z.enum(['keep', 'discard']),
  edits: z
    .object({
      title: z.string().trim().min(1).max(140).optional(),
      body: z.string().trim().min(1).max(4000).optional(),
      kind: z.enum(STORY_KINDS as [StoryKind, ...StoryKind[]]).optional(),
    })
    .optional(),
});

export const POST = route('api/capture/proposals/[id]', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Proposal not found.');
  const input = await parseJson(req, BodySchema);
  const { ctx, workspaceId } = await brandRequest(req, { write: true });

  const query = ctx.db.from('story_proposals').select(PROPOSAL_COLUMNS).eq('id', params.id);
  const { data } = await scopeRows(query, ctx.userId, workspaceId).maybeSingle();
  if (!data) throw new HttpError(404, 'Proposal not found.');
  const proposal = data as ProposalRecord;

  const { data: capture } = await ctx.db.from('captures').select('source').eq('id', proposal.capture_id).maybeSingle();
  const result = await decideProposal(ctx.db, ctx.userId, proposal, input, (capture?.source as CaptureSource) ?? 'manual');

  await track(ctx.userId, input.action === 'keep' ? 'proposal.kept' : 'proposal.discarded', { edited: Boolean(input.edits), kind: proposal.kind });
  return NextResponse.json(result);
});
