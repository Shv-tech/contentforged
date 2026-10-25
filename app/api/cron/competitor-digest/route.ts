/**
 * app/api/cron/competitor-digest/route.ts
 *
 * Mondays: emails each user on a plan with competitor watch the best posts of
 * the week from the accounts they watch. Digests for overlapping sets of
 * accounts share the six-hour cache, so popular accounts are read once.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { sendCompetitorDigestEmail } from '@/lib/mail-service';
import { requireCron } from '@/lib/forge/cron';
import { hasFeature } from '@/lib/forge/entitlements';
import { route } from '@/lib/forge/http';
import { resolvePlan } from '@/lib/forge/plan';
import { cachedDigest, type WatchedAccount } from '@/lib/forge/watch';
import { createServiceClient } from '@/lib/supabase/service';
import { xConfigured } from '@/lib/x/client';

export const GET = route('api/cron/competitor-digest', async (req: Request) => {
  requireCron(req);
  if (!xConfigured()) return NextResponse.json({ skipped: 'X is not configured.' });
  const db = createServiceClient();

  const { data, error } = await db
    .from('watch_accounts')
    .select('id, user_id, handle, external_user_id, display_name, avatar_url, created_at')
    .order('user_id');
  if (error) throw new Error(error.message);

  const byUser = new Map<string, WatchedAccount[]>();
  for (const row of data ?? []) {
    const { user_id, ...account } = row as WatchedAccount & { user_id: string };
    byUser.set(user_id, [...(byUser.get(user_id) ?? []), account]);
  }

  let sent = 0;
  for (const [userId, accounts] of byUser) {
    try {
      if (!hasFeature(await resolvePlan(userId), 'competitor_watch')) continue;
      const digest = await cachedDigest(accounts);
      if (digest.top.length === 0) continue;

      const { data: user } = await db.auth.admin.getUserById(userId);
      const email = user?.user?.email;
      if (!email) continue;
      const meta = (user?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const name = typeof meta.full_name === 'string' ? meta.full_name.split(' ')[0] : '';

      const delivered = await sendCompetitorDigestEmail(
        email,
        name,
        digest.top.map((p) => ({ handle: p.handle, text: p.text, url: p.url, lift: p.lift, likes: p.likes, replies: p.replies })),
        digest.hooks
      );
      if (delivered) sent++;
    } catch (err) {
      console.error(`[cron/competitor-digest] ${userId}:`, err);
    }
  }

  return NextResponse.json({ users: byUser.size, sent });
});
