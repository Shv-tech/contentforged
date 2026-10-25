/**
 * app/api/workspaces/[id]/invites/[inviteId]/route.ts
 *
 * DELETE  withdraw an invitation that has not been accepted
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { revokeInvite } from '@/lib/forge/data/members';
import { HttpError, isUuid, route } from '@/lib/forge/http';
import { workspaceRequest } from '@/lib/forge/workspace-request';

export const DELETE = route('api/workspaces/[id]/invites/[inviteId]', async (req: Request, { params }: { params: { id: string; inviteId: string } }) => {
  if (!isUuid(params.inviteId)) throw new HttpError(404, 'Invitation not found.');
  const { workspace } = await workspaceRequest(req, params.id, { roles: ['owner', 'editor'] });
  await revokeInvite(workspace.id, params.inviteId);
  return NextResponse.json({ revoked: true });
});
