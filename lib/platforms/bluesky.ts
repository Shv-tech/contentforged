/**
 * lib/platforms/bluesky.ts
 *
 * Bluesky over the AT Protocol, authenticated with an app password the user
 * creates in Bluesky's settings (never their account password).
 *
 * Rich text needs facets with UTF-8 byte offsets: without them links,
 * mentions and hashtags post as plain text. Mentions are resolved to DIDs;
 * one that does not resolve is left as text.
 */

import { PlatformError, providerMessage, readJson } from './http';

const ENTRYWAY = 'https://bsky.social';
const PUBLIC_APPVIEW = 'https://public.api.bsky.app';

interface Session {
  accessJwt: string;
  did: string;
  handle: string;
  service: string;
}

export async function createBlueskySession(identifier: string, appPassword: string): Promise<Session> {
  const response = await fetch(`${ENTRYWAY}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: identifier.replace(/^@/, '').trim(), password: appPassword.trim() }),
  });
  const body = await readJson(response);
  if (response.status === 401) {
    throw new PlatformError(
      'Bluesky did not accept that handle and app password. Create an app password under Settings, Privacy and security, App passwords.',
      401,
      true
    );
  }
  if (!response.ok || typeof body.accessJwt !== 'string' || typeof body.did !== 'string') {
    throw new PlatformError(`Bluesky sign-in failed: ${providerMessage(body)}`, 502);
  }

  // Accounts on another PDS are served from it; the entryway returns its URL
  // in the DID document.
  const didDoc = body.didDoc as { service?: Array<{ id?: string; serviceEndpoint?: string }> } | undefined;
  const pds = didDoc?.service?.find((s) => s.id === '#atproto_pds')?.serviceEndpoint;
  return { accessJwt: body.accessJwt, did: body.did, handle: String(body.handle ?? identifier), service: pds ?? ENTRYWAY };
}

type Facet = {
  index: { byteStart: number; byteEnd: number };
  features: Array<{ $type: string; uri?: string; did?: string; tag?: string }>;
};

const encoder = new TextEncoder();

function byteRange(text: string, start: number, end: number) {
  return { byteStart: encoder.encode(text.slice(0, start)).length, byteEnd: encoder.encode(text.slice(0, end)).length };
}

async function resolveHandle(handle: string): Promise<string | null> {
  const response = await fetch(`${PUBLIC_APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
  if (!response.ok) return null;
  const body = await readJson(response);
  return typeof body.did === 'string' ? body.did : null;
}

export async function detectFacets(text: string): Promise<Facet[]> {
  const facets: Facet[] = [];

  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g)) {
    const start = match.index ?? 0;
    facets.push({ index: byteRange(text, start, start + match[0].length), features: [{ $type: 'app.bsky.richtext.facet#link', uri: match[0] }] });
  }

  for (const match of text.matchAll(/(^|\s)(#[\p{L}\p{N}_]{1,64})/gu)) {
    const start = (match.index ?? 0) + match[1].length;
    const tag = match[2].slice(1);
    if (/^\d+$/.test(tag)) continue;
    facets.push({ index: byteRange(text, start, start + match[2].length), features: [{ $type: 'app.bsky.richtext.facet#tag', tag }] });
  }

  const mentions = Array.from(text.matchAll(/(^|\s)(@([a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}))/g));
  const dids = await Promise.all(mentions.map((m) => resolveHandle(m[3])));
  mentions.forEach((match, i) => {
    const did = dids[i];
    if (!did) return;
    const start = (match.index ?? 0) + match[1].length;
    facets.push({ index: byteRange(text, start, start + match[2].length), features: [{ $type: 'app.bsky.richtext.facet#mention', did }] });
  });

  return facets;
}

interface StrongRef {
  uri: string;
  cid: string;
}

async function createPost(session: Session, text: string, reply: { root: StrongRef; parent: StrongRef } | null): Promise<StrongRef> {
  const record: Record<string, unknown> = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
    facets: await detectFacets(text),
    langs: ['en'],
  };
  if (reply) record.reply = reply;

  const response = await fetch(`${session.service}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.accessJwt}` },
    body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', record }),
  });
  const body = await readJson(response);
  if (!response.ok || typeof body.uri !== 'string' || typeof body.cid !== 'string') {
    throw new PlatformError(`Bluesky did not publish the post: ${providerMessage(body)}`, response.status >= 500 ? 502 : 400);
  }
  return { uri: body.uri, cid: body.cid };
}

/** Publishes one post or a reply chain. Returns the first post's AT URI and web URL. */
export async function publishToBluesky(identifier: string, appPassword: string, parts: string[]): Promise<{ uri: string; url: string }> {
  const session = await createBlueskySession(identifier, appPassword);
  let root: StrongRef | null = null;
  let parent: StrongRef | null = null;

  for (const text of parts) {
    const ref: StrongRef = await createPost(session, text, root && parent ? { root, parent } : null);
    root ??= ref;
    parent = ref;
  }
  if (!root) throw new PlatformError('There was nothing to publish.', 400);

  const rkey = root.uri.split('/').pop();
  return { uri: root.uri, url: `https://bsky.app/profile/${session.handle}/post/${rkey}` };
}

export interface BlueskyPostStats {
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
}

/** Public counts from the AppView. Bluesky does not expose view counts. */
export async function blueskyPostStats(uri: string): Promise<BlueskyPostStats | null> {
  const response = await fetch(`${PUBLIC_APPVIEW}/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`);
  if (!response.ok) return null;
  const body = (await readJson(response)) as { posts?: Array<{ likeCount?: number; repostCount?: number; replyCount?: number; quoteCount?: number }> };
  const post = body.posts?.[0];
  if (!post) return null;
  return { likes: post.likeCount ?? 0, reposts: post.repostCount ?? 0, replies: post.replyCount ?? 0, quotes: post.quoteCount ?? 0 };
}

/** at://did/app.bsky.feed.post/rkey from a bsky.app post URL. */
export async function blueskyUriFromUrl(url: string): Promise<string | null> {
  const match = url.match(/bsky\.app\/profile\/([^/]+)\/post\/([a-z0-9]+)/i);
  if (!match) return null;
  const actor = match[1];
  const did = actor.startsWith('did:') ? actor : await resolveHandle(actor);
  return did ? `at://${did}/app.bsky.feed.post/${match[2]}` : null;
}

export interface BlueskyReply {
  uri: string;
  handle: string;
  displayName: string | null;
  text: string;
  createdAt: string | null;
}

/** Direct replies to a post, from the public AppView. No credential needed. */
export async function blueskyReplies(uri: string): Promise<BlueskyReply[]> {
  const response = await fetch(`${PUBLIC_APPVIEW}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=1&parentHeight=0`);
  if (!response.ok) return [];
  const body = (await readJson(response)) as {
    thread?: { replies?: Array<{ post?: { uri: string; author?: { handle?: string; displayName?: string }; record?: { text?: string; createdAt?: string } } }> };
  };
  return (body.thread?.replies ?? [])
    .map((reply) => reply.post)
    .filter((post): post is NonNullable<typeof post> => Boolean(post?.uri && post.record?.text))
    .map((post) => ({
      uri: post.uri,
      handle: post.author?.handle ?? 'unknown',
      displayName: post.author?.displayName ?? null,
      text: post.record?.text ?? '',
      createdAt: post.record?.createdAt ?? null,
    }));
}
