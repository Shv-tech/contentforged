/**
 * app/api/account/notifications/route.ts
 *
 * GET    notification preferences, whether push is available on this server,
 *        and the public key a browser needs to subscribe
 * PATCH  { plan_email?, plan_push?, ... }  change any of them
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { parseJson, requireUser, route } from '@/lib/forge/http';
import { preferencesFor, savePreferences } from '@/lib/forge/notify';
import { pushConfigured } from '@/lib/forge/push';

export const GET = route('api/account/notifications:get', async (req: Request) => {
  const ctx = await requireUser(req);
  const [preferences, devices] = await Promise.all([
    preferencesFor(ctx.userId),
    createServiceClient().from('push_subscriptions').select('id, user_agent, created_at, last_used_at').eq('user_id', ctx.userId).order('created_at', { ascending: false }),
  ]);
  return NextResponse.json({
    preferences,
    push: { available: pushConfigured(), publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null, devices: devices.data ?? [] },
  });
});

const PatchSchema = z
  .object({
    plan_email: z.boolean(),
    plan_push: z.boolean(),
    comments_email: z.boolean(),
    comments_push: z.boolean(),
    reports_email: z.boolean(),
    results_email: z.boolean(),
  })
  .partial()
  .strict();

export const PATCH = route('api/account/notifications:patch', async (req: Request) => {
  const patch = await parseJson(req, PatchSchema);
  const ctx = await requireUser(req);
  return NextResponse.json({ preferences: await savePreferences(ctx.userId, patch) });
});
