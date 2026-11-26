/**
 * lib/ops/summary.ts
 *
 * Builds what /admin/ops shows from public.ops_summary() and the events
 * table, and decides the status words (healthy, some errors, degraded,
 * down) from the numbers.
 */

import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { FEATURES, JOB_INTERVALS, SERVICES } from './features';
import {
  WINDOWS,
  type FeatureRow,
  type JobRow,
  type OpsEventRow,
  type OpsSummary,
  type OpsWindow,
  type RouteRow,
  type SeriesPoint,
  type ServiceRow,
  type Status,
} from './types';

type Raw = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) || 0 : 0);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Math.round(num(v)));
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Services whose outage means Forge itself is down. */
const ESSENTIAL = new Set(['Configuration', 'Supabase', 'Supabase Auth', 'Anthropic']);

function featureStatus(requests: number, errors: number, lastErrorAt: string | null): Status {
  if (requests === 0) return 'quiet';
  const rate = errors / requests;
  if (errors >= 3 && rate >= 0.25) return 'down';
  if ((rate >= 0.05 && errors >= 2) || rate >= 0.5) return 'degraded';
  if (errors > 0) {
    // An old error in a long window is "some errors"; a fresh one is worth more attention.
    const fresh = lastErrorAt && Date.now() - Date.parse(lastErrorAt) < 15 * 60_000;
    return fresh ? 'degraded' : 'issues';
  }
  return 'ok';
}

function stateToStatus(state: unknown, level: unknown): Status {
  switch (state) {
    case 'up':
      return 'ok';
    case 'degraded':
      return 'degraded';
    case 'down':
      return 'down';
    case 'not_configured':
      return 'not_configured';
    case 'idle':
      return 'idle';
    default:
      return level === 'error' ? 'down' : level === 'warn' ? 'degraded' : 'ok';
  }
}

function emptySummary(window: OpsWindow, since: string, message: string): OpsSummary {
  return {
    window,
    since,
    bucketSeconds: WINDOWS[window].bucketSeconds,
    generatedAt: new Date().toISOString(),
    overall: { status: 'quiet', reasons: [message] },
    totals: { requests: 0, errors: 0, warnings: 0, errorRate: 0, p50: null, p95: null, users: 0, clientErrors: 0, upstreamCalls: 0, upstreamFailures: 0 },
    series: [],
    features: [],
    services: [],
    jobs: [],
    routes: [],
    ready: false,
    setupMessage: message,
  };
}

export async function buildOpsSummary(window: OpsWindow): Promise<OpsSummary> {
  const spec = WINDOWS[window];
  const since = new Date(Date.now() - spec.minutes * 60_000);
  // Align the window to whole buckets so bars do not shift between refreshes.
  since.setTime(Math.floor(since.getTime() / (spec.bucketSeconds * 1000)) * spec.bucketSeconds * 1000);
  const sinceIso = since.toISOString();

  const { data, error } = await createServiceClient().rpc('ops_summary', { p_since: sinceIso, p_bucket: `${spec.bucketSeconds} seconds` });
  if (error || !data) {
    const missing = error && /ops_summary|ops_events|does not exist|schema cache/i.test(error.message);
    return emptySummary(
      window,
      sinceIso,
      missing
        ? 'Monitoring is not set up yet: apply supabase/migrations/20261126000000_forge_ops.sql.'
        : `Could not load monitoring data: ${error?.message ?? 'no data'}`
    );
  }
  const raw = data as Raw;
  const t = (raw.totals ?? {}) as Raw;

  // Fill empty buckets so the chart has a bar slot for every interval.
  const byBucket = new Map<number, SeriesPoint>();
  for (const p of (raw.series as Raw[]) ?? []) {
    const key = Date.parse(String(p.bucket));
    byBucket.set(key, {
      bucket: new Date(key).toISOString(),
      requests: num(p.requests),
      errors: num(p.errors),
      warnings: num(p.warnings),
      client_errors: num(p.client_errors),
      upstream_failures: num(p.upstream_failures),
      p95: numOrNull(p.p95),
    });
  }
  const series: SeriesPoint[] = [];
  for (let at = since.getTime(); at <= Date.now(); at += spec.bucketSeconds * 1000) {
    series.push(
      byBucket.get(at) ?? { bucket: new Date(at).toISOString(), requests: 0, errors: 0, warnings: 0, client_errors: 0, upstream_failures: 0, p95: null }
    );
  }

  const clientByFeature = (raw.feature_client_errors ?? {}) as Record<string, number>;
  const sparkByFeature = (raw.feature_series ?? {}) as Record<string, Array<[string, number, number]>>;
  const featureRows = new Map<string, FeatureRow>();
  for (const f of (raw.features as Raw[]) ?? []) {
    const name = String(f.feature);
    const requests = num(f.requests);
    const errors = num(f.errors);
    const lastErrorAt = str(f.last_error_at);
    featureRows.set(name, {
      feature: name,
      status: featureStatus(requests, errors, lastErrorAt),
      requests,
      errors,
      warnings: num(f.warnings),
      clientErrors: num(clientByFeature[name]),
      errorRate: requests > 0 ? errors / requests : 0,
      p95: numOrNull(f.p95),
      lastErrorAt,
      lastError: str(f.last_error),
      spark: (sparkByFeature[name] ?? []).map(([b, r, e]) => [String(b), num(r), num(e)]),
    });
  }
  for (const name of [...FEATURES, ...Object.keys(clientByFeature)]) {
    if (!featureRows.has(name) && !['Pages', 'Other', 'Website'].includes(name)) {
      const clientErrors = num(clientByFeature[name]);
      featureRows.set(name, {
        feature: name,
        status: clientErrors > 0 ? 'issues' : 'quiet',
        requests: 0,
        errors: 0,
        warnings: 0,
        clientErrors,
        errorRate: 0,
        p95: null,
        lastErrorAt: null,
        lastError: null,
        spark: [],
      });
    } else if (featureRows.has(name) && num(clientByFeature[name]) > 0) {
      const row = featureRows.get(name)!;
      row.clientErrors = num(clientByFeature[name]);
      if (row.status === 'ok' || row.status === 'quiet') row.status = 'issues';
    }
  }
  const rank: Record<Status, number> = { down: 0, degraded: 1, issues: 2, ok: 3, idle: 4, quiet: 5, not_configured: 6 };
  const features = Array.from(featureRows.values()).sort(
    (a, b) => rank[a.status] - rank[b.status] || b.requests - a.requests || a.feature.localeCompare(b.feature)
  );

  const health = new Map<string, Raw>();
  for (const h of (raw.health as Raw[]) ?? []) health.set(String(h.name), h);
  const traffic = new Map<string, Raw>();
  for (const s of (raw.services as Raw[]) ?? []) traffic.set(String(s.name), s);
  const history = (raw.health_history ?? {}) as Record<string, Array<[string, 'ok' | 'warn' | 'error']>>;
  const serviceNames = Array.from(
    new Set(['Configuration', 'Supabase', 'Supabase Auth', 'Supabase Storage', ...SERVICES, ...health.keys(), ...traffic.keys()])
  );
  const services: ServiceRow[] = serviceNames.map((name) => {
    const h = health.get(name);
    const u = traffic.get(name);
    const detail = (h?.detail ?? {}) as Raw;
    const calls = num(u?.calls);
    const failures = num(u?.failures);
    let status: Status = h
      ? stateToStatus(detail.state, h.level)
      : calls > 0
        ? failures / calls >= 0.5 && failures >= 3
          ? 'down'
          : failures > 0
            ? 'issues'
            : 'ok'
        : 'idle';
    if (status === 'ok' && failures > 0) status = 'issues';
    return {
      name,
      status,
      check: h ? ((detail.mode as ServiceRow['check']) ?? 'active') : 'traffic',
      checkedAt: str(h?.at),
      checkLatencyMs: numOrNull(h?.duration_ms),
      checkMessage: str(h?.message),
      calls,
      failures,
      p95: numOrNull(u?.p95),
      lastFailureAt: str(u?.last_failure_at),
      lastFailure: str(u?.last_failure),
      history: history[name] ?? [],
    };
  });
  services.sort((a, b) => rank[a.status] - rank[b.status] || b.calls - a.calls || a.name.localeCompare(b.name));

  const jobRows = new Map<string, Raw>();
  for (const j of (raw.jobs as Raw[]) ?? []) jobRows.set(String(j.name), j);
  const jobs: JobRow[] = Array.from(new Set([...Object.keys(JOB_INTERVALS), ...jobRows.keys()])).map((name) => {
    const j = jobRows.get(name);
    const every = JOB_INTERVALS[name] ?? null;
    const lastRunAt = str(j?.last_run_at);
    const late = every !== null && (!lastRunAt || Date.now() - Date.parse(lastRunAt) > every * 2 * 60_000 + 5 * 60_000);
    const lastStatus = j ? numOrNull(j.last_status) : null;
    const status: Status = !j ? 'idle' : lastStatus !== null && lastStatus >= 500 ? 'down' : late ? 'degraded' : num(j.failures) > 0 ? 'issues' : 'ok';
    return {
      name,
      status,
      everyMinutes: every,
      lastRunAt,
      lastStatus,
      lastDurationMs: j ? numOrNull(j.last_duration_ms) : null,
      runs: num(j?.runs),
      failures: num(j?.failures),
      lastError: str(j?.last_error),
      late: Boolean(j) && late,
    };
  });

  const routes: RouteRow[] = ((raw.routes as Raw[]) ?? []).map((r) => ({
    name: String(r.name),
    feature: String(r.feature),
    requests: num(r.requests),
    errors: num(r.errors),
    warnings: num(r.warnings),
    p50: numOrNull(r.p50),
    p95: numOrNull(r.p95),
  }));

  const requests = num(t.requests);
  const errors = num(t.errors);
  const errorRate = requests > 0 ? errors / requests : 0;

  // Overall: the worst of essential services, error rate, and late jobs.
  const reasons: string[] = [];
  let overall: Status = requests === 0 && health.size === 0 ? 'quiet' : 'ok';
  const bump = (s: Status, reason: string) => {
    reasons.push(reason);
    if (rank[s] < rank[overall]) overall = s;
  };
  for (const s of services) {
    if (s.status === 'down') bump(ESSENTIAL.has(s.name) ? 'down' : 'degraded', `${s.name} is down${s.checkMessage ? `: ${s.checkMessage}` : ''}`);
    else if (s.status === 'degraded') bump('degraded', `${s.name} is degraded${s.checkMessage ? `: ${s.checkMessage}` : ''}`);
  }
  if (requests >= 20 && errorRate >= 0.25) bump('down', `${Math.round(errorRate * 100)}% of requests are failing`);
  else if (requests >= 20 && errorRate >= 0.05) bump('degraded', `${Math.round(errorRate * 100)}% of requests are failing`);
  for (const f of features) {
    if (f.status === 'down' || f.status === 'degraded') {
      bump('degraded', `${f.feature}: ${f.errors} of ${Math.round(f.requests)} requests failed${f.lastError ? `. Last: ${f.lastError}` : ''}`);
    }
  }
  for (const j of jobs) {
    const job = j.name.replace('api/cron/', '');
    if (j.status === 'down') bump('degraded', `Scheduled job ${job} failed on its last run${j.lastError ? `: ${j.lastError}` : ''}`);
    else if (j.late) bump('degraded', `Scheduled job ${job} has not run on time`);
  }
  if (!health.size) reasons.push('No health checks in the last hour. Schedule /api/cron/ops-health every 5 minutes, or press "Check now".');

  return {
    window,
    since: sinceIso,
    bucketSeconds: spec.bucketSeconds,
    generatedAt: new Date().toISOString(),
    overall: { status: overall, reasons },
    totals: {
      requests,
      errors,
      warnings: num(t.warnings),
      errorRate,
      p50: numOrNull(t.p50),
      p95: numOrNull(t.p95),
      users: num(t.users),
      clientErrors: num(t.client_errors),
      upstreamCalls: num(t.upstream_calls),
      upstreamFailures: num(t.upstream_failures),
    },
    series,
    features,
    services,
    jobs,
    routes,
    ready: true,
    setupMessage: null,
  };
}

const EVENT_COLUMNS = 'id, at, kind, level, request_id, feature, name, method, path, status, duration_ms, user_id, message, detail';

export interface FeedQuery {
  level: 'errors' | 'problems' | 'all';
  kind: 'all' | 'request' | 'client' | 'upstream' | 'health';
  feature: string | null;
  search: string | null;
  before: number | null;
  limit: number;
}

export async function listOpsEvents(q: FeedQuery): Promise<OpsEventRow[]> {
  let query = createServiceClient()
    .from('ops_events')
    .select(EVENT_COLUMNS)
    .order('id', { ascending: false })
    .limit(Math.min(Math.max(q.limit, 1), 200));
  if (q.level === 'errors') query = query.eq('level', 'error');
  else if (q.level === 'problems') query = query.neq('level', 'ok');
  if (q.kind !== 'all') query = query.eq('kind', q.kind);
  else query = query.neq('kind', 'health');
  if (q.feature) query = query.eq('feature', q.feature);
  if (q.before) query = query.lt('id', q.before);
  if (q.search) {
    const s = q.search
      .trim()
      .replace(/[%,()]/g, ' ')
      .slice(0, 100);
    if (/^r_[0-9a-f]{6,}$/i.test(s)) query = query.eq('request_id', s);
    else if (/^[0-9a-f-]{36}$/i.test(s)) query = query.eq('user_id', s);
    else query = query.or(`message.ilike.%${s}%,name.ilike.%${s}%,path.ilike.%${s}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as OpsEventRow[];
}

/** Everything recorded for one request: the request itself, its outside calls, and browser reports quoting it. */
export async function traceRequest(reference: string): Promise<OpsEventRow[]> {
  const ref = reference.trim().slice(0, 60);
  const service = createServiceClient();
  const byId = await service.from('ops_events').select(EVENT_COLUMNS).eq('request_id', ref).order('id', { ascending: true }).limit(300);
  if (byId.error) throw byId.error;
  if ((byId.data ?? []).length > 0) return byId.data as OpsEventRow[];
  // A page crash shows a Next.js digest instead of a request id.
  const byDigest = await service.from('ops_events').select(EVENT_COLUMNS).eq('detail->>digest', ref).order('id', { ascending: true }).limit(50);
  if (byDigest.error) throw byDigest.error;
  return (byDigest.data ?? []) as OpsEventRow[];
}
