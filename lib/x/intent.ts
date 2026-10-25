/**
 * lib/x/intent.ts
 *
 * Web intents open X's own composer with text filled in. Used instead of
 * posting through the API: it costs nothing, needs no write permission, and
 * the user presses "Post" themselves.
 *
 * Safe to import in the browser.
 */

const INTENT_URL = 'https://x.com/intent/post';

export function composeIntent(text: string): string {
  return `${INTENT_URL}?text=${encodeURIComponent(text)}`;
}

export function replyIntent(postId: string, text: string): string {
  return `${INTENT_URL}?in_reply_to=${encodeURIComponent(postId)}&text=${encodeURIComponent(text)}`;
}

/**
 * LinkedIn has no prefill for post text, so the composer opens empty and the
 * draft is copied to the clipboard first.
 */
export const LINKEDIN_COMPOSE_URL = 'https://www.linkedin.com/feed/?shareActive=true';
export const THREADS_INTENT_URL = 'https://www.threads.net/intent/post';
export const BLUESKY_INTENT_URL = 'https://bsky.app/intent/compose';

export function threadsIntent(text: string): string {
  return `${THREADS_INTENT_URL}?text=${encodeURIComponent(text)}`;
}

export function blueskyIntent(text: string): string {
  return `${BLUESKY_INTENT_URL}?text=${encodeURIComponent(text)}`;
}
