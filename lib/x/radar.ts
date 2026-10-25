/**
 * lib/x/radar.ts
 *
 * Reply Radar: finds posts in the user's niche that are gaining traction in
 * the last few hours, from accounts larger than theirs, and drafts replies in
 * their voice.
 *
 * Replies are never posted automatically. Each one opens X's reply composer
 * with the text filled in; the user reads it, edits it, and presses Reply.
 * Automated replying is against X's automation rules and the fastest way to
 * get an account restricted.
 */

import { structuredCall } from '@/lib/ai/anthropic';
import type { TokenUsage } from '@/lib/billing/plans';
import { postEngagement, postUrl, searchRecent, type XPost, type XUser } from './client';
import { nicheQuery, normaliseNiche } from './pulse';

const MAX_AGE_HOURS = 8;
const TARGETS = 6;

export interface RadarTarget {
  id: string;
  url: string;
  text: string;
  createdAt: string;
  ageMinutes: number;
  author: { username: string; name: string; followers: number; avatar: string | null };
  likes: number;
  replies: number;
  reposts: number;
  /** Engagement per hour, weighted by audience size. Higher = rising. */
  momentum: number;
  suggestions: string[];
}

function momentumOf(post: XPost, author: XUser | undefined, now: number): number {
  const ageMinutes = Math.max((now - new Date(post.created_at).getTime()) / 60_000, 10);
  const perHour = (postEngagement(post) / ageMinutes) * 60;
  const reach = Math.log10((author?.public_metrics.followers_count ?? 0) + 10);
  // Posts that already have hundreds of replies bury new ones; prefer threads
  // where a thoughtful reply can still be seen.
  const crowding = 1 / (1 + post.public_metrics.reply_count / 150);
  return perHour * reach * crowding;
}

export async function findReplyTargets(niche: string, options: { minFollowers?: number; excludeUsername?: string | null } = {}): Promise<RadarTarget[]> {
  const query = nicheQuery(normaliseNiche(niche));
  const { posts, authors } = await searchRecent(query, { max: 100, sort: 'recency' });
  const now = Date.now();
  const minFollowers = options.minFollowers ?? 0;
  const exclude = options.excludeUsername?.toLowerCase() ?? null;

  return posts
    .filter((post) => now - new Date(post.created_at).getTime() <= MAX_AGE_HOURS * 3600 * 1000)
    .filter((post) => {
      const author = authors.get(post.author_id);
      if (!author) return false;
      if (exclude && author.username.toLowerCase() === exclude) return false;
      return author.public_metrics.followers_count >= minFollowers;
    })
    .map((post) => ({ post, author: authors.get(post.author_id), momentum: momentumOf(post, authors.get(post.author_id), now) }))
    .filter((entry) => postEngagement(entry.post) > 0)
    .sort((a, b) => b.momentum - a.momentum)
    .slice(0, TARGETS)
    .map(({ post, author, momentum }) => ({
      id: post.id,
      url: postUrl(author?.username ?? 'i', post.id),
      text: post.text,
      createdAt: post.created_at,
      ageMinutes: Math.round((now - new Date(post.created_at).getTime()) / 60_000),
      author: {
        username: author?.username ?? 'unknown',
        name: author?.name ?? 'Unknown',
        followers: author?.public_metrics.followers_count ?? 0,
        avatar: author?.profile_image_url ?? null,
      },
      likes: post.public_metrics.like_count,
      replies: post.public_metrics.reply_count,
      reposts: post.public_metrics.retweet_count + post.public_metrics.quote_count,
      momentum: Math.round(momentum * 10) / 10,
      suggestions: [],
    }));
}

const REPLY_TOOL = {
  name: 'submit_replies',
  description: 'Submit reply drafts for each post.',
  input_schema: {
    type: 'object',
    properties: {
      replies: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            post_id: { type: 'string' },
            options: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
          },
          required: ['post_id', 'options'],
        },
      },
    },
    required: ['replies'],
  },
};

/**
 * Drafts three replies per target in the user's voice. Replies must add
 * something (a specific experience, a number, a counterpoint), never praise
 * or "great post". They may only use facts from the user's Story Bank.
 */
export async function draftReplies(
  targets: RadarTarget[],
  voice: { promptBlock: string | null; stories: string; rules: string[] }
): Promise<{ targets: RadarTarget[]; usage: TokenUsage }> {
  if (targets.length === 0) return { targets, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } };

  const system = [
    'You draft replies to other people’s posts on X for the user. Each reply must add something real: a specific experience, a number, a sharp counterpoint, or a useful question. Never flatter, never say "great post", never pitch a product, never use hashtags or emoji unless the user’s voice does.',
    'Personal facts may only come from the Story Bank below. If none fit, reply with an observation or question instead of a claim about the user.',
    'Keep replies under 240 characters. Three genuinely different options per post: one experience-based, one contrarian or additive, one short question.',
    voice.promptBlock ? `The user’s voice:\n${voice.promptBlock}` : '',
    voice.rules.length > 0 ? `The user’s writing rules:\n${voice.rules.map((r) => `- ${r}`).join('\n')}` : '',
    `Story Bank:\n${voice.stories}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const { data, usage } = await structuredCall<{ replies?: Array<{ post_id: string; options: string[] }> }>({
    system,
    messages: [
      {
        role: 'user',
        content: targets.map((t) => `${t.id} | @${t.author.username}: ${t.text.replace(/\s+/g, ' ').slice(0, 400)}`).join('\n\n'),
      },
    ],
    tool: REPLY_TOOL,
    temperature: 0.6,
    maxTokens: 1800,
  });

  const byId = new Map((data.replies ?? []).map((r) => [String(r.post_id), (r.options ?? []).filter((o) => typeof o === 'string').slice(0, 3)]));
  return {
    targets: targets.map((target) => ({ ...target, suggestions: byId.get(target.id) ?? [] })),
    usage,
  };
}
