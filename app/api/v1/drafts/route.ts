/**
 * app/api/v1/drafts/route.ts
 *
 * GET   ?status=draft|scheduled|posted&limit=20  the brand's drafts, newest first
 * POST  { angle, platform, kind?, save? }  write a post in the brand's voice.
 *       With save (the default) it lands in the drafts list for review; it
 *       is never posted. Needs "generate", and "write" to save.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJson, route } from '@/lib/forge/http';
import { apiCaller, draftPost, drafts } from '@/lib/forge/public-api';
import { DRAFT_PLATFORMS } from '@/lib/forge/types';

export const GET = route('api/v1/drafts:get', async (req: Request) => {
  const caller = await apiCaller(req);
  const params = new URL(req.url).searchParams;
  const limit = Number.parseInt(params.get('limit') ?? '20', 10);
  return NextResponse.json({ drafts: await drafts(caller, params.get('status'), Number.isFinite(limit) ? limit : 20) });
});

const CreateSchema = z.object({
  angle: z.string().trim().min(3).max(2000),
  platform: z.enum(DRAFT_PLATFORMS),
  kind: z.enum(['post', 'thread', 'carousel']).optional(),
  save: z.boolean().optional(),
});

export const POST = route('api/v1/drafts:post', async (req: Request) => {
  const input = await parseJson(req, CreateSchema);
  const caller = await apiCaller(req);
  const result = await draftPost(caller, input);
  return NextResponse.json(result, { status: result.saved ? 201 : 200 });
});
