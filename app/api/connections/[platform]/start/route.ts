/**
 * app/api/connections/[platform]/start/route.ts
 *
 * GET ?return_to=/path  begins OAuth for LinkedIn or Threads: stores a
 * one-time state value and redirects to the provider's consent screen.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/forge/app-url';
import { createOAuthState, safeReturnPath } from '@/lib/forge/connections';
import { randomToken } from '@/lib/forge/crypto';
import { getActiveWorkspace, requireWrite } from '@/lib/forge/data/workspace';
import { HttpError, requireUser, route } from '@/lib/forge/http';
import { requireFeature } from '@/lib/forge/plan';
import { linkedinAuthorizeUrl, linkedinConfigured } from '@/lib/platforms/linkedin';
import { threadsAuthorizeUrl, threadsConfigured } from '@/lib/platforms/threads';

type Params = { params: { platform: string } };

export const GET = route('api/connections/[platform]/start', async (req: Request, { params }: Params) => {
  const platform = params.platform;
  if (platform !== 'linkedin' && platform !== 'threads') throw new HttpError(404, 'Unknown platform.');
  if (platform === 'linkedin' && !linkedinConfigured()) throw new HttpError(503, 'LinkedIn publishing is not configured on this server.');
  if (platform === 'threads' && !threadsConfigured()) throw new HttpError(503, 'Threads publishing is not configured on this server.');

  const ctx = await requireUser(req);
  await requireFeature(ctx.userId, 'publishing');
  const workspace = await getActiveWorkspace(ctx.db, ctx.userId);
  requireWrite(workspace);

  const state = randomToken(24);
  const returnTo = safeReturnPath(new URL(req.url).searchParams.get('return_to'));
  await createOAuthState(ctx.userId, workspace?.id ?? null, platform, state, returnTo);

  const redirectUri = `${appUrl(req)}/api/connections/${platform}/callback`;
  const target = platform === 'linkedin' ? linkedinAuthorizeUrl(state, redirectUri) : threadsAuthorizeUrl(state, redirectUri);
  return NextResponse.redirect(target);
});
