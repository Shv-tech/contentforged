/**
 * lib/x/pulse.ts
 *
 * Niche pulse: what a niche is talking about on X right now, grouped into a
 * few topics, each with a suggested angle.
 *
 * One shared run per niche every three hours. The search and the grouping
 * are both cached on the normalised niche string, so a hundred founders
 * asking about "indie SaaS" cost one search and one model call per window.
 */

import { structuredCall } from '@/lib/ai/anthropic';
import { cached } from '@/lib/forge/cache';
import { sha256Hex } from '@/lib/forge/crypto';
import { postEngagement, postUrl, searchRecent, type XPost, type XUser } from './client';

const PULSE_TTL_SECONDS = 3 * 3600;
const LOOKBACK_HOURS = 48;

export interface PulsePost {
  id: string;
  url: string;
  text: string;
  author: { username: string; name: string; followers: number; avatar: string | null };
  createdAt: string;
  likes: number;
  replies: number;
  reposts: number;
}

export interface PulseTopic {
  title: string;
  summary: string;
  angle: string;
  posts: PulsePost[];
}

export interface NichePulse {
  niche: string;
  query: string;
  generatedAt: string;
  sampled: number;
  topics: PulseTopic[];
}

/**
 * Builds an X search query from a free-text niche description.
 * "indie SaaS, building in public" -> ("indie SaaS" OR "building in public")
 */
export function nicheQuery(niche: string): string {
  const phrases = niche
    .split(/,|\bor\b|\band\b|\//i)
    .map((p) => p.replace(/["()]/g, '').trim())
    .filter((p) => p.length >= 2)
    .slice(0, 6);
  const terms = phrases.map((p) => (/\s/.test(p) ? `"${p}"` : p));
  const core = terms.length > 1 ? `(${terms.join(' OR ')})` : terms[0] ?? niche;
  return `${core} -is:retweet -is:reply lang:en`.slice(0, 500);
}

export function normaliseNiche(niche: string): string {
  return niche.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
}

function toPulsePost(post: XPost, author: XUser | undefined): PulsePost {
  return {
    id: post.id,
    url: postUrl(author?.username ?? 'i', post.id),
    text: post.text,
    author: {
      username: author?.username ?? 'unknown',
      name: author?.name ?? 'Unknown',
      followers: author?.public_metrics.followers_count ?? 0,
      avatar: author?.profile_image_url ?? null,
    },
    createdAt: post.created_at,
    likes: post.public_metrics.like_count,
    replies: post.public_metrics.reply_count,
    reposts: post.public_metrics.retweet_count + post.public_metrics.quote_count,
  };
}

const GROUP_TOOL = {
  name: 'submit_topics',
  description: 'Submit the grouped topics.',
  input_schema: {
    type: 'object',
    properties: {
      topics: {
        type: 'array',
        minItems: 1,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Three to six words naming the conversation.' },
            summary: { type: 'string', description: 'One sentence on what people are saying, based only on the posts.' },
            angle: { type: 'string', description: 'One sentence: a take the user could post that adds something the posts are missing.' },
            post_ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
          },
          required: ['title', 'summary', 'angle', 'post_ids'],
        },
      },
    },
    required: ['topics'],
  },
};

export async function runNichePulse(nicheInput: string): Promise<{ pulse: NichePulse; cacheHit: boolean }> {
  const niche = normaliseNiche(nicheInput);
  if (niche.length < 2) throw new Error('Describe your niche in a few words first.');

  const { value, hit } = await cached(`x:pulse:${sha256Hex(niche)}`, PULSE_TTL_SECONDS, async () => {
    const query = nicheQuery(niche);
    const { posts, authors } = await searchRecent(query, { max: 100, sort: 'relevancy' });

    const cutoff = Date.now() - LOOKBACK_HOURS * 3600 * 1000;
    const recent = posts
      .filter((post) => new Date(post.created_at).getTime() >= cutoff)
      .sort((a, b) => postEngagement(b) - postEngagement(a))
      .slice(0, 40);

    if (recent.length === 0) {
      const empty: NichePulse = { niche, query, generatedAt: new Date().toISOString(), sampled: 0, topics: [] };
      return empty;
    }

    const byId = new Map(recent.map((post) => [post.id, post]));
    const { data } = await structuredCall<{ topics?: Array<{ title: string; summary: string; angle: string; post_ids: string[] }> }>({
      system:
        'You group recent X posts from one niche into the distinct conversations happening in it. Base every summary only on the posts given. Angles must be honest takes, not engagement bait. No emoji, no em dashes.',
      messages: [
        {
          role: 'user',
          content: `Niche: ${niche}\n\nPosts (id | engagement | text):\n${recent
            .map((post) => `${post.id} | ${postEngagement(post)} | ${post.text.replace(/\s+/g, ' ').slice(0, 280)}`)
            .join('\n')}`,
        },
      ],
      tool: GROUP_TOOL,
      temperature: 0.3,
      maxTokens: 1200,
    });

    const topics: PulseTopic[] = (data.topics ?? [])
      .map((topic) => ({
        title: String(topic.title ?? '').slice(0, 80),
        summary: String(topic.summary ?? '').slice(0, 300),
        angle: String(topic.angle ?? '').slice(0, 300),
        posts: (topic.post_ids ?? [])
          .map((id) => byId.get(String(id)))
          .filter((post): post is XPost => Boolean(post))
          .map((post) => toPulsePost(post, authors.get(post.author_id))),
      }))
      .filter((topic) => topic.title && topic.posts.length > 0);

    const pulse: NichePulse = { niche, query, generatedAt: new Date().toISOString(), sampled: recent.length, topics };
    return pulse;
  });

  return { pulse: value, cacheHit: hit };
}
