/**
 * app/api/stories/route.ts
 *
 * GET   the Story Bank (?q= filters by topic)
 * POST  add a story by hand
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createStory, listStories, searchStories, STORY_KINDS } from '@/lib/forge/data/stories';
import { getActiveWorkspace, requireWrite } from '@/lib/forge/data/workspace';
import { parseJson, requireUser, route } from '@/lib/forge/http';

export const GET = route('api/stories:get', async (req: Request) => {
  const ctx = await requireUser(req);
  const workspace = await getActiveWorkspace(ctx.db, ctx.userId);
  const q = new URL(req.url).searchParams.get('q')?.trim();
  const stories = q ? await searchStories(ctx.db, ctx.userId, workspace?.id ?? null, q, 20) : await listStories(ctx.db, ctx.userId, workspace?.id ?? null);
  return NextResponse.json({ stories });
});

const CreateSchema = z.object({
  kind: z.enum(STORY_KINDS as [string, ...string[]]).default('story'),
  title: z.string().trim().min(1).max(140),
  body: z.string().trim().min(1).max(4000),
  occurred_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  tags: z.array(z.string().max(32)).max(8).default([]),
});

export const POST = route('api/stories:post', async (req: Request) => {
  const ctx = await requireUser(req);
  const input = await parseJson(req, CreateSchema);
  const workspace = await getActiveWorkspace(ctx.db, ctx.userId);
  requireWrite(workspace);
  const story = await createStory(ctx.db, ctx.userId, workspace?.id ?? null, {
    kind: input.kind as (typeof STORY_KINDS)[number],
    title: input.title,
    body: input.body,
    occurred_on: input.occurred_on ?? null,
    tags: input.tags,
    source: 'manual',
  });
  return NextResponse.json({ story }, { status: 201 });
});
