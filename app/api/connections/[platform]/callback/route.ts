/**
 * app/api/connections/[platform]/callback/route.ts
 *
 * The provider redirects here after consent. The state value is checked and
 * consumed, the code is exchanged for tokens, and the user is returned to
 * where they started with ?connected= or ?connect_error= for the UI to read.
 *
 * Identity comes from the stored state row, not the session cookie, so the
 * callback still lands correctly if the provider's redirect drops cookies
 * set with SameSite=Strict.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/forge/app-url';
import { consumeOAuthState, saveConnection } from '@/lib/forge/connections';
import { exchangeLinkedInCode } from '@/lib/platforms/linkedin';
import { exchangeThreadsCode } from '@/lib/platforms/threads';
import { PlatformError } from '@/lib/platforms/http';
import { observed } from '@/lib/ops/observe';

type Params = { params: { platform: string } };

function back(req: Request, path: string, params: Record<string, string>): NextResponse {
  const url = new URL(path, appUrl(req));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

async function handleGET(req: Request, { params }: Params) {
  const platform = params.platform;
  if (platform !== 'linkedin' && platform !== 'threads') return back(req, '/dashboard', { connect_error: 'Unknown platform.' });

  const url = new URL(req.url);
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code');
  const denied = url.searchParams.get('error_description') ?? url.searchParams.get('error');

  const stored = state ? await consumeOAuthState(state, platform) : null;
  if (!stored) return back(req, '/dashboard', { connect_error: 'That sign-in link expired. Try connecting again.' });
  if (denied || !code)
    return back(req, stored.returnTo, {
      connect_error: denied ? `${platform === 'linkedin' ? 'LinkedIn' : 'Threads'} said: ${denied}` : 'No authorisation code was returned.',
    });

  const redirectUri = `${appUrl(req)}/api/connections/${platform}/callback`;

  try {
    if (platform === 'linkedin') {
      const grant = await exchangeLinkedInCode(code, redirectUri);
      await saveConnection(stored.userId, stored.workspaceId, {
        platform: 'linkedin',
        accountId: grant.memberId,
        accountHandle: null,
        accountName: grant.name,
        accessToken: grant.accessToken,
        refreshToken: grant.refreshToken,
        scopes: grant.scopes,
        expiresAt: grant.expiresAt,
      });
    } else {
      const grant = await exchangeThreadsCode(code, redirectUri);
      await saveConnection(stored.userId, stored.workspaceId, {
        platform: 'threads',
        accountId: grant.userId,
        accountHandle: grant.username,
        accountName: grant.name,
        accessToken: grant.accessToken,
        scopes: ['threads_basic', 'threads_content_publish', 'threads_manage_insights'],
        expiresAt: grant.expiresAt,
      });
    }
    return back(req, stored.returnTo, { connected: platform });
  } catch (error) {
    console.error(`[connections/${platform}/callback]`, error);
    const message = error instanceof PlatformError ? error.message : 'The connection could not be completed. Please try again.';
    return back(req, stored.returnTo, { connect_error: message });
  }
}

export const GET = observed('api/connections/[platform]/callback', handleGET);
