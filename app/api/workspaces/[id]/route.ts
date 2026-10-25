/**
 * app/api/workspaces/[id]/route.ts
 *
 * PATCH   rename, change kind or client email (owner), or update the Brand
 *         DNA and writing language (owner or editor)
 * DELETE  delete the workspace and everything scoped to it (owner)
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { HttpError, isUuid, parseJson, requireUser, route } from '@/lib/forge/http';
import { requireFeature } from '@/lib/forge/plan';
import { canWrite, forgetWorkspaceKind, resolveRole, WORKSPACE_COLUMNS } from '@/lib/forge/data/workspace';
import { recordAudit } from '@/lib/forge/data/collab';

type Params = { params: { id: string } };

const PatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    kind: z.enum(['client', 'company']).optional(),
    client_email: z.string().trim().email().max(254).nullable().optional(),
    brand_dna: z.string().trim().max(8000).nullable().optional(),
    writing_language: z.enum(['en', 'hi', 'hinglish']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update.');

const OWNER_ONLY = ['name', 'kind', 'client_email'] as const;

export const PATCH = route('api/workspaces/[id]:patch', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Workspace not found.');
  const ctx = await requireUser(req);
  const patch = await parseJson(req, PatchSchema);
  const service = createServiceClient();

  const membership = await resolveRole(service, ctx.userId, params.id);
  if (!membership) throw new HttpError(404, 'Workspace not found.');
  await requireFeature(membership.ownerId, 'workspaces');
  if (!canWrite(membership.role)) throw new HttpError(403, 'Your role in this workspace is read-only.');
  if (membership.role !== 'owner' && OWNER_ONLY.some((key) => key in patch)) {
    throw new HttpError(403, 'Only the owner can rename the workspace or change its kind and client email.');
  }

  const { data, error } = await service.from('workspaces').update(patch).eq('id', params.id).select(WORKSPACE_COLUMNS).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HttpError(404, 'Workspace not found.');

  if (patch.kind) forgetWorkspaceKind(params.id);
  await recordAudit(params.id, ctx.userId, 'workspace.updated', { type: 'workspace', id: params.id, detail: { fields: Object.keys(patch) } });
  return NextResponse.json({ workspace: { ...data, role: membership.role } });
});

/**
 * Most scoped rows reference the workspace with ON DELETE CASCADE. Chat
 * sessions predate workspaces and hold the id without a foreign key, so they
 * are removed explicitly, for every member, before the workspace row.
 */
const UNREFERENCED_TABLES = ['chat_sessions'] as const;

export const DELETE = route('api/workspaces/[id]:delete', async (req: Request, { params }: Params) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Workspace not found.');
  const ctx = await requireUser(req);
  const service = createServiceClient();

  const { data: workspace } = await service.from('workspaces').select('id, owner_id').eq('id', params.id).maybeSingle();
  if (!workspace || workspace.owner_id !== ctx.userId) throw new HttpError(404, 'Workspace not found.');

  for (const table of UNREFERENCED_TABLES) {
    const { error } = await service.from(table).delete().eq('workspace_id', params.id);
    if (error) throw new Error(`Could not clear ${table}: ${error.message}`);
  }
  await service.from('profiles').update({ active_workspace_id: null }).eq('active_workspace_id', params.id);

  const { error } = await service.from('workspaces').delete().eq('id', params.id);
  if (error) throw new Error(error.message);
  forgetWorkspaceKind(params.id);
  return NextResponse.json({ deleted: true });
});
