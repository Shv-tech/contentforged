/**
 * app/api/workspaces/[id]/members/[userId]/route.ts
 *
 * PATCH   { role }  change a member's role (owner)
 * DELETE  remove a member (owner), or leave (yourself)
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { changeRole, removeMember } from '@/lib/forge/data/members';
import { MEMBER_ROLES } from '@/lib/forge/data/workspace';
import { HttpError, isUuid, parseJson, route } from '@/lib/forge/http';
import { workspaceRequest } from '@/lib/forge/workspace-request';

type Params = { params: { id: string; userId: string } };

export const PATCH = route('api/workspaces/[id]/members/[userId]:patch', async (req: Request, { params }: Params) => {
  if (!isUuid(params.userId)) throw new HttpError(404, 'Member not found.');
  const { role } = await parseJson(req, z.object({ role: z.enum(MEMBER_ROLES) }));
  const { ctx, workspace } = await workspaceRequest(req, params.id, { roles: ['owner'] });
  if (params.userId === workspace.ownerId) throw new HttpError(400, 'The owner’s role cannot change.');
  await changeRole(workspace.id, ctx.userId, params.userId, role);
  return NextResponse.json({ updated: true });
});

export const DELETE = route('api/workspaces/[id]/members/[userId]:delete', async (req: Request, { params }: Params) => {
  if (!isUuid(params.userId)) throw new HttpError(404, 'Member not found.');
  const { ctx, workspace } = await workspaceRequest(req, params.id);
  const leaving = params.userId === ctx.userId;
  if (params.userId === workspace.ownerId) throw new HttpError(400, 'The owner cannot leave. Delete the workspace instead.');
  if (!leaving && workspace.role !== 'owner') throw new HttpError(403, 'Only the owner can remove people.');
  await removeMember(workspace.id, ctx.userId, params.userId);
  return NextResponse.json({ removed: true });
});
