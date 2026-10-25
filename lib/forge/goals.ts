/**
 * lib/forge/goals.ts
 *
 * Results that mean money: a link in a post, the clicks on it, and the
 * bookings, signups and sales it led to.
 *
 * HOW ATTRIBUTION WORKS
 *
 * Each post can carry a short link (forgeyourway.dev/l/AbC12xY). Clicking it
 * records the click and forwards to the destination with utm_content set to
 * the link's code, and, for Cal.com, metadata[forge] as well. When a booking
 * or signup comes back through a webhook carrying that code, it is tied to
 * the post. Events without a code still count toward totals; they are just
 * not credited to a post. Nothing here guesses.
 *
 * Webhooks are verified the way each provider signs them: Cal.com with an
 * HMAC of the body, Calendly with an HMAC of timestamp and body, and the
 * generic endpoint by its unguessable path token.
 */

import { createHmac, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { decryptSecret, encryptSecret, randomToken, safeEqual } from './crypto';
import { scopeRows } from './data/workspace';
import { HttpError } from './http';

export type GoalProvider = 'calcom' | 'calendly' | 'webhook';
export type GoalKind = 'booking' | 'signup' | 'purchase' | 'custom';

export const GOAL_PROVIDER_INFO: Record<GoalProvider, { name: string; help: string }> = {
  calcom: {
    name: 'Cal.com',
    help: 'In Cal.com, Settings, Developer, Webhooks: add this URL for "Booking created", and paste the secret you set there.',
  },
  calendly: {
    name: 'Calendly',
    help: 'Create a webhook subscription for invitee.created with this URL (Calendly API), and paste its signing key.',
  },
  webhook: {
    name: 'Any service',
    help: 'POST JSON to this URL: { "event": "signup" | "purchase" | "booking", "ref": "<utm_content>", "value": 49, "currency": "USD", "id": "<your event id>" }. Keep the URL secret.',
  },
};

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function newCode(): string {
  return Array.from(randomBytes(7), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

// ============================================================================
// SHORT LINKS
// ============================================================================

export interface ShortLink {
  code: string;
  destination: string;
  click_count: number;
  draft_id: string | null;
  created_at: string;
}

export async function createShortLink(db: SupabaseClient, userId: string, workspaceId: string | null, draftId: string | null, destination: string): Promise<ShortLink> {
  let url: URL;
  try {
    url = new URL(destination.trim());
  } catch {
    throw new HttpError(400, 'That is not a valid link.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new HttpError(400, 'Use an http or https link.');

  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await db
      .from('short_links')
      .insert({ code: newCode(), user_id: userId, workspace_id: workspaceId, draft_id: draftId, destination: url.toString() })
      .select('code, destination, click_count, draft_id, created_at')
      .single();
    if (!error && data) return data as ShortLink;
    if (error?.code !== '23505') throw new Error(`Could not create the link: ${error?.message ?? 'unknown error'}`);
  }
  throw new Error('Could not create a unique link. Try again.');
}

export async function linksForDraft(db: SupabaseClient, draftId: string): Promise<ShortLink[]> {
  const { data } = await db.from('short_links').select('code, destination, click_count, draft_id, created_at').eq('draft_id', draftId).order('created_at', { ascending: false });
  return (data ?? []) as ShortLink[];
}

/** Where a click goes: the destination, tagged so a later conversion can be traced back. */
export function forwardUrl(destination: string, code: string): string {
  const url = new URL(destination);
  if (!url.searchParams.has('utm_source')) url.searchParams.set('utm_source', 'forge');
  if (!url.searchParams.has('utm_medium')) url.searchParams.set('utm_medium', 'social');
  if (!url.searchParams.has('utm_content')) url.searchParams.set('utm_content', code);
  if (/(^|\.)cal\.com$/i.test(url.hostname)) url.searchParams.set('metadata[forge]', code);
  return url.toString();
}

/** Counts a click and returns where to send the visitor, or null for an unknown code. */
export async function recordClick(code: string, referrer: string | null, country: string | null): Promise<string | null> {
  if (!/^[A-Za-z0-9]{7}$/.test(code)) return null;
  let referrerHost: string | null = null;
  try {
    referrerHost = referrer ? new URL(referrer).hostname : null;
  } catch {
    referrerHost = null;
  }
  const { data, error } = await createServiceClient().rpc('forge_record_click', { p_code: code, p_referrer: referrerHost, p_country: country });
  if (error) {
    console.error('[forge/goals] click not recorded:', error.message);
    return null;
  }
  return typeof data === 'string' ? forwardUrl(data, code) : null;
}

// ============================================================================
// ENDPOINTS
// ============================================================================

export interface GoalEndpoint {
  id: string;
  provider: GoalProvider;
  token: string;
  has_secret: boolean;
  last_event_at: string | null;
  created_at: string;
}

type Filterable<Q> = { is: (c: string, v: null) => Q; eq: (c: string, v: string) => Q };
function scoped<Q extends Filterable<Q>>(query: Q, userId: string, workspaceId: string | null): Q {
  return workspaceId ? query.eq('workspace_id', workspaceId) : query.eq('user_id', userId).is('workspace_id', null);
}

export async function listEndpoints(userId: string, workspaceId: string | null): Promise<GoalEndpoint[]> {
  const query = createServiceClient().from('goal_endpoints').select('id, provider, token, secret_enc, last_event_at, created_at');
  const { data, error } = await scoped(query, userId, workspaceId).order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: { id: string; provider: GoalProvider; token: string; secret_enc: string | null; last_event_at: string | null; created_at: string }) => ({
    id: row.id,
    provider: row.provider,
    token: row.token,
    has_secret: Boolean(row.secret_enc),
    last_event_at: row.last_event_at,
    created_at: row.created_at,
  }));
}

/** Creates the brand's endpoint for a provider, or replaces it (a new URL and secret). */
export async function upsertEndpoint(userId: string, workspaceId: string | null, provider: GoalProvider, secret: string | null): Promise<GoalEndpoint> {
  if (provider !== 'webhook' && (!secret || secret.trim().length < 8)) throw new HttpError(400, `Paste the signing secret from ${GOAL_PROVIDER_INFO[provider].name}.`);
  const service = createServiceClient();
  await scoped(service.from('goal_endpoints').delete().eq('provider', provider), userId, workspaceId);
  const { error } = await service.from('goal_endpoints').insert({
    user_id: userId,
    workspace_id: workspaceId,
    provider,
    token: randomToken(24),
    secret_enc: secret?.trim() ? encryptSecret(secret.trim()) : null,
  });
  if (error) throw new Error(`Could not save the endpoint: ${error.message}`);
  const endpoints = await listEndpoints(userId, workspaceId);
  const endpoint = endpoints.find((e) => e.provider === provider);
  if (!endpoint) throw new Error('The endpoint was not saved.');
  return endpoint;
}

export async function removeEndpoint(userId: string, workspaceId: string | null, id: string): Promise<void> {
  await scoped(createServiceClient().from('goal_endpoints').delete().eq('id', id), userId, workspaceId);
}

// ============================================================================
// INCOMING EVENTS
// ============================================================================

interface StoredEndpoint {
  id: string;
  user_id: string;
  workspace_id: string | null;
  provider: GoalProvider;
  secret_enc: string | null;
}

interface ParsedEvent {
  kind: GoalKind;
  externalId: string | null;
  ref: string | null;
  value: number | null;
  currency: string | null;
  label: string | null;
  occurredAt: string;
}

function hmacHex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function verifyCalcom(secret: string, body: string, headers: Headers): void {
  const signature = headers.get('x-cal-signature-256') ?? '';
  if (!signature || !safeEqual(signature, hmacHex(secret, body))) throw new HttpError(401, 'Invalid signature.');
}

function verifyCalendly(secret: string, body: string, headers: Headers): void {
  const header = headers.get('calendly-webhook-signature') ?? '';
  const parts = Object.fromEntries(header.split(',').map((part) => part.split('=') as [string, string]));
  if (!parts.t || !parts.v1) throw new HttpError(401, 'Invalid signature.');
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) throw new HttpError(401, 'The signature has expired.');
  if (!safeEqual(parts.v1, hmacHex(secret, `${parts.t}.${body}`))) throw new HttpError(401, 'Invalid signature.');
}

/** A Forge link code inside whatever the provider passed through, if any. */
function findCode(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const match = value.match(/(?:^|[^A-Za-z0-9])([A-Za-z0-9]{7})(?:$|[^A-Za-z0-9])/);
    if (match) return match[1];
  }
  return null;
}

function parseEvent(provider: GoalProvider, body: Record<string, any>): ParsedEvent | null {
  const now = new Date().toISOString();
  if (provider === 'calcom') {
    if (body.triggerEvent && body.triggerEvent !== 'BOOKING_CREATED') return null;
    const payload = body.payload ?? {};
    return {
      kind: 'booking',
      externalId: payload.uid ?? payload.bookingId?.toString() ?? null,
      ref: findCode(payload.metadata?.forge, payload.metadata?.utm_content, payload.responses?.utm_content?.value),
      value: null,
      currency: null,
      label: typeof payload.title === 'string' ? payload.title.slice(0, 140) : 'Booking',
      occurredAt: body.createdAt ?? now,
    };
  }
  if (provider === 'calendly') {
    if (body.event && body.event !== 'invitee.created') return null;
    const payload = body.payload ?? {};
    return {
      kind: 'booking',
      externalId: payload.uri ?? null,
      ref: findCode(payload.tracking?.utm_content, payload.tracking?.utm_campaign),
      value: null,
      currency: null,
      label: typeof payload.scheduled_event?.name === 'string' ? payload.scheduled_event.name.slice(0, 140) : 'Booking',
      occurredAt: payload.created_at ?? now,
    };
  }
  const kind: GoalKind = ['booking', 'signup', 'purchase'].includes(body.event) ? body.event : 'custom';
  const value = Number(body.value);
  return {
    kind,
    externalId: typeof body.id === 'string' || typeof body.id === 'number' ? String(body.id).slice(0, 200) : null,
    ref: findCode(body.ref, body.utm_content),
    value: Number.isFinite(value) ? value : null,
    currency: typeof body.currency === 'string' ? body.currency.slice(0, 8).toUpperCase() : null,
    label: typeof body.label === 'string' ? body.label.slice(0, 140) : null,
    occurredAt: typeof body.occurred_at === 'string' && !Number.isNaN(Date.parse(body.occurred_at)) ? body.occurred_at : now,
  };
}

/**
 * Verifies and records one incoming event. Returns 'recorded', 'duplicate'
 * or 'ignored' (an event type Forge does not count).
 */
export async function receiveGoalEvent(token: string, body: string, headers: Headers): Promise<'recorded' | 'duplicate' | 'ignored'> {
  const service = createServiceClient();
  const { data } = await service.from('goal_endpoints').select('id, user_id, workspace_id, provider, secret_enc').eq('token', token).maybeSingle();
  if (!data) throw new HttpError(404, 'Unknown endpoint.');
  const endpoint = data as StoredEndpoint;

  if (endpoint.provider === 'calcom' || endpoint.provider === 'calendly') {
    if (!endpoint.secret_enc) throw new HttpError(401, 'This endpoint has no signing secret.');
    const secret = decryptSecret(endpoint.secret_enc);
    if (endpoint.provider === 'calcom') verifyCalcom(secret, body, headers);
    else verifyCalendly(secret, body, headers);
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(body);
  } catch {
    throw new HttpError(400, 'The body must be JSON.');
  }
  const event = parseEvent(endpoint.provider, json);
  if (!event) return 'ignored';

  let draftId: string | null = null;
  let shortCode: string | null = null;
  if (event.ref) {
    const query = service.from('short_links').select('code, draft_id').eq('code', event.ref);
    const { data: link } = await scoped(query, endpoint.user_id, endpoint.workspace_id).maybeSingle();
    if (link) {
      shortCode = link.code;
      draftId = link.draft_id;
    }
  }

  const { error } = await service.from('goal_events').insert({
    user_id: endpoint.user_id,
    workspace_id: endpoint.workspace_id,
    endpoint_id: endpoint.id,
    kind: event.kind,
    provider: endpoint.provider,
    external_id: event.externalId,
    short_code: shortCode,
    draft_id: draftId,
    value: event.value,
    currency: event.currency,
    label: event.label,
    occurred_at: event.occurredAt,
  });
  if (error?.code === '23505') return 'duplicate';
  if (error) throw new Error(`Could not record the event: ${error.message}`);

  await service.from('goal_endpoints').update({ last_event_at: new Date().toISOString() }).eq('id', endpoint.id);
  return 'recorded';
}

// ============================================================================
// SUMMARY
// ============================================================================

export interface GoalSummary {
  windowDays: number;
  totals: Record<GoalKind, number>;
  clicks: number;
  attributed: number;
  byDraft: Array<{ draftId: string; bookings: number; signups: number; purchases: number; other: number; clicks: number; value: number }>;
  recent: Array<{ id: string; kind: GoalKind; provider: string; label: string | null; draft_id: string | null; value: number | null; currency: string | null; occurred_at: string }>;
}

export async function goalSummary(db: SupabaseClient, userId: string, workspaceId: string | null, windowDays = 90): Promise<GoalSummary> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const eventsQuery = db.from('goal_events').select('id, kind, provider, label, draft_id, value, currency, occurred_at').gte('occurred_at', since);
  const linksQuery = db.from('short_links').select('code, draft_id, click_count');
  const [{ data: events }, { data: links }] = await Promise.all([
    scopeRows(eventsQuery, userId, workspaceId).order('occurred_at', { ascending: false }).limit(1000),
    scopeRows(linksQuery, userId, workspaceId).limit(1000),
  ]);

  const rows = (events ?? []) as GoalSummary['recent'];
  const totals: Record<GoalKind, number> = { booking: 0, signup: 0, purchase: 0, custom: 0 };
  const byDraft = new Map<string, GoalSummary['byDraft'][number]>();
  const entry = (draftId: string) => {
    const existing = byDraft.get(draftId) ?? { draftId, bookings: 0, signups: 0, purchases: 0, other: 0, clicks: 0, value: 0 };
    byDraft.set(draftId, existing);
    return existing;
  };

  for (const row of rows) {
    totals[row.kind] += 1;
    if (!row.draft_id) continue;
    const e = entry(row.draft_id);
    if (row.kind === 'booking') e.bookings += 1;
    else if (row.kind === 'signup') e.signups += 1;
    else if (row.kind === 'purchase') e.purchases += 1;
    else e.other += 1;
    e.value += row.value ?? 0;
  }

  let clicks = 0;
  for (const link of (links ?? []) as Array<{ draft_id: string | null; click_count: number }>) {
    clicks += link.click_count;
    if (link.draft_id) entry(link.draft_id).clicks += link.click_count;
  }

  return {
    windowDays,
    totals,
    clicks,
    attributed: rows.filter((r) => r.draft_id).length,
    byDraft: Array.from(byDraft.values()).sort((a, b) => b.bookings + b.signups + b.purchases - (a.bookings + a.signups + a.purchases) || b.clicks - a.clicks),
    recent: rows.slice(0, 30),
  };
}
