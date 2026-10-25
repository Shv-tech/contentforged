/**
 * app/api/invites/[token]/route.ts
 *
 * GET   what an invitation is for (workspace, inviter, role), so the
 *       invite page can say it before anyone signs in
 * POST  accept it, as the signed-in account with the invited email
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { acceptInvite, inviteByToken } from '@/lib/forge/data/members';
import { HttpError, requireUser, route } from '@/lib/forge/http';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/forge/data/workspace';

type Params = { params: { token: string } };

export const GET = route('api/invites/[token]:get', async (_req: Request, { params }: Params) => {
  const invite = await inviteByToken(params.token);
  if (!invite) throw new HttpError(404, 'This invitation does not exist.');
  return NextResponse.json({
    invite: {
      workspaceName: invite.workspaceName,
      inviterName: invite.inviterName,
      email: invite.email,
      role: invite.role,
      roleLabel: ROLE_LABELS[invite.role],
      roleDescription: ROLE_DESCRIPTIONS[invite.role],
      expired: invite.expired,
      accepted: invite.accepted,
    },
  });
});

export const POST = route('api/invites/[token]:post', async (req: Request, { params }: Params) => {
  const ctx = await requireUser(req);
  const result = await acceptInvite(params.token, { id: ctx.userId, email: ctx.email });
  return NextResponse.json(result);
});
