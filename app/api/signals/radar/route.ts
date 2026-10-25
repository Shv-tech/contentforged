/**
 * app/api/signals/radar/route.ts
 *
 * POST { niche? }  Reply Radar: rising posts in the niche from the last few
 *                  hours, each with three reply drafts in the user's voice.
 *
 * Nothing is ever posted from here. The client opens X's reply composer with
 * a draft filled in and the user presses Reply. Automated replies break X's
 * automation rules and get accounts restricted.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadBrandVoice } from '@/lib/forge/brand-voice';
import { getActiveWorkspace } from '@/lib/forge/data/workspace';
import { HttpError, parseJson, requireUser, route } from '@/lib/forge/http';
import { consumeLimit } from '@/lib/forge/limits';
import { estimateTokens, metered } from '@/lib/forge/metered';
import { requireFeature } from '@/lib/forge/plan';
import { xConfigured, XApiError } from '@/lib/x/client';
import { draftReplies, findReplyTargets } from '@/lib/x/radar';

const SCANS_PER_DAY = 12;

const BodySchema = z.object({ niche: z.string().trim().max(80).optional() });

export const POST = route('api/signals/radar', async (req: Request) => {
  const ctx = await requireUser(req);
  await requireFeature(ctx.userId, 'reply_radar');
  if (!xConfigured()) throw new HttpError(503, 'X data is not available on this server yet.');

  const input = await parseJson(req, BodySchema);
  const { data: profile } = await ctx.db.from('profiles').select('niche, x_handle').eq('id', ctx.userId).maybeSingle();
  const niche = input.niche || ((profile?.niche as string | null) ?? '');
  if (niche.length < 2) throw new HttpError(400, 'Set your niche first, under Brand, Settings.');

  const limit = await consumeLimit(`radar:${ctx.userId}`, SCANS_PER_DAY, 86_400);
  if (!limit.allowed) throw new HttpError(429, 'That is enough scans for today. Rising posts change every few hours.');

  try {
    const targets = await findReplyTargets(niche, { excludeUsername: (profile?.x_handle as string | null) ?? null });
    if (targets.length === 0) return NextResponse.json({ targets: [], niche });

    const workspace = await getActiveWorkspace(ctx.db, ctx.userId);
    const voice = await loadBrandVoice(ctx.db, ctx.userId, workspace?.id ?? null, niche);
    const drafted = await metered(
      {
        userId: ctx.userId,
        route: 'signals/radar',
        maxOutputTokens: 1800,
        estimatedInputTokens: estimateTokens(voice.stories, voice.promptBlock ?? '', ...targets.map((t) => t.text)) + 600,
      },
      async () => {
        const result = await draftReplies(targets, voice);
        return { value: result.targets, usage: result.usage };
      }
    );
    return NextResponse.json({ targets: drafted, niche });
  } catch (error) {
    if (error instanceof XApiError) throw new HttpError(502, error.message);
    throw error;
  }
});
