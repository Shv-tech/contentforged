'use client';

/**
 * components/ops/report.ts
 *
 * Sends a browser error to /api/ops/client for the monitoring dashboard.
 * Never throws, never awaited, at most 15 reports per page load, and the
 * same error is reported once.
 */

export interface ClientReport {
  type: 'error' | 'unhandledrejection' | 'fetch' | 'boundary';
  message: string;
  stack?: string | null;
  api?: string | null;
  status?: number | null;
  reference?: string | null;
  digest?: string | null;
}

const ENDPOINT = '/api/ops/client';
const MAX_REPORTS = 15;
const seen = new Set<string>();
let sent = 0;

/** Set by OpsReporter before it wraps fetch, so reporting never reports itself. */
let send: typeof fetch | null = null;
export function setReportFetch(f: typeof fetch): void {
  send = f;
}

export function reportClientError(report: ClientReport): void {
  try {
    if (typeof window === 'undefined' || sent >= MAX_REPORTS) return;
    const key = `${report.type}|${report.message}|${report.api ?? ''}|${report.status ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    sent += 1;
    const body = JSON.stringify({
      ...report,
      message: report.message.slice(0, 1000),
      stack: report.stack ? report.stack.slice(0, 6000) : null,
      page: window.location.pathname,
    });
    void (send ?? window.fetch)(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => undefined);
  } catch {
    // Reporting must never break the page.
  }
}
