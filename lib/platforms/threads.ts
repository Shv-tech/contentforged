/**
 * lib/platforms/threads.ts
 *
 * Threads (Meta): OAuth with long-lived tokens, text publishing including
 * reply chains for threads, and per-post insights.
 *
 * Configuration: THREADS_APP_ID, THREADS_APP_SECRET.
 */

import { PlatformError, providerMessage, readJson } from './http';

const AUTHORIZE_URL = 'https://threads.com/oauth/authorize';
const GRAPH = 'https://graph.threads.com';
const API = `${GRAPH}/v1.0`;
export const THREADS_SCOPES = ['threads_basic', 'threads_content_publish', 'threads_manage_insights', 'threads_read_replies'];

/** Reading replies needs this scope; connections made before it was requested must reconnect. */
export const THREADS_REPLIES_SCOPE = 'threads_read_replies';

export function threadsConfigured(): boolean {
  return Boolean(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET);
}

export function threadsAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.THREADS_APP_ID ?? '',
    redirect_uri: redirectUri,
    scope: THREADS_SCOPES.join(','),
    response_type: 'code',
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

export interface ThreadsGrant {
  accessToken: string;
  expiresAt: string;
  userId: string;
  username: string | null;
  name: string | null;
}

export async function exchangeThreadsCode(code: string, redirectUri: string): Promise<ThreadsGrant> {
  const shortResponse = await fetch(`${GRAPH}/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.THREADS_APP_ID ?? '',
      client_secret: process.env.THREADS_APP_SECRET ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  const short = await readJson(shortResponse);
  if (!shortResponse.ok || typeof short.access_token !== 'string') {
    throw new PlatformError(`Threads sign-in failed: ${providerMessage(short)}`, 502);
  }

  // Short-lived tokens last an hour; exchange for the 60-day token at once.
  const longParams = new URLSearchParams({
    grant_type: 'th_exchange_token',
    client_secret: process.env.THREADS_APP_SECRET ?? '',
    access_token: short.access_token,
  });
  const longResponse = await fetch(`${GRAPH}/access_token?${longParams}`);
  const long = await readJson(longResponse);
  if (!longResponse.ok || typeof long.access_token !== 'string') {
    throw new PlatformError(`Threads did not issue a long-lived token: ${providerMessage(long)}`, 502);
  }

  const accessToken = long.access_token;
  const me = await fetch(`${API}/me?fields=id,username,name&access_token=${encodeURIComponent(accessToken)}`);
  const profile = await readJson(me);
  if (!me.ok || typeof profile.id !== 'string') throw new PlatformError('Threads did not return your profile.', 502);

  const expiresIn = typeof long.expires_in === 'number' ? long.expires_in : 60 * 86_400;
  return {
    accessToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    userId: profile.id,
    username: typeof profile.username === 'string' ? profile.username : null,
    name: typeof profile.name === 'string' ? profile.name : null,
  };
}

/**
 * Extends a long-lived token by another 60 days. Allowed once the token is a
 * day old and not yet expired; returns null when Threads refuses, which means
 * the user has to reconnect.
 */
export async function refreshThreadsToken(accessToken: string): Promise<{ accessToken: string; expiresAt: string } | null> {
  const params = new URLSearchParams({ grant_type: 'th_refresh_token', access_token: accessToken });
  const response = await fetch(`${GRAPH}/refresh_access_token?${params}`);
  const body = await readJson(response);
  if (!response.ok || typeof body.access_token !== 'string') return null;
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 60 * 86_400;
  return { accessToken: body.access_token, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
}

async function graphPost(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(`${API}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const body = await readJson(response);
  if (response.status === 401 || (body.error as { code?: number } | undefined)?.code === 190) {
    throw new PlatformError('Your Threads connection has expired. Reconnect Threads to keep publishing.', 401, true);
  }
  if (!response.ok) throw new PlatformError(`Threads did not publish the post: ${providerMessage(body)}`, response.status >= 500 ? 502 : 400);
  return body;
}

/** Waits for a container to finish processing. Text containers are usually ready at once. */
async function waitForContainer(containerId: string, accessToken: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await fetch(`${API}/${containerId}?fields=status,error_message&access_token=${encodeURIComponent(accessToken)}`);
    const body = await readJson(response);
    if (body.status === 'FINISHED' || body.status === 'PUBLISHED') return;
    if (body.status === 'ERROR' || body.status === 'EXPIRED') {
      throw new PlatformError(`Threads could not process the post: ${String(body.error_message ?? body.status)}`, 400);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

/**
 * Publishes one post, or a chain where each part replies to the one before
 * it. Returns the first post's id and permalink.
 */
export async function publishToThreads(accessToken: string, userId: string, parts: string[]): Promise<{ id: string; url: string | null }> {
  let firstId: string | null = null;
  let previousId: string | null = null;

  for (const text of parts) {
    const params: Record<string, string> = { media_type: 'TEXT', text, access_token: accessToken };
    if (previousId) params.reply_to_id = previousId;
    const container = await graphPost(`${userId}/threads`, params);
    const containerId = String(container.id ?? '');
    if (!containerId) throw new PlatformError('Threads did not return a container id.', 502);
    await waitForContainer(containerId, accessToken);
    const published = await graphPost(`${userId}/threads_publish`, { creation_id: containerId, access_token: accessToken });
    const id = String(published.id ?? '');
    if (!id) throw new PlatformError('Threads did not return the published post id.', 502);
    firstId ??= id;
    previousId = id;
  }

  if (!firstId) throw new PlatformError('There was nothing to publish.', 400);
  const permalink = await fetch(`${API}/${firstId}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`).then(readJson);
  return { id: firstId, url: typeof permalink.permalink === 'string' ? permalink.permalink : null };
}

export interface ThreadsPostStats {
  views: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
}

export async function threadsPostStats(accessToken: string, mediaId: string): Promise<ThreadsPostStats> {
  const params = new URLSearchParams({ metric: 'views,likes,replies,reposts,quotes', access_token: accessToken });
  const response = await fetch(`${API}/${mediaId}/insights?${params}`);
  const body = (await readJson(response)) as { data?: Array<{ name: string; values?: Array<{ value: number }>; total_value?: { value: number } }> };
  if (response.status === 401) throw new PlatformError('Your Threads connection has expired.', 401, true);
  const stats: ThreadsPostStats = { views: null, likes: null, replies: null, reposts: null, quotes: null };
  for (const metric of body.data ?? []) {
    const value = metric.total_value?.value ?? metric.values?.[0]?.value;
    if (typeof value === 'number' && metric.name in stats) stats[metric.name as keyof ThreadsPostStats] = value;
  }
  return stats;
}

export interface ThreadsReply {
  id: string;
  text: string;
  username: string | null;
  timestamp: string | null;
  permalink: string | null;
}

/** Top-level replies to one of the user's own posts. */
export async function threadsReplies(accessToken: string, mediaId: string): Promise<ThreadsReply[]> {
  const params = new URLSearchParams({ fields: 'id,text,username,timestamp,permalink', reverse: 'false', access_token: accessToken });
  const response = await fetch(`${API}/${mediaId}/replies?${params}`);
  const body = (await readJson(response)) as { data?: Array<{ id: string; text?: string; username?: string; timestamp?: string; permalink?: string }> };
  if (response.status === 401) throw new PlatformError('Your Threads connection has expired.', 401, true);
  if (!response.ok) throw new PlatformError(providerMessage(body), response.status);
  return (body.data ?? [])
    .filter((reply) => Boolean(reply.text))
    .map((reply) => ({ id: reply.id, text: reply.text ?? '', username: reply.username ?? null, timestamp: reply.timestamp ?? null, permalink: reply.permalink ?? null }));
}
