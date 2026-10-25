/**
 * app/api/workspaces/[id]/audit/route.ts
 *
 * GET  ?before=<id>  the workspace's activity, newest first: who drafted,
 *      edited, approved, scheduled and published what, and who joined.
 *      Owners and editors only.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { listAudit, peopleNamed } from '@/lib/forge/data/collab';
import { route } from '@/lib/forge/http';
import { workspaceRequest } from '@/lib/forge/workspace-request';

export const GET = route('api/workspaces/[id]/audit', async (req: Request, { params }: { params: { id: string } }) => {
  const { ctx, workspace } = await workspaceRequest(req, params.id, { roles: ['owner', 'editor'] });
  const before = Number(new URL(req.url).searchParams.get('before') ?? '') || undefined;
  const events = await listAudit(ctx.db, workspace.id, before);
  const people = await peopleNamed(events.map((e) => e.user_id).filter((id): id is string => Boolean(id)));
  return NextResponse.json({ events, people: Object.fromEntries(Object.entries(people).map(([id, p]) => [id, p.name])), nextBefore: events.length === 60 ? events[events.length - 1].id : null });
});
