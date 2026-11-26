/**
 * app/api/capture/share/route.ts
 *
 * POST  The installed app's share target. Sharing a link, a note or some
 *       selected text to Forge from any app on the phone lands here as a
 *       form post (see public/manifest.json), becomes a capture, and opens
 *       the capture screen.
 *
 * A shared link is fetched and its readable text captured with it, through
 * the same private-network guard as every other user-supplied URL.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { createCapture, processCapture } from '@/lib/forge/capture/ingest';
import { getActiveWorkspace, canWrite } from '@/lib/forge/data/workspace';
import { track } from '@/lib/forge/events';
import { HttpError, requireUser } from '@/lib/forge/http';
import { fetchPublicText } from '@/lib/forge/net';
import { brandLanguage } from '@/lib/forge/profile';
import { observed } from '@/lib/ops/observe';

function readable(html: string): { title: string; text: string } {
  const $ = cheerio.load(html);
  $('script, style, nav, header, footer, aside, form, noscript').remove();
  const title = $('meta[property="og:title"]').attr('content') ?? $('title').first().text() ?? '';
  const root = $('article').first().length ? $('article').first() : $('main').first().length ? $('main').first() : $('body');
  const text = root
    .find('h1, h2, h3, p, li, blockquote')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((line) => line.length > 0)
    .join('\n\n');
  return { title: title.trim().slice(0, 200), text: text.slice(0, 40_000) };
}

async function handlePOST(req: Request) {
  const origin = new URL(req.url).origin;
  let ctx;
  try {
    ctx = await requireUser(req);
  } catch {
    return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent('/capture')}`, 303);
  }

  try {
    const form = await req.formData();
    const title = String(form.get('title') ?? '').trim().slice(0, 200);
    const text = String(form.get('text') ?? '').trim().slice(0, 20_000);
    const sharedUrl = String(form.get('url') ?? '').trim() || text.match(/https?:\/\/\S+/)?.[0] || '';

    const workspace = await getActiveWorkspace(ctx.db, ctx.userId);
    if (workspace && !canWrite(workspace.role)) throw new HttpError(403, 'read-only');

    let pageText = '';
    let pageTitle = '';
    if (sharedUrl) {
      try {
        const page = await fetchPublicText(sharedUrl, { maxBytes: 3_000_000, accept: 'text/html' });
        if (page.contentType.includes('html')) ({ title: pageTitle, text: pageText } = readable(page.text));
      } catch {
        // The link is still captured, just without its page text.
      }
    }

    const raw = [text, sharedUrl && !text.includes(sharedUrl) ? sharedUrl : '', pageText ? `From the page:\n${pageText}` : ''].filter(Boolean).join('\n\n');
    if (raw.length < 3) return NextResponse.redirect(`${origin}/capture?shared=empty`, 303);

    const capture = await createCapture(ctx.db, ctx.userId, workspace?.id ?? null, {
      source: 'share',
      title: title || pageTitle || null,
      rawText: raw,
      metadata: sharedUrl ? { url: sharedUrl } : {},
    });
    if (capture) {
      await processCapture(ctx.db, capture, { language: await brandLanguage(ctx.userId, workspace?.id ?? null) });
      await track(ctx.userId, 'capture.created', { source: 'share' });
    }
    return NextResponse.redirect(`${origin}/capture?shared=1`, 303);
  } catch (error) {
    if (!(error instanceof HttpError)) console.error('[api/capture/share]', error);
    return NextResponse.redirect(`${origin}/capture?shared=failed`, 303);
  }
}

export const POST = observed('api/capture/share', handlePOST);
