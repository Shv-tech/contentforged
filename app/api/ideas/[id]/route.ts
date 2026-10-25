/**
 * app/api/ideas/[id]/route.ts
 *
 * PATCH  { status }  dismiss an idea, or bring it back
 * POST   { platform, kind }  write it now: one draft, in voice, graded
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { brandRequest } from '@/lib/forge/brand-request';
import { createDraft } from '@/lib/forge/data/drafts';
import { recordVersion } from '@/lib/forge/data/collab';
import { markStoriesUsed } from '@/lib/forge/data/stories';
import { scopeRows } from '@/lib/forge/data/workspace';
import { track } from '@/lib/forge/events';
import { gradeOpening } from '@/lib/forge/grader';
import { HttpError, isUuid, parseJson, route } from '@/lib/forge/http';
import { IDEA_COLUMNS, storiesForIdea, type IdeaRecord } from '@/lib/forge/ideas';
import { estimateTokens, metered } from '@/lib/forge/metered';
import { DRAFT_PLATFORMS } from '@/lib/forge/types';
import { estimateWriteTokens, loadBrandContext, writePost } from '@/lib/forge/writer';
import type { SupabaseClient } from '@supabase/supabase-js';

type Params = { params: { id: string } };

async function loadIdea(db: SupabaseClient, userId: string, workspaceId: string | null, id: string): Promise<IdeaRecord> {
  if (!isUuid(id)) throw new HttpError(404, 'Idea not found.');
  const query = db.from('ideas').select(IDEA_COLUMNS).eq('id', id);
  const { data } = await scopeRows(query, userId, workspaceId).maybeSingle();
  if (!data) throw new HttpError(404, 'Idea not found.');
  return data as IdeaRecord;
}

export const PATCH = route('api/ideas/[id]:patch', async (req: Request, { params }: Params) => {
  const { status } = await parseJson(req, z.object({ status: z.enum(['open', 'dismissed']) }));
  const { ctx, workspaceId } = await brandRequest(req, { write: true });
  const idea = await loadIdea(ctx.db, ctx.userId, workspaceId, params.id);
  const { data, error } = await ctx.db.from('ideas').update({ status }).eq('id', idea.id).select(IDEA_COLUMNS).single();
  if (error) throw new Error(error.message);
  return NextResponse.json({ idea: data });
});

const DraftSchema = z.object({
  platform: z.enum(DRAFT_PLATFORMS),
  kind: z.enum(['post', 'thread', 'carousel']).default('post'),
});

export const POST = route('api/ideas/[id]:post', async (req: Request, { params }: Params) => {
  const input = await parseJson(req, DraftSchema);
  const { ctx, workspace, workspaceId } = await brandRequest(req, { write: true });
  const idea = await loadIdea(ctx.db, ctx.userId, workspaceId, params.id);

  const [context, stories] = await Promise.all([loadBrandContext(ctx.db, ctx.userId, workspace), storiesForIdea(ctx.db, ctx.userId, workspaceId, idea)]);
  const request = { angle: idea.rationale ? `${idea.angle}\n(Why: ${idea.rationale})` : idea.angle, platform: input.platform, kind: input.kind, stories };

  const written = await metered(
    { userId: ctx.userId, route: 'idea:write', maxOutputTokens: 2400, estimatedInputTokens: estimateWriteTokens(context, request) },
    async () => {
      const result = await writePost(context, request);
      return { value: result.draft, usage: result.usage };
    }
  );
  const text = written.segments.length > 0 ? written.segments.join('\n\n') : written.body;
  const grade = await metered({ userId: ctx.userId, route: 'idea:grade', maxOutputTokens: 600, estimatedInputTokens: estimateTokens(text) + 900 }, async () => {
    const result = await gradeOpening({ text, platform: input.platform });
    return { value: result.grade, usage: result.usage };
  }).catch(() => null);

  const draft = await createDraft(ctx.db, ctx.userId, workspaceId, {
    platform: written.platform,
    kind: written.kind,
    body: written.body,
    segments: written.segments,
    title: written.title,
    notes: written.missingFacts.length > 0 ? `Fill in before posting: ${written.missingFacts.join('; ')}.` : null,
    grade,
    ideaId: idea.id,
    captureId: idea.capture_id,
    language: context.language,
  });

  await Promise.all([
    ctx.db.from('ideas').update({ status: 'drafted', draft_id: draft.id }).eq('id', idea.id),
    markStoriesUsed(ctx.db, ctx.userId, written.storyIdsUsed, workspaceId).catch(() => undefined),
    recordVersion(ctx.db, { draft, userId: ctx.userId, reason: 'created' }).catch(() => undefined),
    track(ctx.userId, 'idea.drafted', { source: idea.source, platform: input.platform }),
  ]);
  return NextResponse.json({ draft }, { status: 201 });
});
