/**
 * app/api/signals/pulse/route.ts
 *
 * GET ?niche=  what the niche is talking about on X in the last 48 hours,
 *              grouped into topics with an angle for each. Defaults to the
 *              niche saved on the profile.
 *
 * Shared cache per niche (three hours), so popular niches cost one search
 * no matter how many people look.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { HttpError, requireUser, route } from '@/lib/forge/http';
import { consumeLimit } from '@/lib/forge/limits';
import { requireFeature } from '@/lib/forge/plan';
import { xConfigured, XApiError } from '@/lib/x/client';
import { runNichePulse } from '@/lib/x/pulse';

const PULSES_PER_DAY = 20;

export const GET = route('api/signals/pulse', async (req: Request) => {
  const ctx = await requireUser(req);
  await requireFeature(ctx.userId, 'niche_pulse');
  if (!xConfigured()) throw new HttpError(503, 'X data is not available on this server yet.');

  let niche = new URL(req.url).searchParams.get('niche')?.trim() ?? '';
  if (!niche) {
    const { data } = await ctx.db.from('profiles').select('niche').eq('id', ctx.userId).maybeSingle();
    niche = (data?.niche as string | null) ?? '';
  }
  if (niche.length < 2) throw new HttpError(400, 'Set your niche first, under Brand, Settings.');

  const limit = await consumeLimit(`pulse:${ctx.userId}`, PULSES_PER_DAY, 86_400);
  if (!limit.allowed) throw new HttpError(429, 'That is enough pulse checks for today. The topics refresh every few hours.');

  try {
    const { pulse, cacheHit } = await runNichePulse(niche);
    return NextResponse.json({ pulse, cached: cacheHit });
  } catch (error) {
    if (error instanceof XApiError) throw new HttpError(502, error.message);
    throw error;
  }
});
