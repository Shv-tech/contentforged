/**
 * app/api/v1/grade/route.ts
 *
 * POST { text, platform? }  grade an opening the way the app does. Uses the
 *      plan's allowance; needs the "generate" scope.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJson, route } from '@/lib/forge/http';
import { apiCaller, grade } from '@/lib/forge/public-api';
import { DRAFT_PLATFORMS } from '@/lib/forge/types';

const Schema = z.object({
  text: z.string().min(1).max(4000),
  platform: z.enum(DRAFT_PLATFORMS).optional(),
});

export const POST = route('api/v1/grade', async (req: Request) => {
  const input = await parseJson(req, Schema);
  const caller = await apiCaller(req);
  return NextResponse.json({ grade: await grade(caller, input.text, input.platform) });
});
