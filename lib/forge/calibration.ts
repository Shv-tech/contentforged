/**
 * lib/forge/calibration.ts
 *
 * Per-user grader calibration, read from the Playbook.
 *
 * The grader starts generic. Once someone has posted enough graded drafts
 * with results attached, their own history says how far to trust the score,
 * and that note is passed to the grader so its judgement shifts toward what
 * actually works for them.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { cacheGet, cacheSet } from './cache';
import { calibrate, loadPostedPosts, scorePosts } from './playbook';

const TTL_SECONDS = 1800;

interface CalibrationSnapshot {
  note: string | null;
  scoredGrades: Array<{ score: number; percentile: number }>;
}

async function snapshot(db: SupabaseClient, userId: string, workspaceId: string | null): Promise<CalibrationSnapshot> {
  const key = `calibration:${userId}:${workspaceId ?? 'personal'}`;
  const hit = await cacheGet<CalibrationSnapshot>(key);
  if (hit) return hit;

  const scored = scorePosts(await loadPostedPosts(db, userId, workspaceId, 200));
  const value: CalibrationSnapshot = {
    note: calibrate(scored).note,
    scoredGrades: scored.filter((p) => p.draft.grade).map((p) => ({ score: p.draft.grade!.score, percentile: p.percentile })),
  };
  await cacheSet(key, value, TTL_SECONDS);
  return value;
}

export async function calibrationNote(db: SupabaseClient, userId: string, workspaceId: string | null): Promise<string | null> {
  return (await snapshot(db, userId, workspaceId)).note;
}

/**
 * "Predicted: top 30% of your posts", from where this grade would rank among
 * the user's own graded, posted drafts. Null until there are enough of them.
 */
export async function predictedRank(db: SupabaseClient, userId: string, workspaceId: string | null, score: number): Promise<number | null> {
  const { scoredGrades } = await snapshot(db, userId, workspaceId);
  if (scoredGrades.length < 6) return null;
  const below = scoredGrades.filter((g) => g.score < score).length;
  return below / scoredGrades.length;
}
