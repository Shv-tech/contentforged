/**
 * lib/forge/workspace-request.ts
 *
 * The gate for routes about a workspace itself (members, invitations, the
 * audit trail, the rollup): the caller must belong to it, the owner's plan
 * must include the feature, and some actions need a particular role.
 */

import { HttpError, isUuid, requireUser, type ForgeContext } from './http';
import { requireFeature } from './plan';
import { loadWorkspace, type WorkspaceRef, type WorkspaceRole } from './data/workspace';
import type { FeatureId } from './entitlements';

export async function workspaceRequest(
  req: Request,
  workspaceId: string,
  options: { roles?: WorkspaceRole[]; feature?: FeatureId } = {}
): Promise<{ ctx: ForgeContext; workspace: WorkspaceRef }> {
  if (!isUuid(workspaceId)) throw new HttpError(404, 'Workspace not found.');
  const ctx = await requireUser(req);
  const workspace = await loadWorkspace(ctx.db, ctx.userId, workspaceId);
  if (!workspace) throw new HttpError(404, 'Workspace not found.');
  await requireFeature(workspace.ownerId, options.feature ?? 'workspaces');
  if (options.roles && !options.roles.includes(workspace.role)) {
    throw new HttpError(403, options.roles.length === 1 && options.roles[0] === 'owner' ? 'Only the owner can do that.' : 'Your role in this workspace does not allow that.');
  }
  return { ctx, workspace };
}
