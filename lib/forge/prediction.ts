/**
 * lib/forge/prediction.ts
 *
 * A prediction before posting: how this draft is likely to do against the
 * author's own usual, with a range, and how often Forge's past ranges for
 * this author turned out right.
 *
 * THE MODEL
 *
 * Similarity-weighted neighbours over the author's own posted history. Each
 * past post on the same platform is weighted by how alike it is to the
 * draft: opening type, length, format, time of day, how it ends, whether it
 * links out, and its grade. The expected result is the weighted geometric
 * mean of their relative engagement; the range is the weighted 20th to 80th
 * percentile. With fewer than MIN_BASIS comparable posts there is no
 * prediction, and the card says so.
 *
 * Deliberately simple and inspectable: every number traces back to posts the
 * author can see. A bigger model trained across users would hide that, and
 * the honest error rate is the point.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { draftText } from './draft-text';
import { classifyHook, type HookType } from './hooks';
import { computePlaybook, loadPostedPosts, type ScoredPost } from './playbook';
import type { DraftKind, DraftPlatform, DraftRecord } from './types';

export const MIN_BASIS = 6;
const MODEL_ID = 'neighbours-v1';

export interface DraftFeatures {
  hook: HookType;
  length: 'short' | 'medium' | 'long' | 'very_long';
  kind: DraftKind;
  daypart: 'night' | 'morning' | 'afternoon' | 'evening' | null;
  endsWithQuestion: boolean;
  hasLink: boolean;
  grade: number | null;
}

export interface Prediction {
  expected: number;
  low: number;
  high: number;
  basisCount: number;
  model: string;
  features: DraftFeatures;
}

export interface PredictionRecord {
  draft_id: string;
  platform: string;
  expected: number;
  low: number;
  high: number;
  basis_count: number;
  actual: number | null;
  landed: boolean | null;
  evaluated_at: string | null;
  created_at: string;
}

export interface HitRate {
  evaluated: number;
  landed: number;
  rate: number | null;
}

function lengthBucket(n: number): DraftFeatures['length'] {
  if (n < 280) return 'short';
  if (n < 700) return 'medium';
  if (n < 1300) return 'long';
  return 'very_long';
}

function daypartOf(iso: string | null, timeZone: string): DraftFeatures['daypart'] {
  if (!iso) return null;
  let hour: number;
  try {
    hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(new Date(iso)));
  } catch {
    hour = new Date(iso).getUTCHours();
  }
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function featuresOf(draft: Pick<DraftRecord, 'body' | 'segments' | 'kind' | 'grade' | 'scheduled_for' | 'posted_at'> & { suggested_for?: string | null }, timeZone: string): DraftFeatures {
  const text = draftText(draft as DraftRecord);
  return {
    hook: classifyHook(text),
    length: lengthBucket(text.length),
    kind: draft.kind,
    daypart: daypartOf(draft.posted_at ?? draft.scheduled_for ?? draft.suggested_for ?? null, timeZone),
    endsWithQuestion: /\?\s*$/.test(text.trim()),
    hasLink: /https?:\/\//.test(text),
    grade: draft.grade?.score ?? null,
  };
}

/** Distance between two posts' features; 0 is identical. */
function distance(a: DraftFeatures, b: DraftFeatures): number {
  let d = 0;
  if (a.hook !== b.hook) d += 1;
  if (a.length !== b.length) d += 0.7;
  if (a.kind !== b.kind) d += 0.8;
  if (a.daypart && b.daypart && a.daypart !== b.daypart) d += 0.5;
  if (a.endsWithQuestion !== b.endsWithQuestion) d += 0.3;
  if (a.hasLink !== b.hasLink) d += 0.6;
  if (a.grade !== null && b.grade !== null) d += Math.abs(a.grade - b.grade) / 10;
  return d;
}

function weightedQuantile(values: Array<{ value: number; weight: number }>, q: number): number {
  const sorted = [...values].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, v) => sum + v.weight, 0);
  let cumulative = 0;
  for (const entry of sorted) {
    cumulative += entry.weight;
    if (cumulative / total >= q) return entry.value;
  }
  return sorted[sorted.length - 1]?.value ?? 0;
}

/** Predicts from already-scored history. Pure, so it can be tested and reused. */
export function predictFrom(scored: ScoredPost[], platform: DraftPlatform, features: DraftFeatures, timeZone: string, excludeDraftId?: string): Prediction | null {
  const history = scored.filter((post) => post.draft.platform === platform && post.draft.id !== excludeDraftId && post.relative > 0);
  if (history.length < MIN_BASIS) return null;

  const neighbours = history.map((post) => {
    const d = distance(features, featuresOf(post.draft, timeZone));
    return { value: Math.log(post.relative), weight: Math.exp(-d) };
  });

  const totalWeight = neighbours.reduce((sum, n) => sum + n.weight, 0);
  if (totalWeight <= 0) return null;
  const mean = neighbours.reduce((sum, n) => sum + n.value * n.weight, 0) / totalWeight;

  const round = (v: number) => Math.round(v * 100) / 100;
  const low = Math.exp(Math.min(weightedQuantile(neighbours, 0.2), mean));
  const high = Math.exp(Math.max(weightedQuantile(neighbours, 0.8), mean));

  return { expected: round(Math.exp(mean)), low: round(low), high: round(high), basisCount: history.length, model: MODEL_ID, features };
}

/** The prediction for a draft right now, from the author's current history. */
export async function predictDraft(db: SupabaseClient, draft: DraftRecord, timeZone: string): Promise<Prediction | null> {
  const posts = await loadPostedPosts(db, draft.user_id, draft.workspace_id, 300);
  const { scored } = computePlaybook(posts, timeZone);
  return predictFrom(scored, draft.platform, featuresOf(draft, timeZone), timeZone, draft.id);
}

/**
 * Freezes the prediction a draft carried when it went out, so it can be
 * judged later against what actually happened.
 */
export async function savePrediction(draft: DraftRecord, prediction: Prediction): Promise<void> {
  const { error } = await createServiceClient()
    .from('predictions')
    .upsert(
      {
        user_id: draft.user_id,
        workspace_id: draft.workspace_id,
        draft_id: draft.id,
        platform: draft.platform,
        expected: prediction.expected,
        low: prediction.low,
        high: prediction.high,
        basis_count: prediction.basisCount,
        model: prediction.model,
        features: prediction.features,
        actual: null,
        landed: null,
        evaluated_at: null,
      },
      { onConflict: 'draft_id' }
    );
  if (error) console.error('[forge/prediction] could not save:', error.message);
}

/**
 * Judges a posted draft's prediction against its results, once there are
 * results at least a day old. Safe to call repeatedly; the latest numbers win.
 */
export async function evaluatePrediction(db: SupabaseClient, draft: DraftRecord, timeZone: string): Promise<void> {
  if (!draft.posted_at || Date.now() - new Date(draft.posted_at).getTime() < 20 * 3_600_000) return;
  const service = createServiceClient();
  const { data: prediction } = await service.from('predictions').select('low, high').eq('draft_id', draft.id).maybeSingle();
  if (!prediction) return;

  const posts = await loadPostedPosts(db, draft.user_id, draft.workspace_id, 300);
  const actual = computePlaybook(posts, timeZone).scored.find((post) => post.draft.id === draft.id);
  if (!actual) return;

  const value = Math.round(actual.relative * 100) / 100;
  await service
    .from('predictions')
    .update({ actual: value, landed: value >= Number(prediction.low) && value <= Number(prediction.high), evaluated_at: new Date().toISOString() })
    .eq('draft_id', draft.id);
}

/** How often this brand's ranges were right, over the last 50 judged posts. */
export async function hitRate(db: SupabaseClient, userId: string, workspaceId: string | null): Promise<HitRate> {
  let query = db.from('predictions').select('landed').not('landed', 'is', null);
  query = workspaceId ? query.eq('workspace_id', workspaceId) : query.eq('user_id', userId).is('workspace_id', null);
  const { data } = await query.order('evaluated_at', { ascending: false }).limit(50);
  const rows = (data ?? []) as Array<{ landed: boolean }>;
  const landed = rows.filter((row) => row.landed).length;
  return { evaluated: rows.length, landed, rate: rows.length >= 5 ? landed / rows.length : null };
}

export { describeRange } from './prediction-format';
