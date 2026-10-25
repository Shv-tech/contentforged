/**
 * app/api/v1/voice/route.ts
 *
 * GET  the brand's measured voice: traits, language, and a block of
 *      instructions any model can follow to write toward it.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { route } from '@/lib/forge/http';
import { apiCaller, voice } from '@/lib/forge/public-api';

export const GET = route('api/v1/voice', async (req: Request) => {
  const caller = await apiCaller(req);
  return NextResponse.json(await voice(caller));
});
