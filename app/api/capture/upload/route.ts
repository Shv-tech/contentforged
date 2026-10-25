/**
 * app/api/capture/upload/route.ts
 *
 * POST { contentType, size, purpose }  a signed URL to upload a recording
 * straight to private storage. The browser uploads there, then calls
 * /api/capture/audio with the returned path.
 *
 * Recordings bypass this server on the way in because serverless request
 * bodies are capped at a few megabytes.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { brandRequest } from '@/lib/forge/brand-request';
import { HttpError, parseJson, route } from '@/lib/forge/http';
import { AUDIO_TYPES, baseMediaType, MAX_BYTES, newObjectPath, signedUploadUrl } from '@/lib/forge/storage';

const BodySchema = z.object({
  contentType: z.string().max(100),
  size: z.number().int().positive(),
  purpose: z.enum(['voice', 'interview']),
});

export const POST = route('api/capture/upload', async (req: Request) => {
  const input = await parseJson(req, BodySchema);
  const { ctx } = await brandRequest(req, { write: true, feature: input.purpose === 'interview' ? 'interviews' : 'capture' });

  const type = baseMediaType(input.contentType);
  const extension = AUDIO_TYPES[type];
  if (!extension) throw new HttpError(415, 'Use an audio file: WebM, MP4, M4A, MP3, OGG or WAV.');
  if (input.size > MAX_BYTES.captures) throw new HttpError(413, 'Recordings can be up to 25 MB. Export a compressed copy (M4A or MP3) and try again.');

  const upload = await signedUploadUrl('captures', newObjectPath(ctx.userId, input.purpose, extension));
  return NextResponse.json(upload);
});
