/**
 * lib/forge/insights.ts
 *
 * The internal view of how Forge is actually used, built only from product
 * events (lib/forge/events.ts): counts of people and actions, never content.
 *
 * It answers the questions the roadmap rests on. Do people who capture
 * stories keep posting? How much of each draft do they rewrite? Is the
 * weekly plan approved or skipped? Who comes back in week two?
 */

import { createServiceClient } from '@/lib/supabase/service';
import { HttpError, type ForgeContext } from './http';

/** People allowed to see /admin, from ADMIN_EMAILS (comma separated). */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

/**
 * Admin pages and their APIs. Signed in with a browser session (never an
 * API key), an address listed in ADMIN_EMAILS, and that address confirmed:
 * without the last check, someone could sign up with an admin's address
 * before the admin does and walk in. Everyone else gets a plain 404.
 */
export function requireAdmin(ctx: ForgeContext): void {
  if (ctx.via !== 'session' || !ctx.emailVerified || !isAdmin(ctx.email)) throw new HttpError(404, 'Not found.');
}

/** The path from first visit to a published post, in order. */
export const FUNNEL: ReadonlyArray<{ event: string; label: string }> = [
  { event: 'session.started', label: 'Opened Forge' },
  { event: 'capture.created', label: 'Captured something' },
  { event: 'proposal.kept', label: 'Kept a story' },
  { event: 'draft.created', label: 'Got a draft' },
  { event: 'draft.edited', label: 'Edited a draft' },
  { event: 'draft.approved', label: 'Approved a draft' },
  { event: 'draft.published', label: 'Published' },
];

export interface Insights {
  days: number;
  generatedAt: string;
  active: { day: string; users: number }[];
  totals: { users: number; events: number };
  funnel: { label: string; users: number }[];
  features: { feature: string; users: number }[];
  draftOrigins: { origin: string; events: number }[];
  editDepth: { bucket: string; events: number }[];
  plan: { generated: number; approved: number; skipped: number };
  captureSources: { source: string; events: number }[];
  retention: { cohort: string; size: number; weeks: number[] }[];
  events: { name: string; users: number; events: number }[];
}

type Row = Record<string, unknown>;

async function rpc(name: string, args: Record<string, unknown>): Promise<Row[]> {
  const { data, error } = await createServiceClient().rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return (data ?? []) as Row[];
}

const n = (value: unknown) => Number(value ?? 0);

export async function buildInsights(days: number): Promise<Insights> {
  const window = Math.max(1, Math.min(180, Math.round(days)));
  const [daily, reach, features, origins, edits, captures, retention] = await Promise.all([
    rpc('forge_insights_daily', { p_days: window }),
    rpc('forge_insights_reach', { p_days: window }),
    rpc('forge_insights_prop', { p_days: window, p_name: 'feature.opened', p_key: 'feature' }),
    rpc('forge_insights_prop', { p_days: window, p_name: 'draft.created', p_key: 'origin' }),
    rpc('forge_insights_prop', { p_days: window, p_name: 'draft.edited', p_key: 'changed' }),
    rpc('forge_insights_prop', { p_days: window, p_name: 'capture.created', p_key: 'source' }),
    rpc('forge_insights_retention', { p_weeks: 8 }),
  ]);

  const reachByName = new Map(reach.map((r) => [String(r.name), n(r.users)]));

  const activeByDay = new Map<string, number>();
  const byName = new Map<string, { users: number; events: number }>();
  for (const row of daily) {
    const day = String(row.day);
    if (row.name === 'session.started') activeByDay.set(day, n(row.users));
    const entry = byName.get(String(row.name)) ?? { users: 0, events: 0 };
    entry.events += n(row.events);
    byName.set(String(row.name), entry);
  }
  const active: Insights['active'] = [];
  for (let i = window - 1; i >= 0; i -= 1) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    active.push({ day, users: activeByDay.get(day) ?? 0 });
  }

  // Edit depth in four readable bands rather than a hundred values.
  const bands = [
    { bucket: 'Light touch (under 10%)', max: 0.1 },
    { bucket: 'Some edits (10 to 30%)', max: 0.3 },
    { bucket: 'Heavy (30 to 60%)', max: 0.6 },
    { bucket: 'Rewritten (over 60%)', max: 1.01 },
  ].map((band) => ({ ...band, events: 0 }));
  for (const row of edits) {
    const share = Number(row.value);
    if (!Number.isFinite(share)) continue;
    const band = bands.find((b) => share < b.max) ?? bands[bands.length - 1];
    band.events += n(row.events);
  }

  const cohorts = new Map<string, number[]>();
  for (const row of retention) {
    const cohort = String(row.cohort);
    const weeks = cohorts.get(cohort) ?? [];
    weeks[n(row.week)] = n(row.users);
    cohorts.set(cohort, weeks);
  }

  return {
    days: window,
    generatedAt: new Date().toISOString(),
    active,
    totals: { users: reachByName.get('session.started') ?? 0, events: Array.from(byName.values()).reduce((sum, e) => sum + e.events, 0) },
    funnel: FUNNEL.map((step) => ({ label: step.label, users: reachByName.get(step.event) ?? 0 })),
    features: features.map((r) => ({ feature: String(r.value), users: n(r.users) })).sort((a, b) => b.users - a.users),
    draftOrigins: origins.map((r) => ({ origin: String(r.value), events: n(r.events) })),
    editDepth: bands.map(({ bucket, events }) => ({ bucket, events })),
    plan: {
      generated: byName.get('plan.generated')?.events ?? 0,
      approved: byName.get('draft.approved')?.events ?? 0,
      skipped: byName.get('draft.skipped')?.events ?? 0,
    },
    captureSources: captures.map((r) => ({ source: String(r.value), events: n(r.events) })),
    retention: Array.from(cohorts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cohort, weeks]) => ({ cohort, size: weeks[0] ?? 0, weeks: Array.from({ length: weeks.length }, (_, i) => weeks[i] ?? 0) })),
    events: Array.from(byName.entries())
      .map(([name, value]) => ({ name, users: reachByName.get(name) ?? 0, events: value.events }))
      .sort((a, b) => b.events - a.events),
  };
}
