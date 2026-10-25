/**
 * lib/forge/plan.ts
 *
 * Server-side plan resolution for feature gates.
 *
 * Reads through get_quota_status, the same SECURITY DEFINER function the
 * billing page uses, so lapsed-plan fallback and grace windows are decided in
 * exactly one place. The client's plan value is a display cache and is never
 * trusted for a gate.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { isPlanId, type PlanId } from '@/lib/billing/plans';
import { FEATURE_MIN_PLAN, hasFeature, upsellLine, type FeatureId } from './entitlements';
import { HttpError } from './http';

export async function resolvePlan(userId: string): Promise<PlanId> {
  try {
    const { data } = await createServiceClient().rpc('get_quota_status', { p_user_id: userId });
    const row = Array.isArray(data) ? data[0] : data;
    return isPlanId(row?.plan_id) ? row.plan_id : 'free';
  } catch (error) {
    console.error('[forge/plan] get_quota_status failed; treating as free:', error);
    return 'free';
  }
}

/** Throws a 402 with calm upsell copy when the plan does not include `feature`. */
export async function requireFeature(userId: string, feature: FeatureId): Promise<PlanId> {
  const plan = await resolvePlan(userId);
  if (!hasFeature(plan, feature)) {
    throw new HttpError(402, upsellLine(feature), { requiredPlan: FEATURE_MIN_PLAN[feature], feature });
  }
  return plan;
}

/**
 * Feature gate for work done inside a brand. A workspace's features come
 * from its owner's plan, so a member on Free can publish for an Agency
 * client; the personal brand uses the caller's own plan.
 */
export async function requireBrandFeature(userId: string, workspaceId: string | null, feature: FeatureId): Promise<PlanId> {
  if (!workspaceId) return requireFeature(userId, feature);
  const { data } = await createServiceClient().from('workspaces').select('owner_id').eq('id', workspaceId).maybeSingle();
  return requireFeature((data?.owner_id as string | undefined) ?? userId, feature);
}
