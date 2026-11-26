/**
 * lib/ops/fetch-patch.ts
 *
 * Records every call Forge's server makes to an outside service (Anthropic,
 * X, Groq, Resend, Razorpay...) by wrapping the global fetch once at
 * startup (instrumentation.ts). Each call is tied to the request that made
 * it, so a failed grade shows "Anthropic answered 529" right under it.
 *
 * What is stored: the service, host and path (no query string), method,
 * status, time to first byte, and for failures the first 300 characters of
 * the error body. Never request bodies, headers or keys.
 *
 * The database and Redis are called on almost every request, so for those
 * only failures are stored.
 */

import 'server-only';
import { serviceFor } from './features';
import { clip, opsContext, record, setBaseFetch } from './recorder';

const PATCHED = Symbol.for('forge.ops.fetchPatched');

function urlOf(input: RequestInfo | URL): URL | null {
  try {
    if (typeof input === 'string') return new URL(input);
    if (input instanceof URL) return input;
    return new URL(input.url);
  } catch {
    return null;
  }
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input === 'object' && 'method' in input && typeof input.method === 'string') return input.method.toUpperCase();
  return 'GET';
}

async function failureText(response: Response): Promise<string | null> {
  try {
    const text = await response.clone().text();
    return clip(text.replace(/\s+/g, ' ').trim(), 300);
  } catch {
    return null;
  }
}

export function installFetchPatch(): void {
  const current = globalThis.fetch as typeof fetch & { [PATCHED]?: boolean };
  if (!current || current[PATCHED]) return;
  const original = current;
  setBaseFetch(original);

  const patched = async function forgeOpsFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = urlOf(input);
    const service = url ? serviceFor(url) : null;
    if (!url || !service) return original(input, init);

    const started = performance.now();
    const method = methodOf(input, init);
    const ctx = opsContext();
    const feature = ctx?.feature ?? 'Background';
    const path = `${url.host}${url.pathname}`.slice(0, 300);

    try {
      const response = await original(input, init);
      const duration = performance.now() - started;
      const failed = response.status >= 500 || response.status === 429 || (response.status >= 400 && service.mode === 'all');
      if (failed || service.mode === 'all') {
        record({
          kind: 'upstream',
          level: response.status >= 500 || response.status === 429 ? 'error' : response.status >= 400 ? 'warn' : 'ok',
          feature,
          name: service.name,
          method,
          path,
          status: response.status,
          duration_ms: duration,
          message: failed ? await failureText(response) : null,
        });
      }
      return response;
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      record({
        kind: 'upstream',
        level: aborted ? 'warn' : 'error',
        feature,
        name: service.name,
        method,
        path,
        status: null,
        duration_ms: performance.now() - started,
        message: aborted ? 'Cancelled or timed out' : clip(error instanceof Error ? `${error.name}: ${error.message}` : String(error), 300),
        detail: { network: true },
      });
      throw error;
    }
  } as typeof fetch & { [PATCHED]?: boolean };

  // Keep any flags other libraries (including Next.js) put on fetch.
  Object.assign(patched, current);
  patched[PATCHED] = true;
  globalThis.fetch = patched;
}
