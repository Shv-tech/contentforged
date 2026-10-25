/**
 * lib/forge/outcomes.ts
 *
 * What happens when a post goes out, and when its results come back.
 *
 *   Posted:   freeze the prediction it carried, so it can be judged later.
 *   Results:  judge that prediction, and update the experiment it belongs
 *             to, if any. Tell the author, once, when a post did far better
 *             than usual or an experiment reached an answer.
 *
 * Both are best-effort: a failure here is logged and never fails the
 * publish or the metrics write that triggered it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DRAFT_COLUMNS } from './data/drafts';
import { draftText } from './draft-text';
import { evaluateExperiment } from './experiments';
import { notifyExperimentResult, notifyStandoutPost, STANDOUT_RESULT } from './notify';
import { evaluatePrediction, predictDraft, savePrediction } from './prediction';
import { firstLine, truncate } from './text';
import { timezoneOf } from './profile';
import type { DraftRecord } from './types';

export async function afterPosted(db: SupabaseClient, draft: DraftRecord): Promise<void> {
  try {
    const timezone = await timezoneOf(draft.user_id);
    const prediction = await predictDraft(db, draft, timezone);
    if (prediction) await savePrediction(draft, prediction);
  } catch (error) {
    console.error('[forge/outcomes] freezing the prediction failed:', error);
  }
}

export async function afterResults(db: SupabaseClient, draftId: string): Promise<void> {
  try {
    const { data } = await db.from('drafts').select(DRAFT_COLUMNS).eq('id', draftId).maybeSingle();
    if (!data) return;
    const draft = data as DraftRecord;
    const timezone = await timezoneOf(draft.user_id);
    await evaluatePrediction(db, draft, timezone);
    await tellAboutStandout(db, draft);
    if (draft.experiment_id) {
      // evaluateExperiment only judges running experiments, so "complete" here is the moment it finished.
      const experiment = await evaluateExperiment(db, draft.experiment_id, timezone);
      if (experiment?.status === 'complete' && experiment.result) {
        await notifyExperimentResult({ userId: experiment.user_id, summary: experiment.result.summary, armA: experiment.arm_a, armB: experiment.arm_b });
      }
    }
  } catch (error) {
    console.error('[forge/outcomes] evaluating results failed:', error);
  }
}

/** A post that did far better than usual, once its result is in. Claims the notification first so it is sent once. */
async function tellAboutStandout(db: SupabaseClient, draft: DraftRecord): Promise<void> {
  const { data: claimed } = await db
    .from('predictions')
    .update({ notified_at: new Date().toISOString() })
    .eq('draft_id', draft.id)
    .is('notified_at', null)
    .gte('actual', STANDOUT_RESULT)
    .select('actual')
    .maybeSingle();
  if (!claimed) return;
  await notifyStandoutPost({ userId: draft.user_id, draftId: draft.id, relative: Number(claimed.actual), opening: truncate(firstLine(draftText(draft)), 120) });
}

