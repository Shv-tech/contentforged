/**
 * app/api/goals/route.ts
 *
 * GET   goal totals, results per post, recent events, and the brand's
 *       webhook endpoints with their URLs
 * POST  { provider, secret? }  create or replace an endpoint
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { appUrl } from '@/lib/forge/app-url';
import { brandRequest } from '@/lib/forge/brand-request';
import { track } from '@/lib/forge/events';
import { goalSummary, GOAL_PROVIDER_INFO, listEndpoints, upsertEndpoint } from '@/lib/forge/goals';
import { parseJson, route } from '@/lib/forge/http';

function withUrl<T extends { token: string }>(req: Request, endpoint: T) {
  return { ...endpoint, url: `${appUrl(req)}/api/goals/webhook/${endpoint.token}` };
}

export const GET = route('api/goals:get', async (req: Request) => {
  const { ctx, workspaceId } = await brandRequest(req);
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get('days') ?? 90) || 90, 7), 365);
  const [summary, endpoints] = await Promise.all([goalSummary(ctx.db, ctx.userId, workspaceId, days), listEndpoints(ctx.userId, workspaceId)]);
  return NextResponse.json({ summary, endpoints: endpoints.map((e) => withUrl(req, e)), providers: GOAL_PROVIDER_INFO });
});

const EndpointSchema = z.object({
  provider: z.enum(['calcom', 'calendly', 'webhook']),
  secret: z.string().trim().max(400).nullish(),
});

export const POST = route('api/goals:post', async (req: Request) => {
  const input = await parseJson(req, EndpointSchema);
  const { ctx, workspaceId } = await brandRequest(req, { write: true, feature: 'goals' });
  const endpoint = await upsertEndpoint(ctx.userId, workspaceId, input.provider, input.secret ?? null);
  await track(ctx.userId, 'goal.connected', { provider: input.provider });
  return NextResponse.json({ endpoint: withUrl(req, endpoint) }, { status: 201 });
});
