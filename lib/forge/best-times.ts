/**
 * lib/forge/best-times.ts
 *
 * Suggested posting slots.
 *
 * From the user's own results once there is enough of them (MIN_POSTS on the
 * platform, each hour bucket backed by at least two posts). Before that,
 * from sensible defaults that are labelled as defaults, so nobody mistakes a
 * starting point for a finding.
 */

import type { ScoredPost } from './playbook';
import type { DraftPlatform } from './types';

const MIN_POSTS = 8;

export interface SuggestedSlot {
  at: string;
  label: string;
  basis: 'your_results' | 'default';
}

/** Weekday hours (local) used until the user's own data says otherwise. */
const DEFAULT_HOURS: Record<DraftPlatform, number[]> = {
  x: [9, 12, 17],
  linkedin: [8, 10, 12],
  threads: [9, 13, 19],
  bluesky: [9, 13, 18],
  instagram: [11, 14, 19],
  newsletter: [7, 9, 11],
};

function zonedParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    weekday: weekdays.indexOf(get('weekday')),
  };
}

/**
 * The UTC instant for a wall-clock time in `timeZone`. Resolves the zone's
 * offset at that instant (so daylight-saving changes land correctly) by
 * correcting a first guess once.
 */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour));
  const seen = zonedParts(guess, timeZone);
  const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour);
  const offset = seenAsUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}

function labelFor(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
}

/** Hours ranked by the user's median relative engagement on `platform`. */
function rankedHoursFromResults(scored: ScoredPost[], platform: DraftPlatform, timeZone: string): number[] {
  const onPlatform = scored.filter((p) => p.draft.platform === platform && p.draft.posted_at);
  if (onPlatform.length < MIN_POSTS) return [];

  const byHour = new Map<number, number[]>();
  for (const post of onPlatform) {
    const hour = zonedParts(new Date(post.draft.posted_at!), timeZone).hour;
    const list = byHour.get(hour) ?? [];
    list.push(post.relative);
    byHour.set(hour, list);
  }

  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  return Array.from(byHour.entries())
    .filter(([, values]) => values.length >= 2)
    .sort((a, b) => median(b[1]) - median(a[1]))
    .slice(0, 3)
    .map(([hour]) => hour);
}

/** The next three open slots, at least 30 minutes from now, skipping taken hours. */
export function suggestSlots(options: { platform: DraftPlatform; timeZone: string; scored: ScoredPost[]; taken: string[]; now?: Date }): SuggestedSlot[] {
  const { platform, timeZone } = options;
  const now = options.now ?? new Date();
  const fromResults = rankedHoursFromResults(options.scored, platform, timeZone);
  const hours = fromResults.length > 0 ? fromResults : DEFAULT_HOURS[platform];
  const basis: SuggestedSlot['basis'] = fromResults.length > 0 ? 'your_results' : 'default';

  const takenHours = new Set(options.taken.map((iso) => new Date(iso).toISOString().slice(0, 13)));
  const slots: SuggestedSlot[] = [];

  for (let dayOffset = 0; dayOffset < 14 && slots.length < 3; dayOffset++) {
    const day = zonedParts(new Date(now.getTime() + dayOffset * 86_400_000), timeZone);
    const weekend = day.weekday === 0 || day.weekday === 6;
    // Defaults skip weekends; the user's own data may say otherwise.
    if (weekend && basis === 'default' && platform === 'linkedin') continue;

    for (const hour of [...hours].sort((a, b) => a - b)) {
      const at = zonedTimeToUtc(day.year, day.month, day.day, hour, timeZone);
      if (at.getTime() < now.getTime() + 30 * 60_000) continue;
      if (takenHours.has(at.toISOString().slice(0, 13))) continue;
      slots.push({ at: at.toISOString(), label: labelFor(at, timeZone), basis });
      if (slots.length >= 3) break;
    }
  }

  return slots;
}
