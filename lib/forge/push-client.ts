'use client';

/**
 * lib/forge/push-client.ts
 *
 * The browser side of push: register the service worker, subscribe this
 * device with the server's public key, and unsubscribe. Push only works on
 * https (or localhost) and, on iPhone, only from the installed app.
 */

import { api } from './client';

export type PushSupport = 'supported' | 'unsupported' | 'needs-install' | 'denied';

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    const ios = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
    return ios ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  return 'supported';
}

let registration: Promise<ServiceWorkerRegistration | null> | null = null;

/** Registers /sw.js once per page load. Safe to call from anywhere. */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null);
  registration ??= navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null);
  return registration;
}

function keyBytes(base64: string): Uint8Array {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registerServiceWorker();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Asks permission if needed, subscribes this device and tells the server. */
export async function enablePush(publicKey: string): Promise<boolean> {
  const reg = await registerServiceWorker();
  if (!reg) return false;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const existing = await reg.pushManager.getSubscription();
  const subscription =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey) as BufferSource,
    }));
  const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api('/api/account/push', { method: 'POST', json: { endpoint: json.endpoint, keys: json.keys } });
  return true;
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await api('/api/account/push', { method: 'DELETE', json: { endpoint: subscription.endpoint } }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
}
