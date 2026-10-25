/**
 * app/api/v1/me/route.ts
 *
 * GET  who the key belongs to, the brand it acts for, the plan, and the
 *      key's scopes. The first call to make when wiring Forge into a tool.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { route } from '@/lib/forge/http';
import { apiCaller, me } from '@/lib/forge/public-api';

export const GET = route('api/v1/me', async (req: Request) => {
  const caller = await apiCaller(req);
  return NextResponse.json(await me(caller));
});
