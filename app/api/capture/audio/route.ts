/**
 * app/api/capture/audio/route.ts
 *
 * POST { path, source, title?, subject? }  transcribe an uploaded recording,
 * store it as a capture with timestamped segments, and read it for
 * proposals. `source` is 'voice' for a note to self, 'interview' for a
 * recorded conversation (the subject is the person interviewed).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { brandRequest } from '@/lib/forge/brand-request';
import { createCapture, processCapture } from '@/lib/forge/capture/ingest';
import { track } from '@/lib/forge/events';
import { HttpError, parseJson, route } from '@/lib/forge/http';
import { consumeLimit } from '@/lib/forge/limits';
import { brandLanguage } from '@/lib/forge/profile';
import { assertOwnedPath, downloadObject, removeObjects } from '@/lib/forge/storage';
import { formatTimestamp, transcribe } from '@/lib/forge/transcribe';

const BodySchema = z.object({
  path: z.string().min(10).max(300),
  source: z.enum(['voice', 'interview']),
  title: z.string().trim().max(200).optional(),
  subject: z.string().trim().max(120).optional(),
});

const DAILY_TRANSCRIPTIONS = 40;

export const POST = route('api/capture/audio', async (req: Request) => {
  const input = await parseJson(req, BodySchema);
  const { ctx, workspaceId } = await brandRequest(req, { write: true, feature: input.source === 'interview' ? 'interviews' : 'capture' });
  assertOwnedPath(ctx.userId, input.path);

  const limit = await consumeLimit(`transcribe:${ctx.userId}`, DAILY_TRANSCRIPTIONS, 86_400);
  if (!limit.allowed) throw new HttpError(429, `You can transcribe up to ${DAILY_TRANSCRIPTIONS} recordings a day. This one is saved; try again tomorrow.`);

  const { bytes, contentType } = await downloadObject('captures', input.path);
  if (bytes.byteLength < 2000) {
    await removeObjects('captures', [input.path]);
    throw new HttpError(400, 'That recording is empty. Try again, a little closer to the microphone.');
  }

  const language = await brandLanguage(ctx.userId, workspaceId);
  const transcript = await transcribe(bytes, { filename: input.path.split('/').pop() ?? 'recording.webm', contentType, language });
  if (transcript.text.length < 4) throw new HttpError(422, 'No speech was found in that recording.');

  const capture = await createCapture(ctx.db, ctx.userId, workspaceId, {
    source: input.source,
    title: input.title ?? (input.source === 'interview' && input.subject ? `Interview with ${input.subject}` : null),
    rawText: transcript.text,
    segments: transcript.segments,
    audioPath: input.path,
    durationSeconds: transcript.durationSeconds,
    metadata: { subject: input.subject ?? null, language: transcript.language, length: transcript.durationSeconds ? formatTimestamp(transcript.durationSeconds) : null },
  });
  if (!capture) throw new HttpError(409, 'That recording was already captured.');

  const processed = await processCapture(ctx.db, capture, { language, subject: input.subject ?? null });
  await track(ctx.userId, 'capture.created', { source: input.source, seconds: Math.round(transcript.durationSeconds ?? 0), proposals: processed.proposal_count });
  return NextResponse.json({ capture: processed }, { status: 201 });
});
