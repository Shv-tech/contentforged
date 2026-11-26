'use client';

/**
 * components/ops/OpsReporter.tsx
 *
 * Mounted once in the root layout. Reports to the monitoring dashboard:
 *   - JavaScript errors and unhandled promise rejections on any page
 *   - calls to Forge's own /api that fail with a server error (500 and up,
 *     including platform timeouts the server never got to log) or never
 *     reach the server at all
 *
 * Ignores noise that is not Forge's: browser extensions, cross-origin
 * "Script error.", ResizeObserver warnings, and requests the page itself
 * cancelled.
 */

import { useEffect } from 'react';
import { reportClientError, setReportFetch } from './report';

const NOISE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-(web-)?extension:\/\//i,
  /Non-Error promise rejection captured/i,
];

function isNoise(message: string, stack?: string | null): boolean {
  return NOISE.some((pattern) => pattern.test(message) || (stack ? pattern.test(stack) : false));
}

const WRAPPED = Symbol.for('forge.ops.clientFetch');

export function OpsReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const message = event.message || (event.error instanceof Error ? event.error.message : 'Unknown error');
      const stack = event.error instanceof Error ? (event.error.stack ?? null) : null;
      if (isNoise(message, stack) || (event.filename && !event.filename.startsWith(window.location.origin))) return;
      reportClientError({ type: 'error', message, stack });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      const message = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'Unhandled rejection';
      const stack = reason instanceof Error ? (reason.stack ?? null) : null;
      if (isNoise(message, stack)) return;
      reportClientError({ type: 'unhandledrejection', message, stack });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    const current = window.fetch as typeof fetch & { [WRAPPED]?: boolean };
    let restore: (() => void) | null = null;
    if (!current[WRAPPED]) {
      const original = current;
      setReportFetch(original);
      const wrapped = async function forgeClientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        let url: URL | null = null;
        try {
          url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
        } catch {
          url = null;
        }
        const ours =
          url !== null &&
          url.origin === window.location.origin &&
          url.pathname.startsWith('/api/') &&
          url.pathname !== '/api/ops/client' &&
          url.pathname !== '/api/events';
        if (!ours) return original(input, init);
        try {
          const response = await original(input, init);
          if (response.status >= 500) {
            let message = `HTTP ${response.status}`;
            try {
              const body = (await response.clone().json()) as { error?: unknown };
              if (typeof body?.error === 'string') message = body.error;
            } catch {
              // Not JSON (for example a platform timeout page).
            }
            reportClientError({ type: 'fetch', message, api: url!.pathname, status: response.status, reference: response.headers.get('x-request-id') });
          }
          return response;
        } catch (error) {
          const aborted = (error instanceof DOMException && error.name === 'AbortError') || init?.signal?.aborted;
          if (!aborted && navigator.onLine !== false) {
            reportClientError({
              type: 'fetch',
              message: error instanceof Error ? `Network: ${error.message}` : 'Network error',
              api: url!.pathname,
              status: 0,
            });
          }
          throw error;
        }
      } as typeof fetch & { [WRAPPED]?: boolean };
      wrapped[WRAPPED] = true;
      window.fetch = wrapped;
      restore = () => {
        if (window.fetch === wrapped) window.fetch = original;
      };
    }

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      restore?.();
    };
  }, []);

  return null;
}
