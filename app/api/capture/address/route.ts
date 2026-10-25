/**
 * app/api/capture/address/route.ts
 *
 * GET    the active brand's email-in address and its allowed senders
 * POST   { action: 'rotate' }  retire the address and issue a new one
 * PATCH  { allowedSenders }    who besides the account email may send to it
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { brandRequest } from '@/lib/forge/brand-request';
import { getCaptureAddress, inboundDomain, rotateCaptureAddress, setAllowedSenders } from '@/lib/forge/capture/email';
import { parseJson, route } from '@/lib/forge/http';

export const GET = route('api/capture/address:get', async (req: Request) => {
  const { ctx, workspaceId } = await brandRequest(req);
  if (!inboundDomain()) return NextResponse.json({ address: null, configured: false, accountEmail: ctx.email });
  return NextResponse.json({ address: await getCaptureAddress(ctx.userId, workspaceId), configured: true, accountEmail: ctx.email });
});

export const POST = route('api/capture/address:post', async (req: Request) => {
  await parseJson(req, z.object({ action: z.literal('rotate') }));
  const { ctx, workspaceId } = await brandRequest(req, { write: true });
  return NextResponse.json({ address: await rotateCaptureAddress(ctx.userId, workspaceId) });
});

export const PATCH = route('api/capture/address:patch', async (req: Request) => {
  const { allowedSenders } = await parseJson(req, z.object({ allowedSenders: z.array(z.string().max(254)).max(10) }));
  const { ctx, workspaceId } = await brandRequest(req, { write: true });
  return NextResponse.json({ address: await setAllowedSenders(ctx.userId, workspaceId, allowedSenders) });
});
