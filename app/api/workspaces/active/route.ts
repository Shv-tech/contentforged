/**
 * app/api/workspaces/active/route.ts
 *
 * POST { id: string | null }  switch the brand the app acts for.
 *
 * Any workspace the user owns or belongs to can be made active, provided
 * its owner's plan includes workspaces. Written with the service client
 * after the membership check, because the profiles update policy is
 * narrower than this one column needs.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { HttpError, parseJson, requireUser, route } from '@/lib/forge/http';
import { requireFeature } from '@/lib/forge/plan';
import { resolveRole } from '@/lib/forge/data/workspace';

const BodySchema = z.object({ id: z.string().uuid().nullable() });

export const POST = route('api/workspaces/active:post', async (req: Request) => {
  const ctx = await requireUser(req);
  const { id } = await parseJson(req, BodySchema);
  const service = createServiceClient();

  if (id) {
    const membership = await resolveRole(service, ctx.userId, id);
    if (!membership) throw new HttpError(404, 'Workspace not found.');
    await requireFeature(membership.ownerId, 'workspaces');
  }

  const { error } = await service.from('profiles').update({ active_workspace_id: id }).eq('id', ctx.userId);
  if (error) throw new Error(error.message);
  return NextResponse.json({ activeId: id });
});
