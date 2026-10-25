/**
 * app/api/extension/queue/route.ts
 *
 * GET  ?platform=x  approved, unposted drafts for one platform, soonest
 *      first, for the extension's "Fill composer" button.
 * POST { draftId }  record that a draft was placed in a composer.
 *
 * Filling a composer is something the person does with a click; the person
 * still presses Post on the platform. Nothing here publishes anything.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DRAFT_COLUMNS, loadDraftFor, updateDraft } from '@/lib/forge/data/drafts';
import { getActiveWorkspace, scopeRows } from '@/lib/forge/data/workspace';
import { draftText } from '@/lib/forge/draft-text';
import { track } from '@/lib/forge/events';
import { HttpError, parseJson, requireUser, route } from '@/lib/forge/http';
import { DRAFT_PLATFORMS, isDraftPlatform, type DraftRecord } from '@/lib/forge/types';

export const GET = route('api/extension/queue:get', async (req: Request) => {
  const ctx = await requireUser(req);
  const platform = new URL(req.url).searchParams.get('platform');
  if (!isDraftPlatform(platform)) throw new HttpError(400, `platform must be one of ${DRAFT_PLATFORMS.join(', ')}.`);
  const workspace = await getActiveWorkspace(ctx.db, ctx.userId);

  const base = ctx.db.from('drafts').select(DRAFT_COLUMNS).eq('platform', platform).in('status', ['draft', 'scheduled']);
  const { data, error } = await scopeRows(base, ctx.userId, workspace?.id ?? null).order('updated_at', { ascending: false }).limit(40);
  if (error) throw new Error(error.message);

  // Approved plan drafts and scheduled drafts first, soonest first; then
  // the most recently edited drafts, so the queue is useful without a plan.
  const rows = (data ?? []) as DraftRecord[];
  const ready = rows.filter((d) => d.review_status === 'approved' || d.status === 'scheduled');
  const rest = rows.filter((d) => !ready.includes(d) && d.review_status !== 'skipped' && d.review_status !== 'pending');
  const when = (d: DraftRecord) => new Date(d.scheduled_for ?? d.suggested_for ?? d.updated_at).getTime();
  const ordered = [...ready.sort((a, b) => when(a) - when(b)), ...rest].slice(0, 12);

  return NextResponse.json({
    drafts: ordered.map((d) => ({
      id: d.id,
      title: d.title,
      text: draftText(d),
      segments: d.segments,
      kind: d.kind,
      scheduledFor: d.scheduled_for ?? d.suggested_for,
      approved: d.review_status === 'approved' || d.status === 'scheduled',
      grade: d.grade?.score ?? null,
      filledAt: d.composer_filled_at,
    })),
  });
});

export const POST = route('api/extension/queue:post', async (req: Request) => {
  const { draftId } = await parseJson(req, z.object({ draftId: z.string().uuid() }));
  const ctx = await requireUser(req);
  const { draft } = await loadDraftFor(ctx, draftId, 'write');
  const updated = await updateDraft(ctx.db, ctx.userId, draft.id, { composer_filled_at: new Date().toISOString() });
  await track(ctx.userId, 'draft.filled_composer', { platform: draft.platform });
  return NextResponse.json({ draft: { id: updated.id, composer_filled_at: updated.composer_filled_at } });
});
