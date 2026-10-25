/**
 * app/api/drafts/[id]/visual/route.ts
 *
 * GET   ?slide=N        one slide as PNG
 *       ?format=pdf     every slide as one PDF (a LinkedIn document post)
 *       ?format=json    the layout, its slides and whether any still hold a
 *                       [bracket] waiting for a fact
 * POST  { layout, aspect, slides? }  change the layout, or edit slide text
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadDraftFor, updateDraft } from '@/lib/forge/data/drafts';
import { track } from '@/lib/forge/events';
import { HttpError, isUuid, parseJson, requireUser, route } from '@/lib/forge/http';
import { requireBrandFeature } from '@/lib/forge/plan';
import { slug } from '@/lib/forge/text';
import { renderDraftPdf, renderDraftSlide, visualOf } from '@/lib/forge/visuals';
import { deriveSlides, hasPlaceholders, MAX_SLIDES } from '@/lib/forge/visuals/layouts';
import type { DraftVisual } from '@/lib/forge/types';

type Params = { params: { id: string } };

async function load(req: Request, id: string, mode: 'read' | 'write') {
  if (!isUuid(id)) throw new HttpError(404, 'Draft not found.');
  const ctx = await requireUser(req);
  const { draft } = await loadDraftFor(ctx, id, mode);
  await requireBrandFeature(ctx.userId, draft.workspace_id, 'visuals');
  return { ctx, draft };
}

export const GET = route('api/drafts/[id]/visual:get', async (req: Request, { params }: Params) => {
  const { ctx, draft } = await load(req, params.id, 'read');
  const url = new URL(req.url);
  const format = url.searchParams.get('format');
  const visual = visualOf(draft);
  const name = slug(draft.title || 'forge-visual');

  if (format === 'json') return NextResponse.json({ visual, placeholders: hasPlaceholders(visual.slides) });

  if (format === 'pdf') {
    const pdf = await renderDraftPdf(ctx.db, draft);
    await track(ctx.userId, 'visual.rendered', { format: 'pdf', slides: visual.slides.length, layout: visual.layout });
    return new Response(Buffer.from(pdf), {
      headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${name}.pdf"`, 'cache-control': 'private, no-store' },
    });
  }

  const slide = Math.max(0, Number(url.searchParams.get('slide') ?? '0') || 0);
  const png = await renderDraftSlide(ctx.db, draft, slide);
  const download = url.searchParams.get('download') === '1';
  return new Response(Buffer.from(png), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'private, no-store',
      ...(download ? { 'content-disposition': `attachment; filename="${name}-${slide + 1}.png"` } : {}),
    },
  });
});

const PostSchema = z.object({
  layout: z.enum(['carousel', 'quote', 'statement', 'list']),
  aspect: z.enum(['square', 'portrait']),
  slides: z.array(z.string().trim().min(1).max(400)).min(1).max(MAX_SLIDES).optional(),
});

export const POST = route('api/drafts/[id]/visual:post', async (req: Request, { params }: Params) => {
  const input = await parseJson(req, PostSchema);
  const { ctx, draft } = await load(req, params.id, 'write');
  const visual: DraftVisual = {
    layout: input.layout,
    aspect: input.aspect,
    slides: input.slides ?? deriveSlides(draft, input.layout),
    updatedAt: new Date().toISOString(),
  };
  const updated = await updateDraft(ctx.db, ctx.userId, draft.id, { visual });
  return NextResponse.json({ draft: updated, placeholders: hasPlaceholders(visual.slides) });
});
