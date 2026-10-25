/**
 * app/api/public/grade-hook/route.ts
 *
 * Public, no-login grader behind the landing page's "Paste a hook" section.
 *
 *   POST { hook: string }
 *   200  { score, verdict, weakest, rewrite, breakdown[], cardId }
 *   429  the visitor has used their free grades for the hour
 *
 * Uses the same grader as the app (lib/forge/grader.ts), so a score on the
 * landing page means exactly what it means inside Forge. Each result is
 * stored as a shareable grade card (cardId), which is how "my hook scored
 * 44/50" posts link back here.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { gradeOpening } from '@/lib/forge/grader';
import { clientIp, parseJson, route } from '@/lib/forge/http';
import { consumeLimit } from '@/lib/forge/limits';
import { hashRequester } from '@/lib/forge/crypto';
import { VERDICT_LABELS } from '@/lib/forge/types';
import { createServiceClient } from '@/lib/supabase/service';

const FREE_GRADES_PER_HOUR = 5;

const BodySchema = z.object({
  hook: z.string().trim().min(3, 'Paste a line of at least a few words.').max(600),
});

export const POST = route('api/public/grade-hook', async (req: Request) => {
  const limit = await consumeLimit(`grade:${hashRequester(clientIp(req))}`, FREE_GRADES_PER_HOUR, 3600);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'You have used your free grades for this hour. Sign up to keep grading.', resetSeconds: limit.resetSeconds },
      { status: 429 }
    );
  }

  const { hook } = await parseJson(req, BodySchema);
  const { grade } = await gradeOpening({ text: hook });

  const { data: card } = await createServiceClient()
    .from('grade_cards')
    .insert({
      hook,
      score: grade.score,
      verdict: VERDICT_LABELS[grade.verdict],
      breakdown: grade.dimensions,
    })
    .select('id')
    .single();

  return NextResponse.json({
    score: grade.score,
    verdict: VERDICT_LABELS[grade.verdict],
    weakest: grade.weakest || undefined,
    rewrite: grade.rewrite ?? undefined,
    breakdown: grade.dimensions.map((d) => ({ label: d.label, score: d.score })),
    cardId: card?.id ?? null,
    remaining: limit.remaining,
  });
});
