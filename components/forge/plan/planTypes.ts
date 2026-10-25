/**
 * Shapes the weekly plan screens share, as /api/plan returns them.
 */

import type { HitRate } from '@/lib/forge/prediction';
import type { DraftPlatform, DraftRecord } from '@/lib/forge/types';
import type { PlanRecord, PlanSettings } from '@/lib/forge/weekly-plan';
import type { PredictionLike } from '@/components/forge/drafts/PredictionChip';

export type { HitRate, PlanRecord, PlanSettings };

export interface PlanResponse {
  settings: PlanSettings;
  maxGoal: number;
  timezone: string;
  plan: PlanRecord | null;
  drafts: DraftRecord[];
  predictions: Record<string, PredictionLike | null>;
  hitRate: HitRate;
  paused: boolean;
  nextPlanAt: string;
}

/** Platforms that can publish without the person, once connected. X never does. */
export const SELF_PUBLISHING: ReadonlySet<DraftPlatform> = new Set(['linkedin', 'threads', 'bluesky']);

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export function slotLabel(iso: string | null, timeZone: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, { timeZone, weekday: 'short', hour: 'numeric', minute: '2-digit' });
}
