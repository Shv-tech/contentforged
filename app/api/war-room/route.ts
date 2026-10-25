/**
 * app/api/war-room/route.ts
 *
 * POST { brief }  runs the War Room (lib/forge/war-room.ts) and streams its
 * progress as NDJSON: each role starting and finishing, the strategy and
 * critique notes, research sources, and each finished draft.
 *
 * Pro and above. One quota reservation covers the whole run, sized for every
 * call it can make, and is settled with the measured total.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { z } from 'zod';
import { FORGE_MODEL, AnthropicError } from '@/lib/ai/anthropic';
import { denialMessage, reserveQuota, settleQuota, snapshotFrom } from '@/lib/billing/metering';
import { EMPTY_USAGE, type TokenUsage } from '@/lib/billing/plans';
import { getActiveWorkspace, requireWrite } from '@/lib/forge/data/workspace';
import { friendlyProviderError } from '@/lib/forge/errors';
import { HttpError, parseJson, requireUser, route } from '@/lib/forge/http';
import { estimateTokens } from '@/lib/forge/metered';
import { requireFeature } from '@/lib/forge/plan';
import { runWarRoom, WAR_ROOM_MAX_OUTPUT_TOKENS, type WarRoomEvent } from '@/lib/forge/war-room';
import { NextResponse } from 'next/server';

const BodySchema = z.object({ brief: z.string().trim().min(10, 'Describe the campaign in a sentence or two.').max(4000) });

export const POST = route('api/war-room', async (req: Request) => {
  const ctx = await requireUser(req);
  await requireFeature(ctx.userId, 'war_room');
  const { brief } = await parseJson(req, BodySchema);

  const grant = await reserveQuota({
    userId: ctx.userId,
    model: FORGE_MODEL,
    maxTokens: WAR_ROOM_MAX_OUTPUT_TOKENS,
    estimatedInputTokens: estimateTokens(brief) + 5 * 6000,
  });
  if (!grant.allowed) {
    throw new HttpError(429, denialMessage(grant), { reason: grant.reason, quota: snapshotFrom(grant), upgradeRequired: grant.reason === 'monthly_exceeded' });
  }

  const workspace = await getActiveWorkspace(ctx.db, ctx.userId);
  requireWrite(workspace);
  const { data: profile } = await ctx.db.from('profiles').select('timezone').eq('id', ctx.userId).maybeSingle();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: WarRoomEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      let usage: TokenUsage = EMPTY_USAGE;
      try {
        const result = await runWarRoom({
          db: ctx.db,
          userId: ctx.userId,
          workspace,
          timezone: (profile?.timezone as string | null) ?? 'UTC',
          brief,
          emit,
        });
        usage = result.usage;
      } catch (error) {
        console.error('[api/war-room]', error);
        const message =
          error instanceof AnthropicError ? friendlyProviderError(error) : error instanceof Error ? error.message : 'The War Room stopped unexpectedly.';
        emit({ type: 'error', message });
      } finally {
        await settleQuota({ userId: ctx.userId, grant, model: FORGE_MODEL, usage, route: 'war-room' }).catch((e) =>
          console.error('[api/war-room] settle failed', e)
        );
        controller.close();
      }
    },
  });

  return new NextResponse(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
});
