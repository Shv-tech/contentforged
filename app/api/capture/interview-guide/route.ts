/**
 * app/api/capture/interview-guide/route.ts
 *
 * POST { subject?, topic? }  questions to ask in an interview session, aimed
 *      at what the active brand's Story Bank is missing.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { brandRequest } from '@/lib/forge/brand-request';
import { interviewGuide } from '@/lib/forge/capture/interview';
import { parseJson, route } from '@/lib/forge/http';
import { metered } from '@/lib/forge/metered';
import { assembleBrandIdentity } from '@/lib/brand-dna';

const Schema = z.object({
  subject: z.string().trim().max(120).optional(),
  topic: z.string().trim().max(200).optional(),
});

export const POST = route('api/capture/interview-guide', async (req: Request) => {
  const input = await parseJson(req, Schema);
  const { ctx, workspace, workspaceId } = await brandRequest(req, { write: true, feature: 'interviews' });
  const brandDna = workspace ? workspace.brand_dna : await assembleBrandIdentity(ctx.userId).catch(() => null);

  const questions = await metered({ userId: ctx.userId, route: 'capture:interview-guide', maxOutputTokens: 1500, estimatedInputTokens: 2500 }, async () => {
    const result = await interviewGuide({ db: ctx.db, userId: ctx.userId, workspaceId, subject: input.subject ?? null, topic: input.topic ?? null, brandDna });
    return { value: result.questions, usage: result.usage };
  });
  return NextResponse.json({ questions });
});
