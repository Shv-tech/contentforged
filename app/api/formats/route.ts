/**
 * app/api/formats/route.ts
 *
 * GET   ?sort=popular|new|proven|mine&platform=&q=  the shared formats gallery
 * POST  { title, summary?, platform?, structure, example?, sourceDraftId?, visibility? }
 *       publish a format. The example is the author's own post and is only
 *       included when they choose to share it.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadDraftFor } from '@/lib/forge/data/drafts';
import { track } from '@/lib/forge/events';
import { listGallery, MAX_SLOTS, MIN_SLOTS, publishFormat, type GalleryQuery } from '@/lib/forge/formats';
import { isUuid, parseJson, requireUser, route } from '@/lib/forge/http';
import { requireFeature } from '@/lib/forge/plan';
import { DRAFT_PLATFORMS, isDraftPlatform } from '@/lib/forge/types';

const SORTS = ['popular', 'new', 'proven', 'mine'] as const;

export const GET = route('api/formats:get', async (req: Request) => {
  const ctx = await requireUser(req);
  const params = new URL(req.url).searchParams;
  const sort = (SORTS as readonly string[]).includes(params.get('sort') ?? '') ? (params.get('sort') as GalleryQuery['sort']) : 'popular';
  const platform = params.get('platform');
  const formats = await listGallery(ctx.db, ctx.userId, { sort, platform: isDraftPlatform(platform) ? platform : null, search: params.get('q') });
  return NextResponse.json({ formats });
});

const PublishSchema = z.object({
  title: z.string().trim().min(3).max(80),
  summary: z.string().trim().max(300).nullish(),
  platform: z.enum(DRAFT_PLATFORMS).nullish(),
  structure: z
    .array(z.object({ label: z.string().trim().min(1).max(60), guidance: z.string().trim().min(1).max(280) }))
    .min(MIN_SLOTS)
    .max(MAX_SLOTS),
  example: z.string().trim().max(3000).nullish(),
  sourceDraftId: z.string().uuid().nullish(),
  visibility: z.enum(['public', 'unlisted']).default('public'),
});

export const POST = route('api/formats:post', async (req: Request) => {
  const input = await parseJson(req, PublishSchema);
  const ctx = await requireUser(req);
  await requireFeature(ctx.userId, 'formats');
  // The source draft must be one the author can change: you share structures from your own work.
  if (input.sourceDraftId && isUuid(input.sourceDraftId)) await loadDraftFor(ctx, input.sourceDraftId, 'write');

  const format = await publishFormat(ctx.userId, {
    title: input.title,
    summary: input.summary ?? null,
    platform: input.platform ?? null,
    structure: input.structure,
    example: input.example ?? null,
    sourceDraftId: input.sourceDraftId ?? null,
    visibility: input.visibility,
  });
  void track(ctx.userId, 'format.published', { slots: format.structure.length, visibility: format.visibility, example: Boolean(format.example) });
  return NextResponse.json({ format }, { status: 201 });
});
