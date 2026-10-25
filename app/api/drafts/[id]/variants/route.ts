/**
 * app/api/drafts/[id]/variants/route.ts
 *
 * Three alternative opening lines for a draft, each graded, best first.
 * Nothing is saved; the user picks one and the card applies it as an edit.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { hookVariants } from '@/lib/forge/assist';
import { draftText, loadDraftFor } from '@/lib/forge/data/drafts';
import { HttpError, isUuid, requireUser, route } from '@/lib/forge/http';
import { estimateTokens, metered } from '@/lib/forge/metered';

export const POST = route('api/drafts/[id]/variants', async (req: Request, { params }: { params: { id: string } }) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Draft not found.');
  const ctx = await requireUser(req);
  const { draft } = await loadDraftFor(ctx, params.id, 'write');

  const text = draftText(draft);
  if (!text.trim()) throw new HttpError(400, 'Write something first.');

  const variants = await metered(
    { userId: ctx.userId, route: 'draft:variants', maxOutputTokens: 2400, estimatedInputTokens: estimateTokens(text) * 4 + 3000 },
    async () => {
      const result = await hookVariants(ctx.db, ctx.userId, draft.workspace_id, { text, platform: draft.platform });
      return { value: result.variants, usage: result.usage };
    }
  );

  return NextResponse.json({ variants });
});
