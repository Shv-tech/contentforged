/**
 * app/api/workspaces/route.ts
 *
 * GET   the workspaces the user owns or belongs to, with their role, and
 *       which one is active
 * POST  create a workspace (Agency)
 *
 * A workspace is a separate brand with its own Brand DNA, Story Bank,
 * rules, drafts and connected accounts. The personal brand is the absence of
 * a workspace (null), not a row.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hasFeature } from '@/lib/forge/entitlements';
import { HttpError, parseJson, requireUser, route } from '@/lib/forge/http';
import { requireFeature, resolvePlan } from '@/lib/forge/plan';
import { WORKSPACE_COLUMNS, type WorkspaceRole } from '@/lib/forge/data/workspace';
import { recordAudit } from '@/lib/forge/data/collab';
import { createServiceClient } from '@/lib/supabase/service';

const MAX_WORKSPACES = 50;

interface WorkspaceRow {
  id: string;
  owner_id: string;
  name: string;
  kind: string;
  writing_language: string;
  brand_dna: string | null;
  client_email: string | null;
  created_at: string;
  updated_at: string;
}

export const GET = route('api/workspaces:get', async (req: Request) => {
  const ctx = await requireUser(req);
  const service = createServiceClient();

  const [plan, owned, memberships, profile] = await Promise.all([
    resolvePlan(ctx.userId),
    service.from('workspaces').select(WORKSPACE_COLUMNS).eq('owner_id', ctx.userId).order('created_at', { ascending: true }),
    service.from('workspace_members').select('workspace_id, role').eq('user_id', ctx.userId),
    service.from('profiles').select('active_workspace_id').eq('id', ctx.userId).maybeSingle(),
  ]);
  if (owned.error) throw new Error(owned.error.message);

  const memberRoles = new Map<string, WorkspaceRole>((memberships.data ?? []).map((m: { workspace_id: string; role: WorkspaceRole }) => [m.workspace_id, m.role]));
  const joined = memberRoles.size
    ? await service.from('workspaces').select(WORKSPACE_COLUMNS).in('id', Array.from(memberRoles.keys())).order('created_at', { ascending: true })
    : { data: [] as WorkspaceRow[], error: null };
  if (joined.error) throw new Error(joined.error.message);

  // A joined workspace is usable while its owner's plan includes workspaces.
  const joinedRows = (joined.data ?? []) as WorkspaceRow[];
  const ownerPlans = new Map<string, boolean>();
  for (const ownerId of Array.from(new Set(joinedRows.map((w) => w.owner_id)))) {
    ownerPlans.set(ownerId, hasFeature(await resolvePlan(ownerId), 'workspaces'));
  }

  const workspaces = [
    ...((owned.data ?? []) as WorkspaceRow[]).map((w) => ({ ...w, role: 'owner' as WorkspaceRole })),
    ...joinedRows.filter((w) => ownerPlans.get(w.owner_id)).map((w) => ({ ...w, role: memberRoles.get(w.id) ?? 'reviewer' })),
  ];

  const canCreate = hasFeature(plan, 'workspaces');
  const storedActive = (profile.data?.active_workspace_id as string | null) ?? null;
  const activeId = storedActive && workspaces.some((w) => w.id === storedActive && (w.role !== 'owner' || canCreate)) ? storedActive : null;

  return NextResponse.json({ available: canCreate || workspaces.length > 0, canCreate, activeId, workspaces });
});

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['client', 'company']).default('client'),
  brand_dna: z.string().trim().max(8000).nullish(),
  client_email: z.string().trim().email().max(254).nullish(),
});

export const POST = route('api/workspaces:post', async (req: Request) => {
  const ctx = await requireUser(req);
  await requireFeature(ctx.userId, 'workspaces');
  const input = await parseJson(req, CreateSchema);

  const { count } = await ctx.db.from('workspaces').select('id', { count: 'exact', head: true }).eq('owner_id', ctx.userId);
  if ((count ?? 0) >= MAX_WORKSPACES) throw new HttpError(409, `You can have up to ${MAX_WORKSPACES} workspaces.`);

  const { data, error } = await ctx.db
    .from('workspaces')
    .insert({ owner_id: ctx.userId, name: input.name, kind: input.kind, brand_dna: input.brand_dna ?? null, client_email: input.client_email ?? null })
    .select(WORKSPACE_COLUMNS)
    .single();
  if (error) throw new Error(error.message);

  await recordAudit(data.id, ctx.userId, 'workspace.updated', { type: 'workspace', id: data.id, detail: { created: true, kind: input.kind } });
  return NextResponse.json({ workspace: { ...data, role: 'owner' } }, { status: 201 });
});
