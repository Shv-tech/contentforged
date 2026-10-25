/**
 * app/api/workspaces/[id]/members/route.ts
 *
 * GET   everyone in the workspace with their role, and open invitations
 * POST  { email, role }  invite someone (owner or editor). The link is
 *       emailed and also returned, so it can be sent another way.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { inviteMember, listMembers } from '@/lib/forge/data/members';
import { MEMBER_ROLES } from '@/lib/forge/data/workspace';
import { track } from '@/lib/forge/events';
import { HttpError, parseJson, route } from '@/lib/forge/http';
import { workspaceRequest } from '@/lib/forge/workspace-request';

type Params = { params: { id: string } };

export const GET = route('api/workspaces/[id]/members:get', async (req: Request, { params }: Params) => {
  const { workspace } = await workspaceRequest(req, params.id);
  const result = await listMembers(workspace.id);
  // Invitations, which carry other people's email addresses, are for
  // those who can manage the team.
  return NextResponse.json({ ...result, invites: workspace.role === 'owner' || workspace.role === 'editor' ? result.invites : [], role: workspace.role });
});

const InviteSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(MEMBER_ROLES),
});

export const POST = route('api/workspaces/[id]/members:post', async (req: Request, { params }: Params) => {
  const input = await parseJson(req, InviteSchema);
  const { ctx, workspace } = await workspaceRequest(req, params.id, { roles: ['owner', 'editor'], feature: 'members' });
  if (input.email.toLowerCase() === ctx.email.toLowerCase()) throw new HttpError(400, 'You are already in this workspace.');

  const result = await inviteMember({ workspaceId: workspace.id, workspaceName: workspace.name, inviterId: ctx.userId, inviterName: ctx.name, email: input.email, role: input.role });
  await track(ctx.userId, 'member.invited', { role: input.role });
  return NextResponse.json(result, { status: 201 });
});
