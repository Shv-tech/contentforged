/**
 * app/api/goals/webhook/[token]/route.ts
 *
 * POST  a booking, signup or sale from Cal.com, Calendly or any service,
 *       verified by the provider's signature (or the secret path token),
 *       attributed to a post when it carries a Forge link code.
 *
 * Outside the session middleware: providers send no cookies.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { receiveGoalEvent } from '@/lib/forge/goals';
import { clientIp, HttpError, route } from '@/lib/forge/http';
import { consumeLimit } from '@/lib/forge/limits';

export const POST = route('api/goals/webhook', async (req: Request, { params }: { params: { token: string } }) => {
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(params.token)) throw new HttpError(404, 'Unknown endpoint.');
  const limit = await consumeLimit(`goal-webhook:${params.token}:${clientIp(req)}`, 600, 3600);
  if (!limit.allowed) throw new HttpError(429, 'Too many events.');

  const body = await req.text();
  if (body.length > 200_000) throw new HttpError(413, 'Payload too large.');
  const result = await receiveGoalEvent(params.token, body, req.headers);
  return NextResponse.json({ result });
});
