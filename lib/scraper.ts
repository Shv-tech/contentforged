/**
 * lib/scraper.ts
 *
 * Fetches and summarizes a user's PUBLIC social profile page to feed the
 * PERFORMANCE DNA section of the FORGE system prompt automatically instead
 * of requiring manual entry.
 *
 * SCOPE (v1, deliberately):
 * Modern platforms (Instagram, LinkedIn, TikTok, X) render real content via
 * client-side JS and gate follower/engagement data behind login. A plain
 * server-side fetch only ever sees what's in the static HTML: Open Graph
 * tags, page title/description, and occasionally JSON-LD. This module is
 * honest about that ceiling — it extracts what's actually there and asks
 * the synthesis model to say "not available" rather than invent numbers.
 * Real analytics (follower counts, engagement rate, posting cadence) is a
 * v2 problem that requires each platform's official Graph/Ads API and its
 * own OAuth flow — out of scope here by design, not by oversight.
 *
 * SECURITY MODEL (SSRF hardening):
 * This function accepts a user-supplied URL and fetches it server-side,
 * which is exactly the shape of a Server-Side Request Forgery vector. Three
 * independent layers guard against it:
 *   1. Domain allowlist — only known public social/content platforms.
 *   2. DNS resolution + private/loopback/link-local IP range rejection,
 *      checked BEFORE every fetch, including after every redirect hop.
 *   3. Manual redirect handling (redirect: 'manual') so a 30x response
 *      can never silently pivot the request to an internal address —
 *      every hop is re-validated from scratch.
 * Response size and fetch duration are both capped.
 */

import dns from 'node:dns/promises';
import net from 'node:net';
import * as cheerio from 'cheerio';
import { createClient } from '@/lib/supabase/server';
import type { ScrapedProfileRecord } from '@/lib/brand-dna';

// ============================================================================
// CONFIG
// ============================================================================

const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024; // 3MB — profile pages are small; this is generous
const MAX_REDIRECTS = 3;
const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Curated on purpose. Fetching arbitrary user-supplied URLs server-side is
// an SSRF vector; every addition here should be a deliberate decision, not
// a convenience default. Extend as new platforms are supported.
const ALLOWED_HOST_SUFFIXES = [
  'instagram.com',
  'x.com',
  'twitter.com',
  'linkedin.com',
  'tiktok.com',
  'youtube.com',
  'facebook.com',
  'threads.net',
  'pinterest.com',
  'medium.com',
  'substack.com',
  'behance.net',
  'dribbble.com',
  'github.com',
];

// ============================================================================
// PUBLIC ENTRY POINTS
// ============================================================================

export async function scrapePublicProfile(
  userId: string,
  profileUrl: string
): Promise<ScrapedProfileRecord> {
  const parsed = safeParseUrl(profileUrl);

  if (!isAllowedHost(parsed.hostname)) {
    throw new Error(
      `"${parsed.hostname}" is not a supported profile platform yet. Supported: ${ALLOWED_HOST_SUFFIXES.join(', ')}.`
    );
  }

  const platform = detectPlatform(parsed.hostname);
  const { html, finalUrl } = await safeFetchHtml(parsed.toString());
  const meta = extractMeta(html);
  const summary = await synthesizeBrandSnapshot({ platform, url: finalUrl, meta });
  const handle = extractHandleFromPath(new URL(finalUrl).pathname);

  const supabase = createClient();
  const nowIso = new Date().toISOString();
  const nextRefreshIso = new Date(Date.now() + REFRESH_INTERVAL_MS).toISOString();

  const { data, error } = await supabase
    .from('scraped_profiles')
    .upsert(
      {
        user_id: userId,
        platform,
        profile_url: finalUrl,
        handle,
        raw_data: {
          title: meta.title,
          description: meta.description,
          siteName: meta.siteName,
          ogImage: meta.ogImage,
        },
        summary,
        scraped_at: nowIso,
        next_refresh_at: nextRefreshIso,
      },
      { onConflict: 'user_id,profile_url' }
    )
    .select('id, platform, profile_url, handle, summary, scraped_at, next_refresh_at')
    .single();

  if (error || !data) {
    throw new Error(`Failed to store scraped profile: ${error?.message ?? 'unknown error'}`);
  }

  return data as ScrapedProfileRecord;
}

export async function listScrapedProfiles(userId: string): Promise<ScrapedProfileRecord[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('scraped_profiles')
    .select('id, platform, profile_url, handle, summary, scraped_at, next_refresh_at')
    .eq('user_id', userId)
    .order('scraped_at', { ascending: false });

  if (error) throw new Error(`Failed to list scraped profiles: ${error.message}`);
  return (data ?? []) as ScrapedProfileRecord[];
}

export async function deleteScrapedProfile(userId: string, id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('scraped_profiles')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to delete scraped profile: ${error.message}`);
}

// ============================================================================
// URL VALIDATION + ALLOWLIST
// ============================================================================

function safeParseUrl(input: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error('Provided profile URL is not a valid URL.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only http/https profile URLs are supported.');
  }
  return parsed;
}

function isAllowedHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./, '').toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function detectPlatform(hostname: string): string {
  const host = hostname.replace(/^www\./, '').toLowerCase();
  if (host.endsWith('instagram.com')) return 'Instagram';
  if (host.endsWith('x.com') || host.endsWith('twitter.com')) return 'X (Twitter)';
  if (host.endsWith('linkedin.com')) return 'LinkedIn';
  if (host.endsWith('tiktok.com')) return 'TikTok';
  if (host.endsWith('youtube.com')) return 'YouTube';
  if (host.endsWith('facebook.com')) return 'Facebook';
  if (host.endsWith('threads.net')) return 'Threads';
  if (host.endsWith('pinterest.com')) return 'Pinterest';
  if (host.endsWith('medium.com')) return 'Medium';
  if (host.endsWith('substack.com')) return 'Substack';
  if (host.endsWith('behance.net')) return 'Behance';
  if (host.endsWith('dribbble.com')) return 'Dribbble';
  if (host.endsWith('github.com')) return 'GitHub';
  return 'Web';
}

function extractHandleFromPath(pathname: string): string | null {
  const segment = pathname.split('/').filter(Boolean)[0];
  return segment || null;
}

// ============================================================================
// SSRF-SAFE FETCH
// ============================================================================

/** Rejects loopback, private, link-local, CGNAT, and unique-local addresses. */
function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 0) return true; // "this network"
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    return false;
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true; // loopback
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 unique local
    if (lower.startsWith('fe80')) return true; // link-local
    if (lower.startsWith('::ffff:')) {
      // IPv4-mapped IPv6 — unwrap and recheck the embedded address.
      const mapped = lower.split(':').pop() ?? '';
      if (net.isIPv4(mapped)) return isPrivateOrReservedIp(mapped);
    }
    return false;
  }

  // Anything we can't classify is treated as unsafe.
  return true;
}

async function assertHostIsPublic(hostname: string): Promise<void> {
  if (hostname.toLowerCase() === 'localhost') {
    throw new Error('Refusing to fetch "localhost".');
  }

  let records: { address: string }[];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error(`Could not resolve host "${hostname}".`);
  }

  if (records.length === 0) {
    throw new Error(`Host "${hostname}" resolved to no addresses.`);
  }

  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new Error(`Host "${hostname}" resolves to a non-public address and cannot be scraped.`);
    }
  }
}

async function readBounded(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) {
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new Error('Response exceeded the size limit.');
    return buf;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('Response exceeded the size limit while streaming.');
      }
      chunks.push(Buffer.from(value));
    }
  }

  return Buffer.concat(chunks);
}

async function safeFetchHtml(startUrl: string): Promise<{ html: string; finalUrl: string }> {
  let currentUrl = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = safeParseUrl(currentUrl);

    if (!isAllowedHost(parsed.hostname)) {
      throw new Error(`Redirect target "${parsed.hostname}" is not on the allowlist.`);
    }
    await assertHostIsPublic(parsed.hostname);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(parsed.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; ContentForgeProfileBot/1.0; +https://forge.theutopianspace.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to fetch profile page: ${msg}`);
    } finally {
      clearTimeout(timeoutId);
    }

    // Manual redirect handling: every hop is re-validated from scratch
    // against the allowlist and DNS/IP check before it is ever followed.
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect response is missing a Location header.');
      currentUrl = new URL(location, parsed).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`Profile page returned HTTP ${response.status}.`);
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
      throw new Error('Profile page exceeds the size limit for scraping.');
    }

    const buffer = await readBounded(response, MAX_RESPONSE_BYTES);
    return { html: buffer.toString('utf-8'), finalUrl: parsed.toString() };
  }

  throw new Error(`Too many redirects (limit: ${MAX_REDIRECTS}) while fetching the profile page.`);
}

// ============================================================================
// METADATA EXTRACTION
// ============================================================================

interface ScrapedMeta {
  title: string | null;
  description: string | null;
  siteName: string | null;
  ogImage: string | null;
  jsonLd: Record<string, unknown>[];
}

function extractMeta(html: string): ScrapedMeta {
  const $ = cheerio.load(html);

  const meta = (name: string): string | null =>
    $(`meta[property="${name}"]`).attr('content') ??
    $(`meta[name="${name}"]`).attr('content') ??
    null;

  const jsonLd: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_: any, el: any) => {
    try {
      const parsed = JSON.parse($(el).contents().text());
      if (Array.isArray(parsed)) jsonLd.push(...parsed);
      else if (parsed && typeof parsed === 'object') jsonLd.push(parsed);
    } catch {
      // Malformed JSON-LD is common in the wild. Skip it — it is not fatal
      // to the overall scrape.
    }
  });

  return {
    title: $('title').first().text().trim() || meta('og:title'),
    description: meta('og:description') ?? meta('description'),
    siteName: meta('og:site_name'),
    ogImage: meta('og:image'),
    jsonLd: jsonLd.slice(0, 5), // cap what we carry forward
  };
}

// ============================================================================
// SYNTHESIS
// ============================================================================

async function synthesizeBrandSnapshot(params: {
  platform: string;
  url: string;
  meta: ScrapedMeta;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured.');

  const evidence = JSON.stringify(
    {
      platform: params.platform,
      url: params.url,
      title: params.meta.title,
      description: params.meta.description,
      siteName: params.meta.siteName,
      jsonLd: params.meta.jsonLd,
    },
    null,
    2
  );

  // Fabrication is the failure mode that matters most here: a hallucinated
  // follower count silently baked into every future generation is worse
  // than no data at all. The system prompt is written to make "not
  // available" the path of least resistance.
  const system = `You are a data-honest research assistant building a brief brand snapshot from public webpage metadata only.

STRICT RULES:
- Use ONLY the evidence provided below. Never invent follower counts, engagement rates, posting frequency, or any other statistic not literally present in the evidence.
- If a fact is not present in the evidence, state plainly that it is not available from public page metadata. Do not estimate or guess.
- Output exactly these sections, each 1-3 sentences: "Bio / Positioning", "Apparent Content Focus", "Available From Public Metadata", "Not Available (requires official platform API access)".
- No preamble, no closing remarks, no markdown headers beyond the four section labels above.
- Keep the entire output under 300 words.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: `Evidence:\n${evidence}` }],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Synthesis call failed (${response.status}).`);
  }

  const textBlock = (data.content || []).find((b: any) => b.type === 'text');
  const summary = textBlock?.text?.trim();
  if (!summary) throw new Error('Synthesis produced no output.');
  return summary;
}