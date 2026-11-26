/**
 * lib/ops/health.ts
 *
 * Service health for the monitoring dashboard, run every five minutes by
 * /api/cron/ops-health.
 *
 * Two kinds of check:
 *   active   a free, read-only call to the service (list models, list
 *            domains, ping). Costs nothing and proves the key works.
 *   passive  services where every call costs money or needs a person's
 *            account (X API on pay-per-use, Tavily, LinkedIn, Threads...).
 *            Judged from the real calls Forge made in the last 30 minutes.
 *
 * Health checks use the unrecorded fetch, so they never show up as traffic.
 */

import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { clip, rawFetch, recordNow, type OpsEvent } from './recorder';

export type HealthState = 'up' | 'degraded' | 'down' | 'not_configured' | 'idle';

export interface HealthResult {
  name: string;
  state: HealthState;
  mode: 'active' | 'passive' | 'config';
  latencyMs: number | null;
  message: string | null;
}

const TIMEOUT_MS = 8000;

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

async function timed(name: string, run: () => Promise<Response>, ok: (r: Response) => boolean | Promise<boolean> = (r) => r.ok): Promise<HealthResult> {
  const started = performance.now();
  try {
    const res = await run();
    const latency = Math.round(performance.now() - started);
    if (await ok(res))
      return { name, state: latency > 4000 ? 'degraded' : 'up', mode: 'active', latencyMs: latency, message: latency > 4000 ? `Slow: ${latency} ms` : null };
    const body = await res.text().catch(() => '');
    const state: HealthState = res.status === 429 || res.status >= 500 ? 'degraded' : 'down';
    return { name, state, mode: 'active', latencyMs: latency, message: clip(`HTTP ${res.status} ${body.replace(/\s+/g, ' ')}`, 300) };
  } catch (error) {
    return {
      name,
      state: 'down',
      mode: 'active',
      latencyMs: Math.round(performance.now() - started),
      message: clip(networkReason(error), 300),
    };
  }
}

/**
 * "fetch failed" on its own says nothing. Node puts the real reason in
 * `cause`: ENOTFOUND (the host does not exist: wrong URL or deleted
 * database), ECONNREFUSED, a TLS error, or a timeout.
 */
function networkReason(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return `No answer within ${TIMEOUT_MS / 1000} s`;
  const cause = (error as Error & { cause?: { code?: string; message?: string } }).cause;
  const code = cause?.code ?? '';
  let hint = cause?.message ?? error.message;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') hint = 'this address does not exist. Check the URL setting, and that the service or database still exists';
  else if (code === 'ECONNREFUSED') hint = 'the connection was refused';
  else if (code.startsWith('ERR_TLS') || code.includes('CERT')) hint = 'a TLS certificate problem';
  else if (code === 'ERR_INVALID_URL' || /Invalid URL|Failed to parse URL/i.test(`${error.message} ${cause?.message ?? ''}`)) hint = 'the URL setting is not a valid https URL';
  return `Could not connect${code ? ` (${code})` : ''}: ${hint}`;
}

function get(url: string, headers: Record<string, string>): Promise<Response> {
  return rawFetch()(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/** Without these Forge cannot work at all. */
const REQUIRED_ENV = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY'];
/** Without these, parts of Forge break: email links, OAuth, jobs, publishing, shared limits, billing. */
const PRODUCTION_ENV = [
  'NEXT_PUBLIC_APP_URL',
  'CRON_SECRET',
  'FORGE_ENCRYPTION_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'RESEND_API_KEY',
  'RAZORPAY_WEBHOOK_SECRET',
  'X_BEARER_TOKEN',
  'ADMIN_EMAILS',
];
const URL_ENV = ['NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'UPSTASH_REDIS_REST_URL'];

function configCheck(): HealthResult {
  const missing = REQUIRED_ENV.filter((k) => !env(k));
  const missingProd = PRODUCTION_ENV.filter((k) => !env(k));
  if (missing.length > 0) return { name: 'Configuration', state: 'down', mode: 'config', latencyMs: null, message: `Missing: ${missing.join(', ')}` };
  if (missingProd.length > 0)
    return { name: 'Configuration', state: 'degraded', mode: 'config', latencyMs: null, message: `Not set: ${missingProd.join(', ')}` };
  const badUrls = URL_ENV.filter((k) => {
    const v = env(k);
    return v !== null && !/^https?:\/\/[^\s"']+$/.test(v);
  });
  if (badUrls.length > 0) {
    return { name: 'Configuration', state: 'degraded', mode: 'config', latencyMs: null, message: `Not a plain https URL (look for quotes, spaces, or a redis:// address): ${badUrls.join(', ')}` };
  }
  return { name: 'Configuration', state: 'up', mode: 'config', latencyMs: null, message: null };
}

async function activeChecks(): Promise<HealthResult[]> {
  const supabaseUrl = env('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const checks: Array<Promise<HealthResult>> = [];
  const skip = (name: string): Promise<HealthResult> => Promise.resolve({ name, state: 'not_configured', mode: 'active', latencyMs: null, message: null });

  // Database: proves the connection and that the ops migration is applied.
  checks.push(
    (async (): Promise<HealthResult> => {
      if (!supabaseUrl || !serviceKey) return { name: 'Supabase', state: 'not_configured', mode: 'active', latencyMs: null, message: null };
      const started = performance.now();
      const { error } = await createServiceClient().from('ops_events').select('id').limit(1);
      const latency = Math.round(performance.now() - started);
      if (error) return { name: 'Supabase', state: 'down', mode: 'active', latencyMs: latency, message: clip(error.message, 300) };
      return { name: 'Supabase', state: latency > 3000 ? 'degraded' : 'up', mode: 'active', latencyMs: latency, message: null };
    })()
  );
  checks.push(supabaseUrl ? timed('Supabase Auth', () => get(`${supabaseUrl}/auth/v1/health`, { apikey: serviceKey ?? '' })) : skip('Supabase Auth'));
  checks.push(
    supabaseUrl && serviceKey
      ? timed('Supabase Storage', () => get(`${supabaseUrl}/storage/v1/bucket`, { apikey: serviceKey, authorization: `Bearer ${serviceKey}` }))
      : skip('Supabase Storage')
  );

  const anthropic = env('ANTHROPIC_API_KEY');
  checks.push(
    anthropic
      ? timed('Anthropic', () => get('https://api.anthropic.com/v1/models?limit=1', { 'x-api-key': anthropic, 'anthropic-version': '2023-06-01' }))
      : skip('Anthropic')
  );

  const groq = env('GROQ_API_KEY');
  checks.push(groq ? timed('Groq', () => get('https://api.groq.com/openai/v1/models', { authorization: `Bearer ${groq}` })) : skip('Groq'));

  const openai = env('OPENAI_API_KEY');
  checks.push(openai ? timed('OpenAI', () => get('https://api.openai.com/v1/models', { authorization: `Bearer ${openai}` })) : skip('OpenAI'));

  const redisUrl = env('UPSTASH_REDIS_REST_URL');
  const redisToken = env('UPSTASH_REDIS_REST_TOKEN');
  checks.push(
    redisUrl && redisToken
      ? timed(
          'Upstash Redis',
          () => get(`${redisUrl.replace(/\/$/, '')}/ping`, { authorization: `Bearer ${redisToken}` }),
          async (r) => r.ok && /PONG/i.test(await r.clone().text())
        )
      : skip('Upstash Redis')
  );

  const resend = env('RESEND_API_KEY');
  checks.push(resend ? timed('Resend', () => get('https://api.resend.com/domains', { authorization: `Bearer ${resend}` })) : skip('Resend'));

  const rzId = env('RAZORPAY_KEY_ID');
  const rzSecret = env('RAZORPAY_KEY_SECRET');
  checks.push(
    rzId && rzSecret
      ? timed('Razorpay', () =>
          get('https://api.razorpay.com/v1/plans?count=1', { authorization: `Basic ${Buffer.from(`${rzId}:${rzSecret}`).toString('base64')}` })
        )
      : skip('Razorpay')
  );

  return Promise.all(checks);
}

/** Services judged by their real traffic, with the env var that turns each on. */
const PASSIVE: ReadonlyArray<readonly [service: string, envVar: string]> = [
  ['X API', 'X_BEARER_TOKEN'],
  ['Tavily', 'TAVILY_API_KEY'],
  ['LinkedIn', 'LINKEDIN_CLIENT_ID'],
  ['Threads', 'THREADS_APP_ID'],
  ['Bluesky', ''],
  ['GitHub', ''],
  ['Linear', ''],
  ['Notion', ''],
  ['Web Push', 'VAPID_PRIVATE_KEY'],
];

async function passiveChecks(): Promise<HealthResult[]> {
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data } = await createServiceClient()
    .from('ops_events')
    .select('name, level, status, message, at')
    .eq('kind', 'upstream')
    .gte('at', since)
    .in(
      'name',
      PASSIVE.map(([s]) => s)
    )
    .order('at', { ascending: false })
    .limit(2000);
  const rows = data ?? [];

  return PASSIVE.map(([service, envVar]): HealthResult => {
    if (envVar && !env(envVar)) return { name: service, state: 'not_configured', mode: 'passive', latencyMs: null, message: null };
    const calls = rows.filter((r) => r.name === service);
    const failures = calls.filter((r) => r.level === 'error');
    if (calls.length === 0) return { name: service, state: 'idle', mode: 'passive', latencyMs: null, message: 'No calls in the last 30 minutes' };
    const share = failures.length / calls.length;
    const state: HealthState = calls.length >= 3 && share >= 0.5 ? 'down' : share >= 0.2 ? 'degraded' : 'up';
    const message =
      failures.length > 0
        ? `${failures.length} of ${calls.length} calls failed. Last: ${failures[0].status ?? 'network'} ${failures[0].message ?? ''}`.trim()
        : `${calls.length} calls, all fine`;
    return { name: service, state, mode: 'passive', latencyMs: null, message: clip(message, 300) };
  });
}

function levelFor(state: HealthState): OpsEvent['level'] {
  if (state === 'down') return 'error';
  if (state === 'degraded') return 'warn';
  return 'ok';
}

export async function runHealthChecks(): Promise<HealthResult[]> {
  const [active, passive] = await Promise.all([activeChecks(), passiveChecks().catch(() => [] as HealthResult[])]);
  const results = [configCheck(), ...active, ...passive];
  const at = new Date().toISOString();
  recordNow(
    results.map((r) => ({
      at,
      kind: 'health' as const,
      level: levelFor(r.state),
      feature: 'Monitoring',
      name: r.name,
      duration_ms: r.latencyMs,
      message: r.message,
      detail: { state: r.state, mode: r.mode },
    }))
  );
  return results;
}

/** Deletes old rows so the table stays small. */
export async function pruneOpsEvents(): Promise<void> {
  const days = Number.parseInt(process.env.OPS_RETENTION_DAYS ?? '14', 10);
  const keepDays = Number.isFinite(days) && days > 0 ? days : 14;
  const service = createServiceClient();
  const cutoff = new Date(Date.now() - keepDays * 86_400_000).toISOString();
  const errorCutoff = new Date(Date.now() - Math.max(keepDays, 90) * 86_400_000).toISOString();
  await service.from('ops_events').delete().lt('at', cutoff).neq('level', 'error');
  await service.from('ops_events').delete().lt('at', errorCutoff);
}

/**
 * Emails ADMIN_EMAILS when Forge looks broken: many server errors in the
 * last 10 minutes, or an essential service down. At most one email every
 * 30 minutes (the caller enforces that with a shared limit).
 */
export async function alertReasons(results: HealthResult[]): Promise<string[]> {
  const reasons: string[] = [];
  const threshold = Number.parseInt(process.env.OPS_ALERT_ERRORS ?? '10', 10) || 10;
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await createServiceClient()
    .from('ops_events')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'request')
    .eq('level', 'error')
    .gte('at', since);
  if ((count ?? 0) >= threshold) reasons.push(`${count} server errors in the last 10 minutes (alert threshold ${threshold}).`);
  for (const r of results) {
    if (r.state === 'down') reasons.push(`${r.name} is down${r.message ? `: ${r.message}` : '.'}`);
  }
  return reasons;
}

export async function sendAlert(reasons: string[]): Promise<boolean> {
  const key = env('RESEND_API_KEY');
  const to = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  if (!key || to.length === 0 || reasons.length === 0) return false;
  const appUrl = env('NEXT_PUBLIC_APP_URL') ?? '';
  const text = ['Forge monitoring found a problem:', '', ...reasons.map((r) => `- ${r}`), '', `Open the dashboard: ${appUrl}/admin/ops`].join('\n');
  try {
    const res = await rawFetch()('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: 'Forge Monitoring <hello@forgeyourway.dev>', to, subject: `Forge alert: ${reasons[0].slice(0, 80)}`, text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
