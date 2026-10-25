/**
 * lib/forge/push.ts
 *
 * Web push to the installed app (and any browser the person allowed).
 *
 * Standard Web Push with VAPID: no third-party service sees the message
 * routing keys, and a subscription the browser has discarded (404 or 410)
 * is deleted the first time a send fails with it.
 */

import webpush from 'web-push';
import { createServiceClient } from '@/lib/supabase/service';

export interface PushMessage {
  title: string;
  body: string;
  /** Path to open when the notification is tapped. */
  url: string;
  /** Notifications with the same tag replace each other instead of stacking. */
  tag?: string;
}

let configured: boolean | null = null;

export function pushConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hello@forgeyourway.dev', publicKey, privateKey);
  configured = true;
  return true;
}

export async function saveSubscription(userId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string | null): Promise<void> {
  const { error } = await createServiceClient()
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, user_agent: userAgent?.slice(0, 200) ?? null },
      { onConflict: 'endpoint' }
    );
  if (error) throw new Error(`Could not save the subscription: ${error.message}`);
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await createServiceClient().from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint);
}

/** Sends to every device the person subscribed. Returns how many accepted it. */
export async function sendPush(userId: string, message: PushMessage): Promise<number> {
  if (!pushConfigured()) return 0;
  const service = createServiceClient();
  const { data } = await service.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);

  let delivered = 0;
  for (const row of (data ?? []) as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>) {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify(message), { TTL: 60 * 60 * 24 });
      delivered += 1;
      await service.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', row.id);
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await service.from('push_subscriptions').delete().eq('id', row.id);
      else console.error('[forge/push] send failed:', status ?? error);
    }
  }
  return delivered;
}
