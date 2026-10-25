/**
 * lib/forge/grade-cards.ts
 *
 * Shared grade cards: the public record behind "my hook scored 44/50" links.
 * Read with the service client because cards are public by design and the
 * table has no anonymous read policy; only these columns are ever exposed.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { isUuid } from './http';
import type { GradeDimension } from './types';

export interface GradeCard {
  id: string;
  hook: string;
  score: number;
  verdict: string;
  breakdown: GradeDimension[];
  createdAt: string;
}

export async function loadGradeCard(id: string): Promise<GradeCard | null> {
  if (!isUuid(id)) return null;
  const { data } = await createServiceClient().from('grade_cards').select('id, hook, score, verdict, breakdown, created_at').eq('id', id).maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    hook: data.hook,
    score: data.score,
    verdict: data.verdict,
    breakdown: Array.isArray(data.breakdown) ? (data.breakdown as GradeDimension[]) : [],
    createdAt: data.created_at,
  };
}
