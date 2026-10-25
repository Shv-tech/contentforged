/**
 * lib/platforms/linkedin.ts
 *
 * LinkedIn: OAuth (Sign In with LinkedIn using OpenID Connect plus
 * w_member_social), posting through the versioned Posts API, and post
 * analytics through memberCreatorPostAnalytics where the app has been
 * granted r_member_postAnalytics.
 *
 * Configuration:
 *   LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET   from the developer portal
 *   LINKEDIN_SCOPES        optional, defaults to "openid profile w_member_social";
 *                          add r_member_postAnalytics once approved
 *   LINKEDIN_API_VERSION   optional YYYYMM, defaults to DEFAULT_VERSION
 */

import { PlatformError, providerMessage, readJson } from './http';

const AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const API = 'https://api.linkedin.com';
const DEFAULT_VERSION = '202606';
const DEFAULT_SCOPES = 'openid profile w_member_social';

export const ANALYTICS_SCOPE = 'r_member_postAnalytics';

export function linkedinConfigured(): boolean {
  return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
}

function version(): string {
  return process.env.LINKEDIN_API_VERSION?.trim() || DEFAULT_VERSION;
}

export function linkedinScopes(): string[] {
  return (process.env.LINKEDIN_SCOPES?.trim() || DEFAULT_SCOPES).split(/[\s,]+/).filter(Boolean);
}

export function linkedinAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    state,
    scope: linkedinScopes().join(' '),
  });
  return `${AUTHORIZE_URL}?${params}`;
}

export interface LinkedInGrant {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
  memberId: string;
  name: string | null;
}

export async function exchangeLinkedInCode(code: string, redirectUri: string): Promise<LinkedInGrant> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
    }),
  });
  const body = await readJson(response);
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new PlatformError(`LinkedIn sign-in failed: ${providerMessage(body)}`, 502);
  }

  const accessToken = body.access_token;
  const userinfo = await fetch(`${API}/v2/userinfo`, { headers: { authorization: `Bearer ${accessToken}` } });
  const profile = await readJson(userinfo);
  if (!userinfo.ok || typeof profile.sub !== 'string') {
    throw new PlatformError('LinkedIn did not return your profile. Make sure the app has the openid and profile scopes.', 502);
  }

  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : null;
  return {
    accessToken,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : null,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    scopes: typeof body.scope === 'string' ? body.scope.split(/[\s,]+/).filter(Boolean) : linkedinScopes(),
    memberId: profile.sub,
    name: typeof profile.name === 'string' ? profile.name : null,
  };
}

/**
 * LinkedIn's "little text format" treats these characters as markup in post
 * commentary; unescaped, they truncate or mangle the post (a bare "(" is the
 * classic cause of posts cut off mid-sentence).
 */
const RESERVED = /[\\|{}@[\]()<>#*_~]/g;

/**
 * Escapes commentary, turning hashtags into LinkedIn's hashtag template so
 * they stay clickable instead of becoming escaped plain text.
 */
export function toLittleText(text: string): string {
  const parts = text.split(/((?:^|(?<=\s))#[\p{L}\p{N}_]+)/u);
  return parts
    .map((part) => {
      const hashtag = part.match(/^#([\p{L}\p{N}_]+)$/u);
      if (hashtag) return `{hashtag|\\#|${hashtag[1]}}`;
      return part.replace(RESERVED, (char) => `\\${char}`);
    })
    .join('');
}

function headers(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
    'linkedin-version': version(),
    'x-restli-protocol-version': '2.0.0',
  };
}

export async function publishToLinkedIn(accessToken: string, memberId: string, text: string): Promise<{ urn: string; url: string }> {
  const response = await fetch(`${API}/rest/posts`, {
    method: 'POST',
    headers: headers(accessToken),
    body: JSON.stringify({
      author: `urn:li:person:${memberId}`,
      commentary: toLittleText(text),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  });

  if (response.status === 401) throw new PlatformError('Your LinkedIn connection has expired. Reconnect LinkedIn to keep publishing.', 401, true);
  if (!response.ok) {
    const body = await readJson(response);
    throw new PlatformError(`LinkedIn did not publish the post: ${providerMessage(body)}`, response.status >= 500 ? 502 : 400);
  }

  const urn = response.headers.get('x-restli-id') ?? response.headers.get('x-linkedin-id');
  if (!urn) throw new PlatformError('LinkedIn published the post but did not return its id.', 502);
  return { urn, url: `https://www.linkedin.com/feed/update/${urn}/` };
}

export interface LinkedInPostStats {
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  reshares: number | null;
}

const ANALYTICS_TYPES = { IMPRESSION: 'impressions', REACTION: 'reactions', COMMENT: 'comments', RESHARE: 'reshares' } as const;

/**
 * Lifetime totals for one post. Each metric is a separate request in this
 * API. A metric the API refuses is returned as null rather than failing the
 * whole read.
 */
export async function linkedInPostStats(accessToken: string, urn: string): Promise<LinkedInPostStats> {
  const entityKind = urn.startsWith('urn:li:ugcPost:') ? 'ugc' : 'share';
  const entity = `(${entityKind}:${encodeURIComponent(urn)})`;
  const stats: LinkedInPostStats = { impressions: null, reactions: null, comments: null, reshares: null };

  await Promise.all(
    (Object.keys(ANALYTICS_TYPES) as Array<keyof typeof ANALYTICS_TYPES>).map(async (queryType) => {
      const url = `${API}/rest/memberCreatorPostAnalytics?q=entity&entity=${entity}&queryType=${queryType}&aggregation=TOTAL`;
      const response = await fetch(url, { headers: headers(accessToken) });
      if (response.status === 401) throw new PlatformError('Your LinkedIn connection has expired.', 401, true);
      if (!response.ok) return;
      const body = (await readJson(response)) as { elements?: Array<{ count?: number }> };
      const count = body.elements?.[0]?.count;
      if (typeof count === 'number') stats[ANALYTICS_TYPES[queryType]] = count;
    })
  );

  return stats;
}
