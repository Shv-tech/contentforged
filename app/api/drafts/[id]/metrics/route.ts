/**
 * app/api/drafts/[id]/metrics/route.ts
 *
 * GET   every checkpoint recorded for this draft
 * POST  one of:
 *         { action: 'refresh' }                      pull current numbers from the platform now
 *         { action: 'save', values, source? }        store numbers the user entered or confirmed
 *         { action: 'read_screenshot', image }       read numbers off a screenshot, for confirmation
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadDraftFor } from '@/lib/forge/data/drafts';
import { HttpError, isUuid, parseJson, requireUser, route } from '@/lib/forge/http';
import { afterResults } from '@/lib/forge/outcomes';
import { metered } from '@/lib/forge/metered';
import { EMPTY_VALUES, fetchLiveMetrics, MetricsUnavailableError, recordMetrics } from '@/lib/forge/metrics';
import { readMetricsScreenshot } from '@/lib/forge/screenshot-metrics';
import { XApiError } from '@/lib/x/client';
import { PlatformError } from '@/lib/platforms/http';

type Params = { params: { id: string } };

async function load(req: Request, id: string, mode: 'read' | 'write') {
  if (!isUuid(id)) throw new HttpError(404, 'Draft not found.');
  const ctx = await requireUser(req);
  const { draft } = await loadDraftFor(ctx, id, mode);
  return { ctx, draft };
}

export const GET = route('api/drafts/[id]/metrics:get', async (req: Request, { params }: Params) => {
  const { ctx, draft } = await load(req, params.id, 'read');
  const { data, error } = await ctx.db
    .from('post_metrics')
    .select('id, draft_id, platform, checkpoint, impressions, likes, replies, reposts, quotes, bookmarks, clicks, followers_gained, source, captured_at')
    .eq('draft_id', draft.id)
    .order('captured_at');
  if (error) throw new Error(error.message);
  return NextResponse.json({ metrics: data ?? [] });
});

const count = z.number().int().min(0).max(2_000_000_000).nullable().default(null);

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('refresh') }),
  z.object({
    action: z.literal('save'),
    source: z.enum(['manual', 'screenshot']).default('manual'),
    values: z.object({
      impressions: count,
      likes: count,
      replies: count,
      reposts: count,
      quotes: count,
      bookmarks: count,
      clicks: count,
      followers_gained: z.number().int().min(-10_000_000).max(10_000_000).nullable().default(null),
    }),
  }),
  z.object({
    action: z.literal('read_screenshot'),
    image: z.object({
      mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
      base64: z.string().min(100).max(7_000_000),
    }),
  }),
]);

export const POST = route('api/drafts/[id]/metrics:post', async (req: Request, { params }: Params) => {
  const { ctx, draft } = await load(req, params.id, 'write');
  if (draft.status !== 'posted') throw new HttpError(409, 'Mark the draft as posted first.');
  const input = await parseJson(req, BodySchema);

  if (input.action === 'save') {
    if (Object.values(input.values).every((v) => v === null)) throw new HttpError(400, 'Add at least one number.');
    const metrics = await recordMetrics(ctx.db, draft.user_id, draft, 'manual', { ...EMPTY_VALUES, ...input.values }, input.source);
    await afterResults(ctx.db, draft.id);
    return NextResponse.json({ metrics });
  }

  if (input.action === 'read_screenshot') {
    const values = await metered({ userId: ctx.userId, route: 'drafts/metrics/screenshot', maxOutputTokens: 300, estimatedInputTokens: 1800 }, async () => {
      const result = await readMetricsScreenshot(input.image);
      return { value: result.values, usage: result.usage };
    });
    if (!values) throw new HttpError(422, 'That does not look like a post analytics screen. Try a clearer screenshot, or type the numbers.');
    return NextResponse.json({ values });
  }

  try {
    const live = await fetchLiveMetrics(draft);
    const metrics = await recordMetrics(ctx.db, draft.user_id, draft, 'manual', live.values, live.source, live.raw);
    await afterResults(ctx.db, draft.id);
    return NextResponse.json({ metrics });
  } catch (error) {
    if (error instanceof MetricsUnavailableError) throw new HttpError(409, error.message, { manual: true });
    if (error instanceof XApiError || error instanceof PlatformError) throw new HttpError(502, error.message);
    throw error;
  }
});
