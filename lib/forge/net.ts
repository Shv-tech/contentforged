/**
 * lib/forge/net.ts
 *
 * Fetching URLs a user gave us (a calendar feed, a page to repurpose)
 * without becoming a proxy into private networks.
 *
 * A server that fetches any URL on request can be pointed at its own cloud
 * metadata endpoint or an internal service. Every user-supplied URL is
 * resolved first and refused if any address it resolves to is private,
 * loopback or link-local; redirects are followed by hand so each hop is
 * checked the same way.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { HttpError } from './http';

const MAX_REDIRECTS = 3;

function isPrivateV4(address: string): boolean {
  const [a, b] = address.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateV6(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateV4(mapped[1]) : false;
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateV4(address);
  if (version === 6) return isPrivateV6(address);
  return true;
}

/** Throws unless the URL is http(s) and every address it resolves to is public. */
export async function assertPublicUrl(raw: string, options: { httpsOnly?: boolean } = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new HttpError(400, 'That is not a valid link.');
  }
  if (url.protocol !== 'https:' && (options.httpsOnly || url.protocol !== 'http:')) {
    throw new HttpError(400, options.httpsOnly ? 'Use an https:// link.' : 'Use an http or https link.');
  }
  if (url.username || url.password) throw new HttpError(400, 'Links with a username or password are not accepted.');

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) throw new HttpError(400, 'That address is not reachable from Forge.');

  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) throw new HttpError(400, 'That address could not be found.');
  if (addresses.some((entry) => isPrivateAddress(entry.address))) throw new HttpError(400, 'That address is not reachable from Forge.');
  return url;
}

/**
 * Fetches a user-supplied URL with every redirect hop checked, a timeout
 * and a size cap. Returns the body as text.
 */
export async function fetchPublicText(
  raw: string,
  options: { httpsOnly?: boolean; maxBytes?: number; timeoutMs?: number; accept?: string } = {}
): Promise<{ text: string; url: string; contentType: string }> {
  const maxBytes = options.maxBytes ?? 2_000_000;
  let current = await assertPublicUrl(raw, options);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'ForgeBot/1.0 (+https://forgeyourway.dev)', accept: options.accept ?? '*/*' },
      });
    } catch {
      throw new HttpError(502, 'That link did not respond.');
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new HttpError(502, 'That link redirected nowhere.');
      current = await assertPublicUrl(new URL(location, current).toString(), options);
      continue;
    }
    if (!response.ok) throw new HttpError(502, `That link returned an error (${response.status}).`);

    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > maxBytes) throw new HttpError(413, 'That page is too large to read.');

    const reader = response.body?.getReader();
    if (!reader) return { text: '', url: current.toString(), contentType: response.headers.get('content-type') ?? '' };
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, 'That page is too large to read.');
      }
      chunks.push(value);
    }
    return { text: Buffer.concat(chunks).toString('utf8'), url: current.toString(), contentType: response.headers.get('content-type') ?? '' };
  }

  throw new HttpError(502, 'That link redirected too many times.');
}
