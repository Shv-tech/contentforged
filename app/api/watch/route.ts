/**
 * app/api/watch/route.ts
 *
 * GET   watched accounts
 * POST  { handle }  watch an X account (Pro, up to MAX_WATCHED)
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HttpError, parseJson, requireUser, route } from '@/lib/forge/http';
import { requireFeature } from '@/lib/forge/plan';
import { listWatched, MAX_WATCHED } from '@/lib/forge/watch';
import { getUserByUsername, isValidHandle, normaliseHandle, xConfigured, XApiError } from '@/lib/x/client';

export const GET = route('api/watch:get', async (req: Request) => {
  const ctx = await requireUser(req);
  return NextResponse.json({ accounts: await listWatched(ctx.db, ctx.userId), max: MAX_WATCHED });
});

const BodySchema = z.object({ handle: z.string().trim().min(1).max(80) });

export const POST = route('api/watch:post', async (req: Request) => {
  const ctx = await requireUser(req);
  await requireFeature(ctx.userId, 'competitor_watch');
  if (!xConfigured()) throw new HttpError(503, 'X data is not available on this server yet.');

  const handle = normaliseHandle((await parseJson(req, BodySchema)).handle);
  if (!isValidHandle(handle)) throw new HttpError(400, 'That does not look like an X handle.');

  const existing = await listWatched(ctx.db, ctx.userId);
  if (existing.length >= MAX_WATCHED) throw new HttpError(409, `You can watch up to ${MAX_WATCHED} accounts. Remove one first.`);
  if (existing.some((a) => a.handle.toLowerCase() === handle.toLowerCase())) throw new HttpError(409, `You already watch @${handle}.`);

  try {
    const user = await getUserByUsername(handle);
    const { data, error } = await ctx.db
      .from('watch_accounts')
      .insert({
        user_id: ctx.userId,
        platform: 'x',
        handle: user.username,
        external_user_id: user.id,
        display_name: user.name,
        avatar_url: user.profile_image_url ?? null,
      })
      .select('id, handle, external_user_id, display_name, avatar_url, created_at')
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ account: data }, { status: 201 });
  } catch (error) {
    if (error instanceof XApiError) throw new HttpError(error.status === 404 ? 404 : 502, error.message);
    throw error;
  }
});
