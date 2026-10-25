/**
 * app/api/v1/stories/route.ts
 *
 * GET   ?q=pricing&limit=20  search the Story Bank, or list it without q
 * POST  { kind?, title, body, occurred_on? }  save a true story. Needs "write".
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJson, route } from '@/lib/forge/http';
import { apiCaller, saveStory, stories } from '@/lib/forge/public-api';

export const GET = route('api/v1/stories:get', async (req: Request) => {
  const caller = await apiCaller(req);
  const params = new URL(req.url).searchParams;
  const limit = Number.parseInt(params.get('limit') ?? '20', 10);
  return NextResponse.json({ stories: await stories(caller, params.get('q'), Number.isFinite(limit) && limit > 0 ? limit : 20) });
});

const CreateSchema = z.object({
  kind: z.string().max(20).optional(),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(8000),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

export const POST = route('api/v1/stories:post', async (req: Request) => {
  const input = await parseJson(req, CreateSchema);
  const caller = await apiCaller(req);
  return NextResponse.json({ story: await saveStory(caller, input) }, { status: 201 });
});
