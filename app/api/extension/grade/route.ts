/**
 * app/api/extension/grade/route.ts
 *
 * POST { text, platform? }  grade what the user is writing in X or
 * LinkedIn, from the browser extension. Same grader and the same quota as
 * the app, calibrated to the user's own results when there are enough.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { calibrationNote } from '@/lib/forge/calibration';
import { acceptedRules, bannedPhrasesFrom } from '@/lib/forge/data/rules';
import { getFingerprint } from '@/lib/forge/data/voice';
import { DRIFT_LABELS, scoreVoice } from '@/lib/forge/voice';
import { getActiveWorkspace } from '@/lib/forge/data/workspace';
import { gradeOpening } from '@/lib/forge/grader';
import { parseJson, requireUser, route } from '@/lib/forge/http';
import { estimateTokens, metered } from '@/lib/forge/metered';
import { requireFeature } from '@/lib/forge/plan';
import { DRAFT_PLATFORMS } from '@/lib/forge/types';

const BodySchema = z.object({
  text: z.string().trim().min(3).max(4000),
  platform: z.enum(DRAFT_PLATFORMS).optional(),
});

export const POST = route('api/extension/grade', async (req: Request) => {
  const ctx = await requireUser(req);
  await requireFeature(ctx.userId, 'extension');
  const input = await parseJson(req, BodySchema);
  const workspace = await getActiveWorkspace(ctx.db, ctx.userId);
  const calibration = await calibrationNote(ctx.db, ctx.userId, workspace?.id ?? null).catch(() => null);

  const grade = await metered(
    { userId: ctx.userId, route: 'extension/grade', maxOutputTokens: 700, estimatedInputTokens: estimateTokens(input.text) + 1500 },
    async () => {
      const result = await gradeOpening({ text: input.text, platform: input.platform, calibration: calibration ?? undefined });
      return { value: result.grade, usage: result.usage };
    }
  );
  // Voice match alongside the grade, so the extension shows both without
  // shipping the fingerprint code to the page.
  const [fingerprint, rules] = await Promise.all([
    getFingerprint(ctx.db, ctx.userId, workspace?.id ?? null),
    acceptedRules(ctx.db, ctx.userId, workspace?.id ?? null).catch(() => []),
  ]);
  const voice = scoreVoice(input.text, fingerprint?.profile ?? null, bannedPhrasesFrom(rules));

  return NextResponse.json({
    grade,
    voice: {
      score: voice.score,
      drift: voice.drift.slice(0, 5).map((d) => ({ line: d.line, reasons: d.reasons.map((r) => DRIFT_LABELS[r]), detail: d.detail })),
      slop: voice.slop.slice(0, 5).map((hit) => ({ match: hit.match, reason: hit.reason })),
    },
  });
});
