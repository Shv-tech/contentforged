/**
 * lib/forge/capture/sources.ts
 *
 * Connected sources: where work already happens, read once a few hours so
 * the week's material arrives without anyone typing it.
 *
 *   github    releases and merged pull requests, from a read-only token
 *   linear    issues the person completed, from a personal API key
 *   notion    pages they edited, from an internal integration token
 *   calendar  meeting titles from a private calendar feed (iCal) URL
 *
 * All four are read-only by construction: the credentials asked for cannot
 * write, and nothing here calls a write endpoint. Credentials are encrypted
 * at rest and only decrypted inside a sync.
 */

import { HttpError } from '../http';
import { fetchPublicText } from '../net';
import type { CaptureSource } from './extract';

export type SourceProvider = 'github' | 'linear' | 'notion' | 'calendar';

export const SOURCE_PROVIDERS: readonly SourceProvider[] = ['github', 'linear', 'notion', 'calendar'];

export const SOURCE_INFO: Record<SourceProvider, { name: string; credential: string; help: string }> = {
  github: {
    name: 'GitHub',
    credential: 'Fine-grained token with read-only access to Contents, Metadata and Pull requests',
    help: 'Create one under GitHub, Settings, Developer settings, Fine-grained tokens. Choose only the repositories you want Forge to read.',
  },
  linear: {
    name: 'Linear',
    credential: 'Personal API key',
    help: 'Create one under Linear, Settings, Account, Security and access, Personal API keys.',
  },
  notion: {
    name: 'Notion',
    credential: 'Internal integration secret',
    help: 'Create an internal integration at notion.so/my-integrations, then share the pages Forge may read with it.',
  },
  calendar: {
    name: 'Calendar',
    credential: 'Secret address in iCal format',
    help: 'Google Calendar: Settings, your calendar, Integrate calendar, Secret address in iCal format. Outlook: Settings, Calendar, Shared calendars, Publish a calendar.',
  },
};

export interface SourceConfig {
  repos?: string[];
}

/** One batch of raw material from a source, ready to become a capture. */
export interface SourceMaterial {
  externalId: string;
  title: string;
  text: string;
  metadata: Record<string, unknown>;
}

const TIMEOUT_MS = 15_000;

async function getJson<T>(url: string, init: RequestInit, provider: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (response.status === 401 || response.status === 403) throw new HttpError(401, `${provider} rejected the credential. Check that it is current and has read access.`);
    if (!response.ok) throw new HttpError(502, `${provider} returned an error (${response.status}).`);
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, `${provider} did not respond.`);
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// GITHUB
// ============================================================================

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function githubHeaders(token: string): HeadersInit {
  return { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'Forge' };
}

export function normaliseRepos(repos: string[]): string[] {
  const cleaned = repos
    .map((repo) => repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, ''))
    .filter((repo) => REPO_PATTERN.test(repo));
  return Array.from(new Set(cleaned)).slice(0, 10);
}

async function githubMaterial(token: string, config: SourceConfig, since: Date): Promise<SourceMaterial[]> {
  const repos = normaliseRepos(config.repos ?? []);
  const sinceDay = since.toISOString().slice(0, 10);
  const materials: SourceMaterial[] = [];

  for (const repo of repos) {
    const [releases, merged] = await Promise.all([
      getJson<Array<{ id: number; name: string | null; tag_name: string; body: string | null; published_at: string | null; html_url: string; draft: boolean }>>(
        `https://api.github.com/repos/${repo}/releases?per_page=10`,
        { headers: githubHeaders(token) },
        'GitHub'
      ),
      getJson<{ items: Array<{ number: number; title: string; body: string | null; html_url: string; closed_at: string }> }>(
        `https://api.github.com/search/issues?q=${encodeURIComponent(`repo:${repo} is:pr is:merged merged:>=${sinceDay}`)}&per_page=30&sort=updated`,
        { headers: githubHeaders(token) },
        'GitHub'
      ),
    ]);

    const newReleases = releases.filter((r) => !r.draft && r.published_at && new Date(r.published_at) > since);
    if (newReleases.length === 0 && merged.items.length === 0) continue;

    const lines: string[] = [];
    for (const release of newReleases) {
      lines.push(`RELEASE ${release.name || release.tag_name} (${release.published_at?.slice(0, 10)})\n${(release.body ?? '').slice(0, 2500)}`);
    }
    for (const pr of merged.items) {
      lines.push(`MERGED #${pr.number}: ${pr.title} (${pr.closed_at.slice(0, 10)})${pr.body ? `\n${pr.body.slice(0, 600)}` : ''}`);
    }

    materials.push({
      externalId: `github:${repo}:${since.toISOString().slice(0, 13)}`,
      title: `${repo}: ${newReleases.length} release${newReleases.length === 1 ? '' : 's'}, ${merged.items.length} merged`,
      text: lines.join('\n\n'),
      metadata: { repo, releases: newReleases.length, merged: merged.items.length },
    });
  }
  return materials;
}

// ============================================================================
// LINEAR
// ============================================================================

async function linearQuery<T>(key: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const body = await getJson<{ data?: T; errors?: Array<{ message: string }> }>(
    'https://api.linear.app/graphql',
    { method: 'POST', headers: { authorization: key, 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) },
    'Linear'
  );
  if (!body.data) throw new HttpError(502, body.errors?.[0]?.message ?? 'Linear returned no data.');
  return body.data;
}

async function linearMaterial(key: string, since: Date): Promise<SourceMaterial[]> {
  const data = await linearQuery<{ issues: { nodes: Array<{ identifier: string; title: string; description: string | null; completedAt: string; team: { name: string } | null }> } }>(
    key,
    `query Done($since: DateTimeOrDuration!) {
      issues(first: 50, filter: { completedAt: { gt: $since }, assignee: { isMe: { eq: true } } }) {
        nodes { identifier title description completedAt team { name } }
      }
    }`,
    { since: since.toISOString() }
  );
  const issues = data.issues.nodes;
  if (issues.length === 0) return [];
  return [
    {
      externalId: `linear:${since.toISOString().slice(0, 13)}`,
      title: `${issues.length} Linear issue${issues.length === 1 ? '' : 's'} completed`,
      text: issues
        .map((issue) => `${issue.identifier} ${issue.title} (${issue.team?.name ?? 'team'}, ${issue.completedAt.slice(0, 10)})${issue.description ? `\n${issue.description.slice(0, 500)}` : ''}`)
        .join('\n\n'),
      metadata: { issues: issues.length },
    },
  ];
}

// ============================================================================
// NOTION
// ============================================================================

const NOTION_VERSION = '2022-06-28';

function notionHeaders(token: string): HeadersInit {
  return { authorization: `Bearer ${token}`, 'notion-version': NOTION_VERSION, 'content-type': 'application/json' };
}

interface NotionRichText {
  plain_text: string;
}

function notionBlockText(block: Record<string, unknown>): string {
  const type = block.type as string;
  const payload = block[type] as { rich_text?: NotionRichText[] } | undefined;
  const text = (payload?.rich_text ?? []).map((t) => t.plain_text).join('');
  if (!text) return '';
  if (type.startsWith('heading')) return `## ${text}`;
  if (type === 'bulleted_list_item' || type === 'numbered_list_item' || type === 'to_do') return `- ${text}`;
  return text;
}

function notionTitle(page: { properties?: Record<string, { type: string; title?: NotionRichText[] }> }): string {
  for (const property of Object.values(page.properties ?? {})) {
    if (property.type === 'title') return (property.title ?? []).map((t) => t.plain_text).join('') || 'Untitled';
  }
  return 'Untitled';
}

async function notionMaterial(token: string, since: Date): Promise<SourceMaterial[]> {
  const search = await getJson<{ results: Array<{ id: string; last_edited_time: string; url: string; properties?: Record<string, { type: string; title?: NotionRichText[] }> }> }>(
    'https://api.notion.com/v1/search',
    {
      method: 'POST',
      headers: notionHeaders(token),
      body: JSON.stringify({ filter: { property: 'object', value: 'page' }, sort: { direction: 'descending', timestamp: 'last_edited_time' }, page_size: 20 }),
    },
    'Notion'
  );

  const pages = search.results.filter((page) => new Date(page.last_edited_time) > since).slice(0, 8);
  const materials: SourceMaterial[] = [];
  for (const page of pages) {
    const blocks = await getJson<{ results: Array<Record<string, unknown>> }>(
      `https://api.notion.com/v1/blocks/${page.id}/children?page_size=80`,
      { headers: notionHeaders(token) },
      'Notion'
    );
    const text = blocks.results.map(notionBlockText).filter(Boolean).join('\n').slice(0, 8000);
    if (text.length < 40) continue;
    const title = notionTitle(page);
    materials.push({
      externalId: `notion:${page.id}:${page.last_edited_time}`,
      title: `Notion: ${title}`.slice(0, 200),
      text: `${title}\n\n${text}`,
      metadata: { page: page.id, url: page.url },
    });
  }
  return materials;
}

// ============================================================================
// CALENDAR (iCal)
// ============================================================================

interface CalendarEvent {
  summary: string;
  start: Date;
}

/** Joins folded lines (RFC 5545: a line starting with a space continues the previous one). */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
}

function parseIcsDate(value: string): Date | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!match) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = match;
  // Floating and TZID times are read as UTC; the day is what matters here.
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
}

function unescapeIcs(value: string): string {
  return value.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}

export function parseCalendar(ics: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  let current: Partial<CalendarEvent> | null = null;
  for (const line of unfold(ics)) {
    if (line === 'BEGIN:VEVENT') current = {};
    else if (line === 'END:VEVENT') {
      if (current?.summary && current.start) events.push(current as CalendarEvent);
      current = null;
    } else if (current) {
      const colon = line.indexOf(':');
      if (colon === -1) continue;
      const name = line.slice(0, colon).split(';')[0].toUpperCase();
      const value = line.slice(colon + 1);
      if (name === 'SUMMARY') current.summary = unescapeIcs(value).slice(0, 200);
      if (name === 'DTSTART') current.start = parseIcsDate(value.trim()) ?? undefined;
    }
  }
  return events;
}

async function calendarMaterial(feedUrl: string, since: Date): Promise<SourceMaterial[]> {
  const { text } = await fetchPublicText(feedUrl, { httpsOnly: true, maxBytes: 5_000_000, accept: 'text/calendar' });
  if (!text.includes('BEGIN:VCALENDAR')) throw new HttpError(400, 'That address did not return a calendar feed.');

  const now = new Date();
  const events = parseCalendar(text)
    .filter((event) => event.start > since && event.start <= now)
    .filter((event) => !/^(busy|blocked|focus|lunch|out of office|ooo)$/i.test(event.summary))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, 60);
  if (events.length < 2) return [];

  return [
    {
      externalId: `calendar:${since.toISOString().slice(0, 13)}`,
      title: `${events.length} meetings this week`,
      text: events.map((event) => `${event.start.toISOString().slice(0, 10)}: ${event.summary}`).join('\n'),
      metadata: { meetings: events.length },
    },
  ];
}

// ============================================================================
// DISPATCH
// ============================================================================

export const CAPTURE_SOURCE_FOR: Record<SourceProvider, CaptureSource> = {
  github: 'github',
  linear: 'linear',
  notion: 'notion',
  calendar: 'calendar',
};

/** Checks a credential before it is stored. Returns a label for the connection. */
export async function verifySource(provider: SourceProvider, secret: string, config: SourceConfig): Promise<string> {
  switch (provider) {
    case 'github': {
      const repos = normaliseRepos(config.repos ?? []);
      if (repos.length === 0) throw new HttpError(400, 'Add at least one repository, as owner/name.');
      const user = await getJson<{ login: string }>('https://api.github.com/user', { headers: githubHeaders(secret) }, 'GitHub');
      for (const repo of repos) await getJson(`https://api.github.com/repos/${repo}`, { headers: githubHeaders(secret) }, 'GitHub');
      return `@${user.login}, ${repos.length} repo${repos.length === 1 ? '' : 's'}`;
    }
    case 'linear': {
      const data = await linearQuery<{ viewer: { name: string } }>(secret, 'query { viewer { name } }');
      return data.viewer.name;
    }
    case 'notion': {
      const me = await getJson<{ name?: string; bot?: { workspace_name?: string } }>('https://api.notion.com/v1/users/me', { headers: notionHeaders(secret) }, 'Notion');
      return me.bot?.workspace_name ?? me.name ?? 'Notion';
    }
    case 'calendar': {
      const { text } = await fetchPublicText(secret, { httpsOnly: true, maxBytes: 5_000_000, accept: 'text/calendar' });
      if (!text.includes('BEGIN:VCALENDAR')) throw new HttpError(400, 'That address did not return a calendar feed.');
      return `${parseCalendar(text).length} events`;
    }
  }
}

export async function readSource(provider: SourceProvider, secret: string, config: SourceConfig, since: Date): Promise<SourceMaterial[]> {
  switch (provider) {
    case 'github':
      return githubMaterial(secret, config, since);
    case 'linear':
      return linearMaterial(secret, since);
    case 'notion':
      return notionMaterial(secret, since);
    case 'calendar':
      return calendarMaterial(secret, since);
  }
}
