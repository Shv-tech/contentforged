/**
 * app/api/formats/[id]/apply/route.ts
 *
 * POST { angle, platform? }  write a draft for the active brand that follows
 *      this format slot by slot, using only the brand's own Story Bank.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { brandRequest } from '@/lib/forge/brand-request';
import { track } from '@/lib/forge/events';
import { applyFormat, getFormat } from '@/lib/forge/formats';
import { HttpError, isUuid, parseJson, route } from '@/lib/forge/http';
import { DRAFT_PLATFORMS } from '@/lib/forge/types';

const Schema = z.object({
  angle: z.string().trim().min(3).max(1000),
  platform: z.enum(DRAFT_PLATFORMS).optional(),
});

export const POST = route('api/formats/[id]/apply', async (req: Request, { params }: { params: { id: string } }) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Format not found.');
  const input = await parseJson(req, Schema);
  const { ctx, workspace } = await brandRequest(req, { write: true, feature: 'formats' });
  const format = await getFormat(ctx.db, ctx.userId, params.id);
  if (!format) throw new HttpError(404, 'Format not found.');

  const platform = input.platform ?? format.platform ?? 'linkedin';
  const result = await applyFormat({ db: ctx.db, userId: ctx.userId, workspace, format, angle: input.angle, platform });
  void track(ctx.userId, 'format.applied', { platform, own: format.mine });
  return NextResponse.json(result, { status: 201 });
});
