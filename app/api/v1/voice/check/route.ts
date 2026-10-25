/**
 * app/api/v1/voice/check/route.ts
 *
 * POST { text }  score text against the brand's measured voice. Returns the
 *      score, the lines that drift and why, and machine-sounding phrases.
 *      Pure measurement: no model call, no allowance used.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJson, route } from '@/lib/forge/http';
import { apiCaller, checkVoice } from '@/lib/forge/public-api';

const Schema = z.object({ text: z.string().min(1).max(20_000) });

export const POST = route('api/v1/voice/check', async (req: Request) => {
  const input = await parseJson(req, Schema);
  const caller = await apiCaller(req);
  return NextResponse.json(await checkVoice(caller, input.text));
});
