/**
 * app/api/connections/[platform]/route.ts
 *
 * POST    connect Bluesky with a handle and app password (the OAuth
 *         platforms connect through ./start instead)
 * DELETE  disconnect a platform from the active brand
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isConnectablePlatform, removeConnection, saveConnection } from '@/lib/forge/connections';
import { getActiveWorkspace, requireWrite } from '@/lib/forge/data/workspace';
import { HttpError, parseJson, requireUser, route } from '@/lib/forge/http';
import { requireFeature } from '@/lib/forge/plan';
import { createBlueskySession } from '@/lib/platforms/bluesky';
import { PlatformError } from '@/lib/platforms/http';

type Params = { params: { platform: string } };

const BlueskySchema = z.object({
  identifier: z.string().trim().min(3).max(253),
  appPassword: z
    .string()
    .trim()
    .regex(/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i, 'Use an app password (xxxx-xxxx-xxxx-xxxx), not your account password.'),
});

export const POST = route('api/connections/[platform]:post', async (req: Request, { params }: Params) => {
  if (params.platform !== 'bluesky') throw new HttpError(405, 'Connect this platform with its sign-in button.');
  const ctx = await requireUser(req);
  await requireFeature(ctx.userId, 'publishing');
  const input = await parseJson(req, BlueskySchema);
  const workspace = await getActiveWorkspace(ctx.db, ctx.userId);
  requireWrite(workspace);

  try {
    // Signing in once proves the credentials before they are stored.
    const session = await createBlueskySession(input.identifier, input.appPassword);
    await saveConnection(ctx.userId, workspace?.id ?? null, {
      platform: 'bluesky',
      accountId: session.did,
      accountHandle: session.handle,
      accountName: null,
      // The session token is short-lived; the app password is what is
      // reused, and a fresh session is created for each publish.
      accessToken: session.handle,
      secret: input.appPassword,
      scopes: ['app_password'],
      expiresAt: null,
    });
    return NextResponse.json({ connected: true, handle: session.handle });
  } catch (error) {
    if (error instanceof PlatformError) throw new HttpError(error.status === 401 ? 400 : error.status, error.message);
    throw error;
  }
});

export const DELETE = route('api/connections/[platform]:delete', async (req: Request, { params }: Params) => {
  if (!isConnectablePlatform(params.platform)) throw new HttpError(404, 'Unknown platform.');
  const ctx = await requireUser(req);
  const workspace = await getActiveWorkspace(ctx.db, ctx.userId);
  requireWrite(workspace);
  await removeConnection(ctx.userId, workspace?.id ?? null, params.platform);
  return NextResponse.json({ disconnected: true });
});
