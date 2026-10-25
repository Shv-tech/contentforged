/**
 * app/api/drafts/route.ts
 *
 * GET  ?ids=a,b,c                         drafts by id (for cards in a transcript)
 * GET  ?view=library&status=&q=&cursor=   the drafts library, newest first
 * GET  ?view=evergreen                    posted drafts worth resurfacing
 * POST                                    create a draft from the composer
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createDraft, DRAFT_COLUMNS } from '@/lib/forge/data/drafts';
import { getActiveWorkspace, requireWrite, resolveRole, scopeRows } from '@/lib/forge/data/workspace';
import { isUuid, parseJson, requireUser, route, HttpError } from '@/lib/forge/http';
import { computePlaybook, loadPostedPosts } from '@/lib/forge/playbook';
import { DRAFT_PLATFORMS, type DraftRecord } from '@/lib/forge/types';

const PAGE_SIZE = 30;
const EVERGREEN_MIN_AGE_DAYS = 60;

export const GET = route('api/drafts:get', async (req: Request) => {
  const ctx = await requireUser(req);
  const url = new URL(req.url);

  const idsParam = url.searchParams.get('ids');
  if (idsParam) {
    const ids = idsParam.split(',').filter(isUuid).slice(0, 100);
    if (ids.length === 0) return NextResponse.json({ drafts: [] });
    const { data, error } = await ctx.db.from('drafts').select(DRAFT_COLUMNS).in('id', ids);
    if (error) throw new HttpError(500, 'Could not load drafts.');
    // RLS already narrows session reads; this also holds for token requests,
    // which run on the service client.
    const rows = (data ?? []) as DraftRecord[];
    const workspaceIds = Array.from(new Set(rows.map((d) => d.workspace_id).filter((id): id is string => Boolean(id))));
    const memberOf = new Set<string>();
    for (const workspaceId of workspaceIds) {
      if (await resolveRole(ctx.db, ctx.userId, workspaceId)) memberOf.add(workspaceId);
    }
    const visible = rows.filter((d) => (d.workspace_id ? memberOf.has(d.workspace_id) : d.user_id === ctx.userId));
    return NextResponse.json({ drafts: visible });
  }

  const workspace = await getActiveWorkspace(ctx.db, ctx.userId);
  const view = url.searchParams.get('view') ?? 'library';

  if (view === 'evergreen') {
    const posts = await loadPostedPosts(ctx.db, ctx.userId, workspace?.id ?? null, 300);
    const cutoff = Date.now() - EVERGREEN_MIN_AGE_DAYS * 86_400_000;
    const playbook = computePlaybook(posts.filter((p) => p.draft.posted_at && new Date(p.draft.posted_at).getTime() < cutoff));
    // Top third by performance on their platform: proven, and old enough
    // that most of today's audience has not seen it.
    const candidates = playbook.scored
      .filter((p) => p.percentile >= 0.66)
      .sort((a, b) => b.percentile - a.percentile)
      .slice(0, 20)
      .map((p) => ({ draft: p.draft, metrics: p.metrics, percentile: p.percentile }));
    return NextResponse.json({ candidates });
  }

  const status = url.searchParams.get('status');
  const search = url.searchParams.get('q')?.trim();
  const cursor = url.searchParams.get('cursor');

  const base = ctx.db.from('drafts').select(DRAFT_COLUMNS);
  let query = scopeRows(base, ctx.userId, workspace?.id ?? null);
  if (status && ['draft', 'scheduled', 'posted', 'archived'].includes(status)) query = query.eq('status', status);
  else query = query.neq('status', 'archived');
  if (search) {
    const safe = search.replace(/[%,()]/g, ' ').slice(0, 80);
    query = query.or(`body.ilike.%${safe}%,title.ilike.%${safe}%`);
  }
  if (cursor) query = query.lt('updated_at', cursor);

  const { data, error } = await query.order('updated_at', { ascending: false }).limit(PAGE_SIZE + 1);
  if (error) throw new HttpError(500, 'Could not load drafts.');

  const rows = (data ?? []) as DraftRecord[];
  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  return NextResponse.json({ drafts: page, nextCursor: hasMore ? page[page.length - 1].updated_at : null });
});

const CreateSchema = z.object({
  platform: z.enum(DRAFT_PLATFORMS),
  kind: z.enum(['post', 'thread', 'carousel']).default('post'),
  body: z.string().max(20_000).default(''),
  segments: z.array(z.string().max(4000)).max(25).default([]),
  title: z.string().max(120).nullish(),
  campaignId: z.string().uuid().nullish(),
  parentDraftId: z.string().uuid().nullish(),
});

export const POST = route('api/drafts:post', async (req: Request) => {
  const ctx = await requireUser(req);
  const input = await parseJson(req, CreateSchema);
  if (!input.body.trim() && input.segments.length === 0) throw new HttpError(400, 'A draft needs some text.');

  const workspace = await getActiveWorkspace(ctx.db, ctx.userId);
  requireWrite(workspace);
  const draft = await createDraft(ctx.db, ctx.userId, workspace?.id ?? null, {
    platform: input.platform,
    kind: input.kind,
    body: input.body,
    segments: input.segments,
    title: input.title ?? null,
    campaignId: input.campaignId ?? null,
    parentDraftId: input.parentDraftId ?? null,
  });
  return NextResponse.json({ draft }, { status: 201 });
});
