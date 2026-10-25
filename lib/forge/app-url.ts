/**
 * lib/forge/app-url.ts
 *
 * The public origin of the app, for OAuth redirect URIs and links in email.
 * NEXT_PUBLIC_APP_URL is authoritative in production because a provider's
 * registered redirect URI must match it exactly; the request origin is the
 * fallback in local development.
 */

export function appUrl(req?: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (req) return new URL(req.url).origin;
  return 'http://localhost:3000';
}
