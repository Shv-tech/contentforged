/**
 * app/api/longform/compile/route.ts
 *
 * POST { plan }  write the book chapter by chapter and save it to My Ebooks.
 *      Uses one ebook credit. Streams newline-delimited JSON events:
 *        { type: "start", title, chapters }
 *        { type: "chapter", index, title, content, words }
 *        { type: "done", ebookId, words }
 *        { type: "error", message, index? }
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { consumeEbookCredit } from '@/lib/billing/metering';
import { brandRequest } from '@/lib/forge/brand-request';
import { HttpError, parseJson, route } from '@/lib/forge/http';
import { BOOK_KINDS, compileBook, type BookKind } from '@/lib/forge/longform';

const Schema = z.object({
  plan: z.object({
    title: z.string().trim().min(1).max(140),
    subtitle: z.string().trim().max(240).default(''),
    kind: z.enum(['guide', 'book', 'playbook']),
    chapters: z
      .array(z.object({ title: z.string().trim().min(1).max(120), purpose: z.string().trim().max(300).default(''), refs: z.array(z.string().regex(/^[dsr]:[0-9a-f-]{36}$/)).min(1).max(12) }))
      .min(1)
      .max(12),
  }),
});

export const POST = route('api/longform/compile', async (req: Request) => {
  const input = await parseJson(req, Schema);
  const { ctx, workspace } = await brandRequest(req, { feature: 'longform' });
  const kind = input.plan.kind as BookKind;
  if (input.plan.chapters.length > BOOK_KINDS[kind].chapters[1]) throw new HttpError(400, `A ${BOOK_KINDS[kind].label.toLowerCase()} has at most ${BOOK_KINDS[kind].chapters[1]} chapters.`);

  const credit = await consumeEbookCredit(ctx.userId);
  if (!credit.allowed) {
    throw new HttpError(429, credit.allowance === 0 ? 'Books are not included on your plan.' : `You have used all ${credit.allowance} books for this month.`, { upgradeRequired: true });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of compileBook({ db: ctx.db, userId: ctx.userId, workspace, plan: { ...input.plan, kind }, signal: req.signal })) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (error) {
        console.error('[api/longform/compile]', error);
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'error', message: 'The book could not be finished. Chapters written so far were not saved.' })}\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
});
