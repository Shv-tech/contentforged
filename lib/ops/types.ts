/**
 * lib/ops/types.ts
 *
 * Shapes shared by the monitoring API and the /admin/ops page. No server
 * code here, so the page can import it.
 */

export type OpsWindow = '15m' | '1h' | '24h' | '7d';
export type Status = 'ok' | 'issues' | 'degraded' | 'down' | 'quiet' | 'not_configured' | 'idle';

export interface SeriesPoint {
  bucket: string;
  requests: number;
  errors: number;
  warnings: number;
  client_errors: number;
  upstream_failures: number;
  p95: number | null;
}

export interface FeatureRow {
  feature: string;
  status: Status;
  requests: number;
  errors: number;
  warnings: number;
  clientErrors: number;
  errorRate: number;
  p95: number | null;
  lastErrorAt: string | null;
  lastError: string | null;
  /** [bucket, requests, errors] */
  spark: Array<[string, number, number]>;
}

export interface ServiceRow {
  name: string;
  status: Status;
  check: 'active' | 'passive' | 'config' | 'traffic';
  checkedAt: string | null;
  checkLatencyMs: number | null;
  checkMessage: string | null;
  calls: number;
  failures: number;
  p95: number | null;
  lastFailureAt: string | null;
  lastFailure: string | null;
  /** [time, level] for the last 24 hours of checks */
  history: Array<[string, 'ok' | 'warn' | 'error']>;
}

export interface JobRow {
  name: string;
  status: Status;
  everyMinutes: number | null;
  lastRunAt: string | null;
  lastStatus: number | null;
  lastDurationMs: number | null;
  runs: number;
  failures: number;
  lastError: string | null;
  late: boolean;
}

export interface RouteRow {
  name: string;
  feature: string;
  requests: number;
  errors: number;
  warnings: number;
  p50: number | null;
  p95: number | null;
}

export interface OpsSummary {
  window: OpsWindow;
  since: string;
  bucketSeconds: number;
  generatedAt: string;
  overall: { status: Status; reasons: string[] };
  totals: {
    requests: number;
    errors: number;
    warnings: number;
    errorRate: number;
    p50: number | null;
    p95: number | null;
    users: number;
    clientErrors: number;
    upstreamCalls: number;
    upstreamFailures: number;
  };
  series: SeriesPoint[];
  features: FeatureRow[];
  services: ServiceRow[];
  jobs: JobRow[];
  routes: RouteRow[];
  /** False until the ops migration is applied. */
  ready: boolean;
  setupMessage: string | null;
}

export interface OpsEventRow {
  id: number;
  at: string;
  kind: 'request' | 'upstream' | 'client' | 'health';
  level: 'ok' | 'warn' | 'error';
  request_id: string | null;
  feature: string;
  name: string;
  method: string | null;
  path: string | null;
  status: number | null;
  duration_ms: number | null;
  user_id: string | null;
  message: string | null;
  detail: Record<string, unknown>;
}

export const WINDOWS: Record<OpsWindow, { label: string; minutes: number; bucketSeconds: number }> = {
  '15m': { label: '15 min', minutes: 15, bucketSeconds: 30 },
  '1h': { label: '1 hour', minutes: 60, bucketSeconds: 60 },
  '24h': { label: '24 hours', minutes: 1440, bucketSeconds: 1800 },
  '7d': { label: '7 days', minutes: 10080, bucketSeconds: 21600 },
};
