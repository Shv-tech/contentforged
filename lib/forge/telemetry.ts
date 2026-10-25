'use client';

/**
 * lib/forge/telemetry.ts
 *
 * The browser half of product events. Same fixed vocabulary as the server
 * (lib/forge/events.ts); only names and a few short scalars are sent.
 *
 * Sent with keepalive so an event fired as the page navigates away still
 * arrives, and never awaited by callers: instrumentation must not slow down
 * or break the thing it observes.
 */

import type { EventName } from './events';

type Props = Record<string, string | number | boolean | null>;

export function trackEvent(name: EventName, props: Props = {}): void {
  if (typeof window === 'undefined') return;
  try {
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, props }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Never let telemetry throw into product code.
  }
}

const SESSION_KEY = 'forge:session-started';

/** Once per browser tab session: someone opened Forge. */
export function trackSessionStart(surface: string): void {
  try {
    if (window.sessionStorage.getItem(SESSION_KEY)) return;
    window.sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Private mode: count it anyway; a duplicate is better than a gap.
  }
  trackEvent('session.started', { surface, standalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false });
}

const opened = new Set<string>();

/** First time a view is opened in this page load. */
export function trackFeatureOpened(feature: string): void {
  if (opened.has(feature)) return;
  opened.add(feature);
  trackEvent('feature.opened', { feature });
}
