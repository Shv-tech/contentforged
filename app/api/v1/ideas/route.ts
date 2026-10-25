/**
 * app/api/v1/ideas/route.ts
 *
 * GET  the brand's open idea queue, best first.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { route } from '@/lib/forge/http';
import { apiCaller, ideas } from '@/lib/forge/public-api';

export const GET = route('api/v1/ideas', async (req: Request) => {
  const caller = await apiCaller(req);
  return NextResponse.json({ ideas: await ideas(caller) });
});
