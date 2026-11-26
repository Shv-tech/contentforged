/**
 * lib/ops/recorder.ts
 *
 * Writes monitoring events to public.ops_events.
 *
 * Rules this file keeps, because monitoring must never be the thing that
 * breaks Forge:
 *   - It never throws into the caller. A failed write is dropped (and logged
 *     once to the console).
 *   - It never slows a response. Events for one request are buffered and
 *     written in one insert after the response is ready, using Vercel's
 *     waitUntil so the function stays alive long enough to finish.
 *   - It writes with the original fetch, so its own database calls are never
 *     recorded as upstream calls (no feedback loop).
 *   - It stores no request bodies, post text or query strings.
 */

import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

export type OpsKind = 'request' | 'upstream' | 'client' | 'health';
export type OpsLevel = 'ok' | 'warn' | 'error';

export interface OpsEvent {
  at?: string;
  kind: OpsKind;
  level: OpsLevel;
  request_id?: string | null;
  feature: string;
  name: string;
  method?: string | null;
  path?: string | null;
  status?: number | null;
  duration_ms?: number | null;
  user_id?: string | null;
  message?: string | null;
  detail?: Record<string, unknown>;
  weight?: number;
}

export interface OpsContext {
  requestId: string;
  feature: string;
  userId: string | null;
  /** Upstream calls made while serving this request, written with it. */
  buffer: OpsEvent[];
  /** The error that turned this request into a 500, if any. */
  error: unknown;
}

/**
 * Shared through globalThis: instrumentation.ts and the routes are separate
 * bundles, each with its own copy of this module. Without one shared store,
 * an outside call made inside a request could not see which request it
 * belongs to.
 */
interface OpsGlobal {
  storage: AsyncLocalStorage<OpsContext>;
  baseFetch: typeof fetch | null;
  warned: boolean;
}
const GLOBAL_KEY = Symbol.for('forge.ops.recorder');
const shared: OpsGlobal = ((globalThis as Record<symbol, OpsGlobal | undefined>)[GLOBAL_KEY] ??= {
  storage: new AsyncLocalStorage<OpsContext>(),
  baseFetch: null,
  warned: false,
});
const storage = shared.storage;

export function opsContext(): OpsContext | undefined {
  return storage.getStore();
}

export function runWithOps<T>(ctx: OpsContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

/** Short, readable, unique enough to search for: "r_" + 10 hex characters. */
export function newRequestId(): string {
  return `r_${randomBytes(5).toString('hex')}`;
}

/** The signed-in person behind the current request, for "who hit this error". */
export function noteUser(userId: string): void {
  const ctx = storage.getStore();
  if (ctx) ctx.userId = userId;
}

/** Holds the original fetch, set by the fetch patch, so recording never records itself. */
export function setBaseFetch(f: typeof fetch): void {
  shared.baseFetch = f;
}

/** The unrecorded fetch, for monitoring's own calls (health checks, alerts). */
export function rawFetch(): typeof fetch {
  return shared.baseFetch ?? fetch;
}

export function opsEnabled(): boolean {
  return process.env.OPS_DISABLED !== '1' && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Share of successful requests to store (0 to 1). Errors are always stored. */
export function successSampleRate(): number {
  const raw = Number.parseFloat(process.env.OPS_SAMPLE_SUCCESS ?? '1');
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 1;
}

const MAX_TEXT = 2000;

export function clip(value: unknown, max = MAX_TEXT): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'string' ? value : String(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/** Message and a trimmed stack, safe to store. */
export function describeError(error: unknown): { message: string; stack: string | null; type: string } {
  if (error instanceof Error) {
    return { message: clip(error.message, 500) ?? 'Error', stack: clip(error.stack, 4000), type: error.name };
  }
  return { message: clip(typeof error === 'object' ? JSON.stringify(error) : String(error), 500) ?? 'Unknown error', stack: null, type: typeof error };
}

async function insert(events: OpsEvent[]): Promise<void> {
  if (events.length === 0 || !opsEnabled()) return;
  const f = rawFetch();
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/ops_events`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const rows = events.map((e) => ({
    at: e.at ?? new Date().toISOString(),
    kind: e.kind,
    level: e.level,
    request_id: e.request_id ?? null,
    feature: e.feature,
    name: clip(e.name, 200),
    method: e.method ?? null,
    path: clip(e.path, 300),
    status: e.status ?? null,
    duration_ms: e.duration_ms === null || e.duration_ms === undefined ? null : Math.round(e.duration_ms),
    user_id: e.user_id ?? null,
    message: clip(e.message),
    detail: e.detail ?? {},
    weight: e.weight ?? 1,
  }));
  try {
    const res = await f(url, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify(rows),
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok && !shared.warned) {
      shared.warned = true;
      console.warn(`[ops] could not record events (${res.status}). Has 20261126000000_forge_ops.sql been applied?`);
    }
  } catch (error) {
    if (!shared.warned) {
      shared.warned = true;
      console.warn('[ops] could not record events', error instanceof Error ? error.message : error);
    }
  }
}

/**
 * Keeps the serverless function alive until `promise` settles. On Vercel
 * this is the platform's request context (the same thing @vercel/functions
 * waitUntil reads); elsewhere the promise simply runs.
 */
const REQUEST_CONTEXT = Symbol.for('@vercel/request-context');
function background(promise: Promise<unknown>): void {
  try {
    const holder = (globalThis as Record<symbol, { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined } | undefined>)[REQUEST_CONTEXT];
    const waitUntil = holder?.get?.()?.waitUntil;
    if (waitUntil) waitUntil(promise);
    else void promise;
  } catch {
    void promise;
  }
}

/** Writes now (in the background). Use outside a request, or for errors that must not wait. */
export function recordNow(events: OpsEvent | OpsEvent[]): void {
  const list = Array.isArray(events) ? events : [events];
  background(insert(list));
}

/** Adds to the current request's batch, or writes now when there is no request. */
export function record(event: OpsEvent): void {
  const ctx = storage.getStore();
  if (ctx) {
    ctx.buffer.push({ request_id: ctx.requestId, user_id: ctx.userId, ...event });
    if (ctx.buffer.length > 200) ctx.buffer.splice(0, ctx.buffer.length - 200);
  } else {
    recordNow(event);
  }
}

/** Writes the request's own event plus everything buffered while serving it. */
export function flush(ctx: OpsContext, requestEvent: OpsEvent | null): void {
  const events = requestEvent ? [requestEvent, ...ctx.buffer] : [...ctx.buffer];
  ctx.buffer.length = 0;
  for (const e of events) if (e.user_id === undefined || e.user_id === null) e.user_id = ctx.userId;
  if (events.length > 0) background(insert(events));
}

/**
 * Records an error that happened outside the normal request flow, for
 * example inside a stream after the response started, or in a background
 * task. Ties it to the current request when there is one.
 */
export function reportError(name: string, error: unknown, extra: { feature?: string; path?: string; detail?: Record<string, unknown> } = {}): string {
  const ctx = storage.getStore();
  const requestId = ctx?.requestId ?? newRequestId();
  const described = describeError(error);
  recordNow({
    kind: 'request',
    level: 'error',
    request_id: requestId,
    feature: extra.feature ?? ctx?.feature ?? 'Other',
    name,
    path: extra.path ?? null,
    status: 500,
    user_id: ctx?.userId ?? null,
    message: described.message,
    detail: { stack: described.stack, type: described.type, phase: 'after-response', ...extra.detail },
    weight: 1,
  });
  return requestId;
}
