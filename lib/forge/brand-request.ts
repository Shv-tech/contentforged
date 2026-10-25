/**
 * lib/forge/brand-request.ts
 *
 * The opening lines of nearly every brand-scoped route, in one place: who is
 * asking, which brand they are acting for, whether their role there lets
 * them change things, and whether the brand's plan includes the feature.
 */

import { getActiveWorkspace, loadWorkspace, requireWrite, type WorkspaceRef } from './data/workspace';
import type { FeatureId } from './entitlements';
import { HttpError, requireUser, type ForgeContext } from './http';
import { requireBrandFeature } from './plan';
import type { PlanId } from '@/lib/billing/plans';

export interface BrandRequest {
  ctx: ForgeContext;
  workspace: WorkspaceRef | null;
  workspaceId: string | null;
  plan: PlanId | null;
}

export async function brandRequest(req: Request, options: { write?: boolean; feature?: FeatureId } = {}): Promise<BrandRequest> {
  const ctx = await requireUser(req);
  const workspace = await resolveBrand(ctx);
  if (options.write) requireWrite(workspace);
  const plan = options.feature ? await requireBrandFeature(ctx.userId, workspace?.id ?? null, options.feature) : null;
  return { ctx, workspace, workspaceId: workspace?.id ?? null, plan };
}

/**
 * The brand a request acts for: an API key's pinned workspace when it has
 * one (checked against current membership), else the workspace active in
 * the app.
 */
export async function resolveBrand(ctx: ForgeContext): Promise<WorkspaceRef | null> {
  if (!ctx.workspacePin) return getActiveWorkspace(ctx.db, ctx.userId);
  const workspace = await loadWorkspace(ctx.db, ctx.userId, ctx.workspacePin);
  if (!workspace) throw new HttpError(403, 'This API key is pinned to a workspace you no longer belong to.');
  return workspace;
}
