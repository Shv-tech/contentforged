/**
 * app/api/ideas/route.ts
 *
 * GET   the idea queue for the active brand, best first
 * POST  { angle, platform? }  add an idea by hand
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { brandRequest } from '@/lib/forge/brand-request';
import { HttpError, parseJson, route } from '@/lib/forge/http';
import { createIdea, effectiveScore, listIdeas, type IdeaStatus } from '@/lib/forge/ideas';
import { DRAFT_PLATFORMS } from '@/lib/forge/types';

export const GET = route('api/ideas:get', async (req: Request) => {
  const { ctx, workspaceId } = await brandRequest(req);
  const status = (new URL(req.url).searchParams.get('status') ?? 'open') as IdeaStatus;
  if (!['open', 'planned', 'drafted', 'dismissed'].includes(status)) throw new HttpError(400, 'Unknown status.');
  const ideas = await listIdeas(ctx.db, ctx.userId, workspaceId, status, 80);
  return NextResponse.json({ ideas: ideas.map((idea) => ({ ...idea, effective_score: Math.round(effectiveScore(idea) * 100) / 100 })) });
});

const CreateSchema = z.object({
  angle: z.string().trim().min(3).max(500),
  platform: z.enum(DRAFT_PLATFORMS).nullish(),
});

export const POST = route('api/ideas:post', async (req: Request) => {
  const input = await parseJson(req, CreateSchema);
  const { ctx, workspaceId } = await brandRequest(req, { write: true });
  const idea = await createIdea(ctx.db, ctx.userId, workspaceId, { source: 'manual', angle: input.angle, platform: input.platform ?? null });
  return NextResponse.json({ idea }, { status: 201 });
});
