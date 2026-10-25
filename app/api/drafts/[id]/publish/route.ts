/**
 * app/api/drafts/[id]/publish/route.ts
 *
 * POST  publish a draft to its connected platform (LinkedIn, Threads or
 *       Bluesky) and link it to the live post. X is not published from
 *       here: Forge opens X's own composer instead, so the user presses Post
 *       and no write access to their account is ever needed.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { loadDraftFor } from '@/lib/forge/data/drafts';
import { HttpError, isUuid, requireUser, route } from '@/lib/forge/http';
import { requireBrandFeature } from '@/lib/forge/plan';
import { publishDraft } from '@/lib/forge/publishing';
import { PlatformError } from '@/lib/platforms/http';

export const POST = route('api/drafts/[id]/publish', async (req: Request, { params }: { params: { id: string } }) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Draft not found.');
  const ctx = await requireUser(req);
  const { draft } = await loadDraftFor(ctx, params.id, 'write');
  await requireBrandFeature(ctx.userId, draft.workspace_id, 'publishing');
  if (draft.status === 'posted') throw new HttpError(409, 'This draft is already posted.');
  if (draft.approval_status === 'pending') throw new HttpError(409, 'This draft is waiting for your client to approve it.');
  if (draft.approval_status === 'changes_requested')
    throw new HttpError(409, 'Your client asked for changes to this draft. Edit it and send it for approval again.');

  try {
    const updated = await publishDraft(ctx.db, ctx.userId, draft);
    return NextResponse.json({ draft: updated });
  } catch (error) {
    if (error instanceof PlatformError) {
      throw new HttpError(error.status === 401 ? 409 : error.status, error.message, { reconnect: error.reconnect });
    }
    throw error;
  }
});
