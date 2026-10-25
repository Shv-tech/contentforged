/**
 * app/api/drafts/[id]/link/route.ts
 *
 * GET   the draft's tracked links and their clicks
 * POST  { destination }  a tracked short link for this draft, to paste in
 *       the post instead of the raw URL
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { appUrl } from '@/lib/forge/app-url';
import { loadDraftFor } from '@/lib/forge/data/drafts';
import { createShortLink, linksForDraft } from '@/lib/forge/goals';
import { HttpError, isUuid, parseJson, requireUser, route } from '@/lib/forge/http';
import { requireBrandFeature } from '@/lib/forge/plan';

type Params = { params: { id: string } };

export const GET = route('api/drafts/[id]/link:get', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Draft not found.');
  const ctx = await requireUser(req);
  const { draft } = await loadDraftFor(ctx, params.id, 'read');
  const links = await linksForDraft(ctx.db, draft.id);
  return NextResponse.json({ links: links.map((link) => ({ ...link, url: `${appUrl(req)}/l/${link.code}` })) });
});

export const POST = route('api/drafts/[id]/link:post', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Draft not found.');
  const { destination } = await parseJson(req, z.object({ destination: z.string().trim().min(8).max(2000) }));
  const ctx = await requireUser(req);
  const { draft } = await loadDraftFor(ctx, params.id, 'write');
  await requireBrandFeature(ctx.userId, draft.workspace_id, 'goals');
  const link = await createShortLink(ctx.db, ctx.userId, draft.workspace_id, draft.id, destination);
  return NextResponse.json({ link: { ...link, url: `${appUrl(req)}/l/${link.code}` } }, { status: 201 });
});
