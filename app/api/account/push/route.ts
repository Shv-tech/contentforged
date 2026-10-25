/**
 * app/api/account/push/route.ts
 *
 * POST    { endpoint, keys: { p256dh, auth } }  register this browser for push
 * DELETE  { endpoint }  stop pushing to it
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HttpError, parseJson, requireUser, route } from '@/lib/forge/http';
import { pushConfigured, removeSubscription, saveSubscription } from '@/lib/forge/push';

const SubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).refine((url) => url.startsWith('https://'), 'Push endpoints must be https.'),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

export const POST = route('api/account/push:post', async (req: Request) => {
  const subscription = await parseJson(req, SubscriptionSchema);
  const ctx = await requireUser(req);
  if (!pushConfigured()) throw new HttpError(503, 'Push notifications are not set up on this server.');
  await saveSubscription(ctx.userId, subscription, req.headers.get('user-agent'));
  return NextResponse.json({ subscribed: true }, { status: 201 });
});

const RemoveSchema = z.object({ endpoint: z.string().url().max(1000) });

export const DELETE = route('api/account/push:delete', async (req: Request) => {
  const input = await parseJson(req, RemoveSchema);
  const ctx = await requireUser(req);
  await removeSubscription(ctx.userId, input.endpoint);
  return NextResponse.json({ subscribed: false });
});
