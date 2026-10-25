/**
 * app/api/drafts/[id]/schedule/route.ts
 *
 * GET     suggested slots for this draft's platform
 * POST    schedule the draft: creates or moves its calendar event, which the
 *         reminder job emails with the full post at reminder time
 * DELETE  unschedule
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { suggestSlots } from '@/lib/forge/best-times';
import { loadDraftFor } from '@/lib/forge/data/drafts';
import { recordAudit } from '@/lib/forge/data/collab';
import { HttpError, isUuid, parseJson, requireUser, route } from '@/lib/forge/http';
import { loadPostedPosts, scorePosts } from '@/lib/forge/playbook';
import { scheduleDraft, unscheduleDraft } from '@/lib/forge/scheduling';

type Params = { params: { id: string } };

async function load(req: Request, id: string, mode: 'read' | 'write' = 'write') {
  if (!isUuid(id)) throw new HttpError(404, 'Draft not found.');
  const ctx = await requireUser(req);
  const { draft } = await loadDraftFor(ctx, id, mode);
  return { ctx, draft };
}

async function timezoneOf(db: Awaited<ReturnType<typeof requireUser>>['db'], userId: string): Promise<string> {
  const { data } = await db.from('profiles').select('timezone').eq('id', userId).maybeSingle();
  return data?.timezone ?? 'UTC';
}

export const GET = route('api/drafts/[id]/schedule:get', async (req: Request, { params }: Params) => {
  const { ctx, draft } = await load(req, params.id, 'read');
  const timeZone = await timezoneOf(ctx.db, ctx.userId);

  const horizon = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const [{ data: events }, posts] = await Promise.all([
    ctx.db.from('calendar_events').select('start_date').eq('user_id', ctx.userId).gte('start_date', new Date().toISOString()).lte('start_date', horizon),
    loadPostedPosts(ctx.db, ctx.userId, draft.workspace_id, 200),
  ]);

  const slots = suggestSlots({
    platform: draft.platform,
    timeZone,
    scored: scorePosts(posts),
    taken: (events ?? []).map((e: { start_date: string }) => e.start_date),
  });

  return NextResponse.json({ slots, timeZone });
});

const ScheduleSchema = z.object({
  at: z
    .string()
    .datetime({ offset: true })
    .refine((value) => new Date(value).getTime() > Date.now() - 60_000, 'Pick a time in the future.'),
  reminderMinutes: z.number().int().min(0).max(1440).nullable().default(15),
  autoPublish: z.boolean().default(false),
});

export const POST = route('api/drafts/[id]/schedule:post', async (req: Request, { params }: Params) => {
  const { ctx, draft } = await load(req, params.id);
  const { at, reminderMinutes, autoPublish } = await parseJson(req, ScheduleSchema);
  const updated = await scheduleDraft(ctx.db, ctx.userId, draft, { at, reminderMinutes, autoPublish });
  await recordAudit(draft.workspace_id, ctx.userId, 'draft.scheduled', { type: 'draft', id: draft.id, detail: { at, autoPublish } });
  return NextResponse.json({ draft: updated });
});

export const DELETE = route('api/drafts/[id]/schedule:delete', async (req: Request, { params }: Params) => {
  const { ctx, draft } = await load(req, params.id);
  const updated = await unscheduleDraft(ctx.db, ctx.userId, draft);
  return NextResponse.json({ draft: updated });
});
