/**
 * lib/x/audit.ts
 *
 * The 30-second X profile audit: one profile lookup, the last twenty
 * original posts, deterministic statistics, and a short diagnosis written
 * from those statistics.
 *
 * The numbers are computed here, in code. The model only explains them, and
 * is given nothing it could inflate: it sees the computed figures and the
 * post texts, and is told to cite only those. An audit that invents a
 * benchmark ("accounts like yours average 4% engagement") would be the first
 * thing a sceptical founder screenshots.
 */

import { structuredCall } from '@/lib/ai/anthropic';
import type { TokenUsage } from '@/lib/billing/plans';
import { cached } from '@/lib/forge/cache';
import { classifyHook, HOOK_TYPE_LABELS, type HookType } from '@/lib/forge/hooks';
import { getUserByUsername, getUserPosts, normaliseHandle, postEngagement, postUrl, type XPost, type XUser } from './client';

export const AUDIT_VERSION = 1;
const SAMPLE_SIZE = 20;

export interface AuditPost {
  id: string;
  url: string;
  text: string;
  createdAt: string;
  likes: number;
  replies: number;
  reposts: number;
  impressions: number;
  engagement: number;
  hook: HookType;
}

export interface AuditFlag {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
}

export interface AuditReport {
  version: number;
  generatedAt: string;
  user: {
    id: string;
    username: string;
    name: string;
    bio: string;
    avatar: string | null;
    followers: number;
    following: number;
    totalPosts: number;
    verified: boolean;
    createdAt: string | null;
  };
  stats: {
    analysed: number;
    spanDays: number;
    postsPerWeek: number;
    medianLikes: number;
    medianReplies: number;
    medianReposts: number;
    medianImpressions: number | null;
    engagementRate: number | null;
    engagementPer1kFollowers: number;
    longestGapDays: number;
    linkShare: number;
    medianLength: number;
    bestHourUtc: number | null;
  };
  hooks: Array<{ type: HookType; label: string; count: number; medianEngagement: number }>;
  hours: number[];
  best: AuditPost[];
  worst: AuditPost[];
  flags: AuditFlag[];
  narrative: {
    headline: string;
    diagnosis: string[];
    fixes: string[];
    bioRewrite: string | null;
    bestPostWhy: string | null;
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function toAuditPost(post: XPost, username: string): AuditPost {
  return {
    id: post.id,
    url: postUrl(username, post.id),
    text: post.text,
    createdAt: post.created_at,
    likes: post.public_metrics.like_count,
    replies: post.public_metrics.reply_count,
    reposts: post.public_metrics.retweet_count + post.public_metrics.quote_count,
    impressions: post.public_metrics.impression_count ?? 0,
    engagement: postEngagement(post),
    hook: classifyHook(post.text),
  };
}

export function computeAuditStats(user: XUser, posts: XPost[]): Omit<AuditReport, 'narrative' | 'generatedAt' | 'version'> {
  const items = posts.map((post) => toAuditPost(post, user.username));
  const times = items.map((p) => new Date(p.createdAt).getTime()).sort((a, b) => a - b);
  const spanDays = times.length > 1 ? Math.max((times[times.length - 1] - times[0]) / 86_400_000, 1) : 1;

  let longestGapDays = 0;
  for (let i = 1; i < times.length; i++) longestGapDays = Math.max(longestGapDays, (times[i] - times[i - 1]) / 86_400_000);
  if (times.length > 0) longestGapDays = Math.max(longestGapDays, (Date.now() - times[times.length - 1]) / 86_400_000);

  const impressions = items.map((p) => p.impressions).filter((n) => n > 0);
  const engagementRates = items.filter((p) => p.impressions > 0).map((p) => p.engagement / p.impressions);

  const hours = new Array<number>(24).fill(0);
  const hourEngagement = new Array<number[]>(24).fill(null as unknown as number[]).map(() => [] as number[]);
  for (const post of items) {
    const hour = new Date(post.createdAt).getUTCHours();
    hours[hour] += 1;
    hourEngagement[hour].push(post.engagement);
  }
  const bestHour = hourEngagement
    .map((values, hour) => ({ hour, count: values.length, median: median(values) }))
    .filter((h) => h.count >= 2)
    .sort((a, b) => b.median - a.median)[0];

  const byHook = new Map<HookType, number[]>();
  for (const post of items) {
    const list = byHook.get(post.hook) ?? [];
    list.push(post.engagement);
    byHook.set(post.hook, list);
  }

  const sortedByEngagement = [...items].sort((a, b) => b.engagement - a.engagement);
  const followers = user.public_metrics.followers_count;
  const medianEngagement = median(items.map((p) => p.engagement));

  const stats: AuditReport['stats'] = {
    analysed: items.length,
    spanDays: Math.round(spanDays),
    postsPerWeek: Math.round((items.length / spanDays) * 7 * 10) / 10,
    medianLikes: median(items.map((p) => p.likes)),
    medianReplies: median(items.map((p) => p.replies)),
    medianReposts: median(items.map((p) => p.reposts)),
    medianImpressions: impressions.length >= 3 ? median(impressions) : null,
    engagementRate: engagementRates.length >= 3 ? Math.round(median(engagementRates) * 10000) / 100 : null,
    engagementPer1kFollowers: followers > 0 ? Math.round((medianEngagement / followers) * 1000 * 10) / 10 : 0,
    longestGapDays: Math.round(longestGapDays),
    linkShare: items.length > 0 ? Math.round((posts.filter((p) => p.has_link).length / items.length) * 100) : 0,
    medianLength: Math.round(median(items.map((p) => p.text.length))),
    bestHourUtc: bestHour ? bestHour.hour : null,
  };

  const flags = diagnose(user, posts, items, stats);

  return {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      bio: user.description,
      avatar: user.profile_image_url?.replace('_normal', '_400x400') ?? null,
      followers,
      following: user.public_metrics.following_count,
      totalPosts: user.public_metrics.tweet_count,
      verified: user.verified,
      createdAt: user.created_at,
    },
    stats,
    hooks: Array.from(byHook.entries())
      .map(([type, values]) => ({ type, label: HOOK_TYPE_LABELS[type], count: values.length, medianEngagement: median(values) }))
      .sort((a, b) => b.count - a.count),
    hours,
    best: sortedByEngagement.slice(0, 3),
    worst: sortedByEngagement.slice(-3).reverse(),
    flags,
  };
}

function diagnose(user: XUser, posts: XPost[], items: AuditPost[], stats: AuditReport['stats']): AuditFlag[] {
  const flags: AuditFlag[] = [];

  if (items.length === 0) {
    flags.push({ id: 'no_posts', severity: 'high', title: 'No recent original posts', detail: 'There is nothing recent for anyone to engage with. Reach starts with posting.' });
    return flags;
  }

  if (stats.postsPerWeek < 3) {
    flags.push({
      id: 'low_frequency',
      severity: 'high',
      title: 'Posting too rarely to compound',
      detail: `About ${stats.postsPerWeek} posts a week over the last ${stats.spanDays} days. Accounts that grow tend to post daily or close to it.`,
    });
  }

  if (stats.longestGapDays >= 10) {
    flags.push({
      id: 'long_gap',
      severity: 'medium',
      title: `A ${stats.longestGapDays}-day silence`,
      detail: 'Long gaps reset momentum: followers stop expecting to hear from you.',
    });
  }

  const withLink = posts.filter((p) => p.has_link).map((p) => postEngagement(p));
  const withoutLink = posts.filter((p) => !p.has_link).map((p) => postEngagement(p));
  if (withLink.length >= 3 && withoutLink.length >= 3 && median(withLink) < median(withoutLink) * 0.6) {
    flags.push({
      id: 'link_penalty',
      severity: 'medium',
      title: 'Posts with links underperform',
      detail: `Your posts with links get a median of ${Math.round(median(withLink))} engagement against ${Math.round(median(withoutLink))} without. Put links in a reply instead.`,
    });
  }

  const followers = user.public_metrics.followers_count;
  if (followers >= 500 && stats.engagementPer1kFollowers < 2) {
    flags.push({
      id: 'low_engagement',
      severity: 'high',
      title: 'Followers are not engaging',
      detail: `A median post gets about ${stats.engagementPer1kFollowers} engagement per 1,000 followers. The audience is there but the posts are not giving them a reason to respond.`,
    });
  }

  const recent = items.slice(0, 5).map((p) => p.engagement);
  const earlier = items.slice(5).map((p) => p.engagement);
  if (recent.length >= 5 && earlier.length >= 5 && median(recent) < median(earlier) * 0.6) {
    flags.push({
      id: 'declining',
      severity: 'medium',
      title: 'Engagement is falling',
      detail: `Your last five posts got a median of ${Math.round(median(recent))} engagement, down from ${Math.round(median(earlier))} before that.`,
    });
  }

  if (user.description.trim().length < 40) {
    flags.push({
      id: 'thin_bio',
      severity: 'low',
      title: 'The bio does not say why to follow',
      detail: 'A visitor decides in seconds. The bio should say who you help or what you post about.',
    });
  }

  const statements = items.filter((p) => p.hook === 'statement').length;
  if (items.length >= 8 && statements / items.length >= 0.7) {
    flags.push({
      id: 'flat_openers',
      severity: 'medium',
      title: 'Most posts open flat',
      detail: `${statements} of ${items.length} posts open with a plain statement. Questions, numbers and admissions give a reader a reason to stop.`,
    });
  }

  return flags;
}

// ============================================================================
// NARRATIVE
// ============================================================================

const NARRATIVE_TOOL = {
  name: 'submit_audit',
  description: 'Submit the written part of the audit.',
  input_schema: {
    type: 'object',
    properties: {
      headline: { type: 'string', description: 'One sentence: the single most important reason this account is not growing faster. Plain words.' },
      diagnosis: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3, description: 'Two or three findings, each citing a number from the data.' },
      fixes: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3, description: 'Three concrete things to do this week, specific to this account.' },
      bio_rewrite: { type: 'string', description: 'A sharper bio using only facts in the current bio and posts. Empty if the bio is already good or there is too little to go on.' },
      best_post_why: { type: 'string', description: 'One sentence on why the best post worked, based on its text.' },
    },
    required: ['headline', 'diagnosis', 'fixes', 'bio_rewrite', 'best_post_why'],
  },
};

const NARRATIVE_SYSTEM = `You write the summary of an X profile audit. You are given computed statistics, rule-based flags, and the text of the account's best and worst recent posts.

Rules:
- Cite only numbers that appear in the data. Never invent benchmarks, averages for "accounts like this", or industry statistics.
- Be direct and specific to this account. No generic advice that would apply to anyone.
- Write in plain, short sentences. No hype, no emoji, no em dashes.
- The bio rewrite may only use facts present in the current bio or the posts.`;

async function writeNarrative(stats: ReturnType<typeof computeAuditStats>): Promise<{ narrative: AuditReport['narrative']; usage: TokenUsage }> {
  const payload = {
    account: { username: stats.user.username, name: stats.user.name, bio: stats.user.bio, followers: stats.user.followers, following: stats.user.following },
    stats: stats.stats,
    hooks: stats.hooks.map((h) => ({ type: h.label, count: h.count, medianEngagement: h.medianEngagement })),
    flags: stats.flags.map((f) => ({ title: f.title, detail: f.detail })),
    bestPosts: stats.best.map((p) => ({ text: p.text, likes: p.likes, replies: p.replies, reposts: p.reposts })),
    worstPosts: stats.worst.map((p) => ({ text: p.text, likes: p.likes, replies: p.replies, reposts: p.reposts })),
  };

  const { data, usage } = await structuredCall<Record<string, unknown>>({
    system: NARRATIVE_SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
    tool: NARRATIVE_TOOL,
    temperature: 0.2,
    maxTokens: 900,
  });

  const list = (value: unknown, max: number) =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).slice(0, max) : [];

  return {
    narrative: {
      headline: typeof data.headline === 'string' ? data.headline : '',
      diagnosis: list(data.diagnosis, 3),
      fixes: list(data.fixes, 3),
      bioRewrite: typeof data.bio_rewrite === 'string' && data.bio_rewrite.trim() ? data.bio_rewrite.trim() : null,
      bestPostWhy: typeof data.best_post_why === 'string' && data.best_post_why.trim() ? data.best_post_why.trim() : null,
    },
    usage,
  };
}

/**
 * Runs a full audit. Cached per handle for six hours and shared: the second
 * request for the same account costs nothing upstream.
 */
export async function runProfileAudit(handleInput: string): Promise<{ report: AuditReport; cacheHit: boolean }> {
  const handle = normaliseHandle(handleInput).toLowerCase();

  const { value, hit } = await cached(`x:audit:v${AUDIT_VERSION}:${handle}`, 6 * 3600, async () => {
    const user = await getUserByUsername(handle);
    const posts = await getUserPosts(user.id, { max: SAMPLE_SIZE });
    const stats = computeAuditStats(user, posts);
    const { narrative } = await writeNarrative(stats);
    const report: AuditReport = { version: AUDIT_VERSION, generatedAt: new Date().toISOString(), ...stats, narrative };
    return report;
  });

  return { report: value, cacheHit: hit };
}
