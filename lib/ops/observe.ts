/**
 * lib/ops/observe.ts
 *
 * Wraps a route handler so every call is recorded: route, feature, status,
 * time taken, who, and for failures the error and stack. Adds an
 * "x-request-id" header to every response, so a reference a person reads
 * off an error message leads straight to the log entry.
 *
 * `route()` in lib/forge/http.ts uses this, so most routes get it for free.
 * Handlers that do not use `route()` (redirects, webhooks, streams) wrap
 * themselves with `observed()`.
 */

import 'server-only';
import { featureFor } from './features';
import { describeError, flush, newRequestId, runWithOps, successSampleRate, type OpsContext, type OpsLevel } from './recorder';

/** Successful calls to these are not stored: the dashboard polls them every few seconds. */
const QUIET_WHEN_OK = ['/api/admin/ops', '/api/health'];

export function levelFor(status: number): OpsLevel {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  return 'ok';
}

function setHeader(response: Response, requestId: string): Response {
  try {
    response.headers.set('x-request-id', requestId);
    return response;
  } catch {
    // Some responses (Response.redirect) have immutable headers.
    return response;
  }
}

/** Reads the "error" field of a JSON error response without consuming the body the client gets. */
async function errorMessageOf(response: Response): Promise<string | null> {
  if (response.status < 400) return null;
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) return null;
  try {
    const body = (await response.clone().json()) as { error?: unknown };
    return typeof body?.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}

export async function observe(name: string, req: Request | null, handler: (ctx: OpsContext) => Promise<Response>): Promise<Response> {
  let path = '';
  try {
    path = req ? new URL(req.url).pathname : '';
  } catch {
    path = '';
  }
  const ctx: OpsContext = { requestId: newRequestId(), feature: featureFor(path || `/${name}`), userId: null, buffer: [], error: null };
  const started = performance.now();

  return runWithOps(ctx, async () => {
    let response: Response;
    try {
      response = await handler(ctx);
    } catch (error) {
      // An unhandled throw: Next.js will answer 500. Record it, then rethrow
      // so behaviour is exactly what it was before monitoring existed.
      ctx.error = error;
      const described = describeError(error);
      flush(ctx, {
        kind: 'request',
        level: 'error',
        request_id: ctx.requestId,
        feature: ctx.feature,
        name,
        method: req?.method ?? null,
        path,
        status: 500,
        duration_ms: performance.now() - started,
        message: described.message,
        detail: { stack: described.stack, type: described.type, unhandled: true },
      });
      throw error;
    }

    const duration = performance.now() - started;
    const status = response.status;
    const level = levelFor(status);
    const sample = level === 'ok' ? successSampleRate() : 1;
    const quiet = level === 'ok' && QUIET_WHEN_OK.some((prefix) => path.startsWith(prefix));
    const keep = !quiet && (level !== 'ok' || ctx.buffer.length > 0 || Math.random() < sample);

    let message: string | null = null;
    let detail: Record<string, unknown> = {};
    if (ctx.error) {
      const described = describeError(ctx.error);
      message = described.message;
      detail = { stack: described.stack, type: described.type };
    } else if (level !== 'ok') {
      message = await errorMessageOf(response);
    }

    flush(
      ctx,
      keep
        ? {
            kind: 'request',
            level,
            request_id: ctx.requestId,
            feature: ctx.feature,
            name,
            method: req?.method ?? null,
            path,
            status,
            duration_ms: duration,
            message,
            detail,
            weight: level === 'ok' ? 1 / sample : 1,
          }
        : null
    );
    return setHeader(response, ctx.requestId);
  });
}

/** For handlers that do not use route(): records them without changing what they return. */
export function observed<Args extends unknown[]>(name: string, handler: (...args: Args) => Promise<Response>): (...args: Args) => Promise<Response> {
  return (...args: Args) => {
    const req = args[0] instanceof Request ? args[0] : null;
    return observe(name, req, () => handler(...args));
  };
}
