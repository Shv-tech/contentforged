/**
 * lib/ops/features.ts
 *
 * Names a request and an outbound call in the words the dashboard uses:
 * which part of Forge an API path belongs to, and which outside service a
 * URL points at. Safe to import anywhere (no Node APIs).
 *
 * When you add a route under a new folder, add its prefix here, or it shows
 * up as "Other".
 */

/** Checked in order: put specific prefixes before general ones. */
const FEATURE_RULES: ReadonlyArray<readonly [prefix: string, feature: string]> = [
  ['/api/public/grade-hook', 'Hook grader (free)'],
  ['/api/tools/', 'Free tools'],
  ['/api/public/audit', 'X audit'],
  ['/api/audits', 'X audit'],
  ['/api/chat', 'Chat'],
  ['/api/war-room', 'Chat'],
  ['/api/cron/weekly-plan', 'Weekly plan'],
  ['/api/plan', 'Weekly plan'],
  ['/api/cron/publish-scheduled', 'Publishing'],
  ['/api/cron/post-metrics', 'Results and learning'],
  ['/api/cron/comments-sync', 'Comments'],
  ['/api/cron/sources-sync', 'Capture'],
  ['/api/cron/niche-insights', 'Signals'],
  ['/api/cron/competitor-digest', 'Signals'],
  ['/api/cron/client-reports', 'Teams and agencies'],
  ['/api/cron/calendar-reminders', 'Calendar'],
  ['/api/cron/ops-health', 'Monitoring'],
  ['/api/cron/', 'Scheduled jobs'],
  ['/api/capture', 'Capture'],
  ['/api/sources', 'Capture'],
  ['/api/extension/grade', 'Grading'],
  ['/api/v1/grade', 'Grading'],
  ['/api/v1', 'Public API and MCP'],
  ['/api/mcp', 'Public API and MCP'],
  ['/api/keys', 'Public API and MCP'],
  ['/api/extension', 'Chrome extension'],
  ['/api/drafts', 'Drafts and studio'],
  ['/api/ideas', 'Ideas and Story Bank'],
  ['/api/stories', 'Ideas and Story Bank'],
  ['/api/voice', 'Voice and brand'],
  ['/api/brand-dna', 'Voice and brand'],
  ['/api/brand-kit', 'Voice and brand'],
  ['/api/profile', 'Voice and brand'],
  ['/api/rules', 'Voice and brand'],
  ['/api/connections', 'Publishing'],
  ['/api/playbook', 'Results and learning'],
  ['/api/predictions', 'Results and learning'],
  ['/api/experiments', 'Results and learning'],
  ['/api/goals', 'Results and learning'],
  ['/l/', 'Results and learning'],
  ['/api/signals', 'Signals'],
  ['/api/watch', 'Signals'],
  ['/api/comments', 'Comments'],
  ['/api/workspaces', 'Teams and agencies'],
  ['/api/invites', 'Teams and agencies'],
  ['/api/reports', 'Teams and agencies'],
  ['/api/public/approval', 'Teams and agencies'],
  ['/api/longform', 'Long form and ebooks'],
  ['/api/ebook', 'Long form and ebooks'],
  ['/api/repurpose', 'Long form and ebooks'],
  ['/api/formats', 'Long form and ebooks'],
  ['/api/billing', 'Billing'],
  ['/api/webhook/calendar', 'Calendar'],
  ['/api/auth', 'Sign-in and accounts'],
  ['/auth/', 'Sign-in and accounts'],
  ['/api/account', 'Sign-in and accounts'],
  ['/api/user', 'Sign-in and accounts'],
  ['/api/email', 'Sign-in and accounts'],
  ['/api/admin', 'Monitoring'],
  ['/api/ops', 'Monitoring'],
  ['/api/health', 'Monitoring'],
  ['/api/events', 'Monitoring'],
];

export function featureFor(path: string): string {
  // Grading of a draft lives under /api/drafts/[id]/grade.
  if (path.startsWith('/api/drafts/') && path.endsWith('/grade')) return 'Grading';
  for (const [prefix, feature] of FEATURE_RULES) {
    if (path.startsWith(prefix)) return feature;
  }
  if (!path.startsWith('/api')) return 'Pages';
  return 'Other';
}

const PAGE_RULES: ReadonlyArray<readonly [prefix: string, feature: string]> = [
  ['/audit', 'X audit'],
  ['/g/', 'Hook grader (free)'],
  ['/tools', 'Free tools'],
  ['/dashboard', 'App: dashboard'],
  ['/drafts', 'Drafts and studio'],
  ['/capture', 'Capture'],
  ['/review', 'Weekly plan'],
  ['/onboarding', 'Sign-in and accounts'],
  ['/login', 'Sign-in and accounts'],
  ['/signup', 'Sign-in and accounts'],
  ['/forgot-password', 'Sign-in and accounts'],
  ['/update-password', 'Sign-in and accounts'],
  ['/account', 'Sign-in and accounts'],
  ['/approve', 'Teams and agencies'],
  ['/invite', 'Teams and agencies'],
  ['/r/', 'Teams and agencies'],
  ['/share', 'Shared pages'],
  ['/admin', 'Monitoring'],
];

/** The feature a page (not an API route) belongs to, for errors in the browser. */
export function pageFeatureFor(path: string): string {
  if (path.startsWith('/api') || path.startsWith('/auth/') || path.startsWith('/l/')) return featureFor(path);
  for (const [prefix, feature] of PAGE_RULES) if (path.startsWith(prefix)) return feature;
  return 'Website';
}

/** Every feature the dashboard knows, so a quiet one still gets a tile. */
export const FEATURES: readonly string[] = [
  ...Array.from(new Set(FEATURE_RULES.map(([, f]) => f))),
  'Grading',
  'App: dashboard',
  'Shared pages',
  'Website',
  'Pages',
  'Other',
].filter((f, i, all) => all.indexOf(f) === i);

export type ServiceMode = 'all' | 'failures';

interface ServiceRule {
  name: string;
  match: (host: string) => boolean;
  /** 'failures': record only failed calls (very frequent, cheap calls like the database). */
  mode: ServiceMode;
}

function supabaseHost(): string | null {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : null;
  } catch {
    return null;
  }
}

const SERVICE_RULES: readonly ServiceRule[] = [
  { name: 'Anthropic', match: (h) => h === 'api.anthropic.com', mode: 'all' },
  { name: 'Groq', match: (h) => h === 'api.groq.com', mode: 'all' },
  { name: 'OpenAI', match: (h) => h === 'api.openai.com', mode: 'all' },
  { name: 'X API', match: (h) => h === 'api.x.com' || h === 'api.twitter.com', mode: 'all' },
  { name: 'Tavily', match: (h) => h === 'api.tavily.com', mode: 'all' },
  { name: 'Resend', match: (h) => h === 'api.resend.com', mode: 'all' },
  { name: 'Razorpay', match: (h) => h === 'api.razorpay.com', mode: 'all' },
  { name: 'LinkedIn', match: (h) => h === 'api.linkedin.com' || h === 'www.linkedin.com', mode: 'all' },
  { name: 'Threads', match: (h) => h === 'graph.threads.net', mode: 'all' },
  { name: 'Bluesky', match: (h) => h === 'bsky.social' || h.endsWith('.bsky.network') || h === 'public.api.bsky.app', mode: 'all' },
  { name: 'GitHub', match: (h) => h === 'api.github.com', mode: 'all' },
  { name: 'Linear', match: (h) => h === 'api.linear.app', mode: 'all' },
  { name: 'Notion', match: (h) => h === 'api.notion.com', mode: 'all' },
  {
    name: 'Web Push',
    match: (h) => h === 'fcm.googleapis.com' || h.endsWith('.push.apple.com') || h.endsWith('push.services.mozilla.com') || h.endsWith('.notify.windows.com'),
    mode: 'all',
  },
  { name: 'Upstash Redis', match: (h) => h.endsWith('.upstash.io'), mode: 'failures' },
  { name: 'Supabase', match: (h) => h === supabaseHost() || h.endsWith('.supabase.co'), mode: 'failures' },
];

export function serviceFor(url: URL): { name: string; mode: ServiceMode } | null {
  const rule = SERVICE_RULES.find((r) => r.match(url.host));
  return rule ? { name: rule.name, mode: rule.mode } : null;
}

export const SERVICES: readonly string[] = SERVICE_RULES.map((r) => r.name);

/** Expected gap between runs, in minutes, for the scheduled jobs panel. */
export const JOB_INTERVALS: Readonly<Record<string, number>> = {
  'api/cron/publish-scheduled': 5,
  'api/cron/calendar-reminders': 5,
  'api/cron/ops-health': 5,
  'api/cron/post-metrics': 30,
  'api/cron/weekly-plan': 60,
  'api/cron/comments-sync': 120,
  'api/cron/sources-sync': 360,
  'api/cron/niche-insights': 1440,
  'api/cron/competitor-digest': 10080,
  'api/cron/client-reports': 44640,
};
