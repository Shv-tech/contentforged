/**
 * app/api/longform/material/route.ts
 *
 * GET ?topic=  the posts, stories and sources a book on this topic could be
 *     built from, best first, for the author to pick from.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { brandRequest } from '@/lib/forge/brand-request';
import { route } from '@/lib/forge/http';
import { gatherMaterial } from '@/lib/forge/longform';

export const GET = route('api/longform/material', async (req: Request) => {
  const { ctx, workspaceId } = await brandRequest(req, { feature: 'longform' });
  const topic = (new URL(req.url).searchParams.get('topic') ?? '').slice(0, 200);
  const material = await gatherMaterial(ctx.db, ctx.userId, workspaceId, { topic });
  return NextResponse.json({
    material: material.map((m) => ({ ref: m.ref, kind: m.kind, title: m.title, preview: m.text.slice(0, 280), relative: m.relative, words: m.text.split(/\s+/).length })),
  });
});
