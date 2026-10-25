/**
 * app/api/formats/extract/route.ts
 *
 * POST { draftId }  propose a shareable structure from one of your posts,
 *      with every personal fact removed. Nothing is published until the
 *      author reviews it and posts to /api/formats.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadDraftFor } from '@/lib/forge/data/drafts';
import { draftText } from '@/lib/forge/draft-text';
import { extractFormat } from '@/lib/forge/formats';
import { parseJson, requireUser, route } from '@/lib/forge/http';
import { estimateTokens, metered } from '@/lib/forge/metered';
import { requireFeature } from '@/lib/forge/plan';

const Schema = z.object({ draftId: z.string().uuid() });

export const POST = route('api/formats/extract', async (req: Request) => {
  const input = await parseJson(req, Schema);
  const ctx = await requireUser(req);
  await requireFeature(ctx.userId, 'formats');
  const { draft } = await loadDraftFor(ctx, input.draftId, 'write');

  const proposal = await metered(
    { userId: ctx.userId, route: 'formats:extract', maxOutputTokens: 1200, estimatedInputTokens: estimateTokens(draftText(draft)) + 500 },
    async () => {
      const result = await extractFormat(draft);
      return { value: result.proposal, usage: result.usage };
    }
  );
  return NextResponse.json({ proposal, example: draftText(draft) });
});
