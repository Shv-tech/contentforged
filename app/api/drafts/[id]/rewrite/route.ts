/**
 * app/api/drafts/[id]/rewrite/route.ts
 *
 * Rewrites a selected span of a draft (punchier, shorter, more like me, make
 * it true) and returns the replacement. The card applies it and saves the
 * draft with origin "assist", so Forge's own edits never train the user's
 * rules.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { REWRITE_MODES, rewriteSpan } from '@/lib/forge/assist';
import { draftText, loadDraftFor } from '@/lib/forge/data/drafts';
import { HttpError, isUuid, parseJson, requireUser, route } from '@/lib/forge/http';
import { estimateTokens, metered } from '@/lib/forge/metered';

const BodySchema = z.object({
  span: z.string().min(1).max(4000),
  mode: z.enum(REWRITE_MODES),
});

export const POST = route('api/drafts/[id]/rewrite', async (req: Request, { params }: { params: { id: string } }) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Draft not found.');
  const ctx = await requireUser(req);
  const { span, mode } = await parseJson(req, BodySchema);
  const { draft } = await loadDraftFor(ctx, params.id, 'write');

  const text = draftText(draft);
  if (!text.includes(span)) throw new HttpError(409, 'That text is no longer in the draft. Select it again.');

  const result = await metered(
    { userId: ctx.userId, route: `draft:rewrite:${mode}`, maxOutputTokens: 500, estimatedInputTokens: estimateTokens(text) + 1500 },
    async () => {
      const r = await rewriteSpan(ctx.db, ctx.userId, draft.workspace_id, { text, span, mode, platform: draft.platform });
      return { value: { replacement: r.replacement, note: r.note }, usage: r.usage };
    }
  );

  return NextResponse.json(result);
});
