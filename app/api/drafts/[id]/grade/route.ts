/**
 * app/api/drafts/[id]/grade/route.ts
 *
 * Grades a draft's opening with the Stop-Scroll Grader and stores the grade
 * on the draft. Metered against the user's allowance like any generation.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { draftText, updateDraft, loadDraftFor } from '@/lib/forge/data/drafts';
import { gradeOpening } from '@/lib/forge/grader';
import { HttpError, isUuid, requireUser, route } from '@/lib/forge/http';
import { estimateTokens, metered } from '@/lib/forge/metered';
import { calibrationNote } from '@/lib/forge/calibration';

export const POST = route('api/drafts/[id]/grade', async (req: Request, { params }: { params: { id: string } }) => {
  if (!isUuid(params.id)) throw new HttpError(404, 'Draft not found.');
  const ctx = await requireUser(req);
  const { draft } = await loadDraftFor(ctx, params.id, 'write');

  const text = draftText(draft);
  if (!text.trim()) throw new HttpError(400, 'There is nothing to grade yet.');

  const calibration = await calibrationNote(ctx.db, ctx.userId, draft.workspace_id).catch(() => null);

  const grade = await metered(
    { userId: ctx.userId, route: 'draft:grade', maxOutputTokens: 600, estimatedInputTokens: estimateTokens(text) + 900 },
    async () => {
      const result = await gradeOpening({ text, platform: draft.platform, calibration: calibration ?? undefined });
      return { value: result.grade, usage: result.usage };
    }
  );

  const updated = await updateDraft(ctx.db, ctx.userId, draft.id, { grade });
  return NextResponse.json({ draft: updated });
});
