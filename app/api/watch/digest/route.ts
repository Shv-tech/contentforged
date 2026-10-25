/**
 * app/api/watch/digest/route.ts
 *
 * GET  this week's digest for the watched accounts: best posts by lift over
 *      each account's own median, posting frequency, and which openings
 *      worked for them.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { HttpError, requireUser, route } from '@/lib/forge/http';
import { requireFeature } from '@/lib/forge/plan';
import { cachedDigest, listWatched } from '@/lib/forge/watch';
import { xConfigured } from '@/lib/x/client';

export const GET = route('api/watch/digest', async (req: Request) => {
  const ctx = await requireUser(req);
  await requireFeature(ctx.userId, 'competitor_watch');
  if (!xConfigured()) throw new HttpError(503, 'X data is not available on this server yet.');

  const accounts = await listWatched(ctx.db, ctx.userId);
  if (accounts.length === 0) return NextResponse.json({ digest: null });
  return NextResponse.json({ digest: await cachedDigest(accounts) });
});
