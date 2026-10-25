/**
 * app/api/repurpose/route.ts
 *
 * GET   recent sources for the active brand, with how many drafts each made
 * POST  { kind, title, url?, body?, targets, ideas }
 *       Turn one long piece into posts across platforms. With a url and no
 *       body, the page is fetched and its readable text used.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { z } from 'zod';
import { brandRequest } from '@/lib/forge/brand-request';
import { scopeRows } from '@/lib/forge/data/workspace';
import { track } from '@/lib/forge/events';
import { HttpError, parseJson, route } from '@/lib/forge/http';
import { fetchPublicText } from '@/lib/forge/net';
import { repurpose } from '@/lib/forge/repurpose';
import { DRAFT_PLATFORMS } from '@/lib/forge/types';

export const GET = route('api/repurpose:get', async (req: Request) => {
  const { ctx, workspaceId } = await brandRequest(req);
  const query = ctx.db.from('repurpose_sources').select('id, kind, title, url, created_at');
  const { data, error } = await scopeRows(query, ctx.userId, workspaceId).order('created_at', { ascending: false }).limit(30);
  if (error) throw new Error(error.message);

  const ids = (data ?? []).map((row: { id: string }) => row.id);
  const { data: drafts } = ids.length ? await ctx.db.from('drafts').select('id, source_id, status').in('source_id', ids) : { data: [] };
  const counts = new Map<string, { total: number; posted: number }>();
  for (const draft of (drafts ?? []) as Array<{ source_id: string; status: string }>) {
    const entry = counts.get(draft.source_id) ?? { total: 0, posted: 0 };
    entry.total += 1;
    if (draft.status === 'posted') entry.posted += 1;
    counts.set(draft.source_id, entry);
  }
  return NextResponse.json({ sources: (data ?? []).map((row: { id: string }) => ({ ...row, drafts: counts.get(row.id) ?? { total: 0, posted: 0 } })) });
});

const BodySchema = z
  .object({
    kind: z.enum(['newsletter', 'podcast', 'video', 'article', 'post', 'notes']),
    title: z.string().trim().min(1).max(200),
    url: z.string().trim().url().max(2000).nullish(),
    body: z.string().max(200_000).nullish(),
    targets: z
      .array(z.object({ platform: z.enum(DRAFT_PLATFORMS), kind: z.enum(['post', 'thread', 'carousel']).default('post') }))
      .min(1)
      .max(6),
    ideas: z.number().int().min(1).max(12).default(6),
  })
  .refine((value) => Boolean(value.body?.trim()) || Boolean(value.url), 'Paste the text, or give a link to it.');

function readableText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, nav, header, footer, aside, form, noscript').remove();
  const root = $('article').first().length ? $('article').first() : $('main').first().length ? $('main').first() : $('body');
  return root
    .find('h1, h2, h3, p, li, blockquote')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)
    .join('\n\n');
}

export const POST = route('api/repurpose:post', async (req: Request) => {
  const input = await parseJson(req, BodySchema);
  const { ctx, workspace } = await brandRequest(req, { write: true, feature: 'repurpose' });

  let body = input.body?.trim() ?? '';
  if (!body && input.url) {
    const page = await fetchPublicText(input.url, { maxBytes: 4_000_000, accept: 'text/html' });
    body = page.contentType.includes('html') ? readableText(page.text) : page.text;
  }
  if (body.length < 300) throw new HttpError(400, 'There is not enough text there to work from. Paste the piece itself.');

  const result = await repurpose({
    db: ctx.db,
    userId: ctx.userId,
    workspace,
    source: { kind: input.kind, title: input.title, url: input.url ?? null, body },
    targets: input.targets,
    ideas: input.ideas,
  });

  await track(ctx.userId, 'repurpose.run', { kind: input.kind, drafts: result.drafts.length, skipped: result.skipped });
  return NextResponse.json(result, { status: 201 });
});
