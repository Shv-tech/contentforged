/**
 * app/api/sources/route.ts
 *
 * GET   the active brand's connected sources (never their credentials)
 * POST  { provider, secret, repos? }  verify a read-only credential, store
 *       it encrypted, and run a first sync
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { brandRequest } from '@/lib/forge/brand-request';
import { SOURCE_INFO, SOURCE_PROVIDERS, type SourceProvider } from '@/lib/forge/capture/sources';
import { connectSource, listSources, syncSourceById } from '@/lib/forge/capture/sync';
import { recordAudit } from '@/lib/forge/data/collab';
import { track } from '@/lib/forge/events';
import { parseJson, route } from '@/lib/forge/http';

export const GET = route('api/sources:get', async (req: Request) => {
  const { ctx, workspaceId } = await brandRequest(req);
  return NextResponse.json({ sources: await listSources(ctx.userId, workspaceId), providers: SOURCE_INFO });
});

const ConnectSchema = z.object({
  provider: z.enum(SOURCE_PROVIDERS as [SourceProvider, ...SourceProvider[]]),
  secret: z.string().trim().min(8).max(2000),
  repos: z.array(z.string().max(140)).max(10).optional(),
});

export const POST = route('api/sources:post', async (req: Request) => {
  const input = await parseJson(req, ConnectSchema);
  const { ctx, workspaceId } = await brandRequest(req, { write: true, feature: 'sources' });

  const source = await connectSource(ctx.userId, workspaceId, input.provider, input.secret, { repos: input.repos ?? [] });
  const created = await syncSourceById(ctx.userId, workspaceId, source.id);

  await recordAudit(workspaceId, ctx.userId, 'connection.added', { type: 'source', id: source.id, detail: { provider: input.provider } });
  await track(ctx.userId, 'source.connected', { provider: input.provider });
  const sources = await listSources(ctx.userId, workspaceId);
  return NextResponse.json({ source: sources.find((s) => s.id === source.id) ?? source, captures: created }, { status: 201 });
});
