/**
 * lib/forge/post-links.ts
 *
 * Recognises a published post's URL and extracts the id each platform's API
 * needs to fetch its results.
 */

import { PLATFORM_NAMES, type DraftPlatform } from './types';

export interface IdentifiedPost {
  platform: DraftPlatform;
  platformName: string;
  externalId: string;
}

export function identifyPostUrl(raw: string): IdentifiedPost | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const path = url.pathname;

  const make = (platform: DraftPlatform, externalId: string): IdentifiedPost => ({ platform, platformName: PLATFORM_NAMES[platform], externalId });

  if (host === 'x.com' || host === 'twitter.com' || host === 'mobile.twitter.com') {
    const match = path.match(/\/status(?:es)?\/(\d+)/);
    return match ? make('x', match[1]) : null;
  }

  if (host === 'linkedin.com') {
    // /feed/update/urn:li:activity:123 or urn:li:share:123 or urn:li:ugcPost:123
    const urn = decodeURIComponent(path).match(/urn:li:(activity|share|ugcPost):(\d+)/);
    if (urn) return make('linkedin', `urn:li:${urn[1]}:${urn[2]}`);
    // /posts/name_slug-activity-123-abcd
    const activity = path.match(/activity-(\d{10,25})/);
    return activity ? make('linkedin', `urn:li:activity:${activity[1]}`) : null;
  }

  if (host === 'threads.net' || host === 'threads.com') {
    // /@handle/post/SHORTCODE. The API id is resolved at metrics time.
    const match = path.match(/\/@[^/]+\/post\/([A-Za-z0-9_-]+)/);
    return match ? make('threads', match[1]) : null;
  }

  if (host === 'bsky.app') {
    // /profile/handle.bsky.social/post/RKEY. Stored as "handle/rkey" and
    // resolved to an at:// URI at metrics time.
    const match = path.match(/\/profile\/([^/]+)\/post\/([a-z0-9]+)/i);
    return match ? make('bluesky', `${match[1]}/${match[2]}`) : null;
  }

  if (host === 'instagram.com') {
    const match = path.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
    return match ? make('instagram', match[1]) : null;
  }

  return null;
}
