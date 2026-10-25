/**
 * lib/forge/screenshot-metrics.ts
 *
 * Reads post results off a screenshot of a platform's analytics screen, for
 * platforms whose numbers cannot be pulled automatically (LinkedIn without
 * the analytics scope, Instagram). The values are returned for the user to
 * confirm before they are stored; a misread number never lands silently.
 */

import { structuredCall } from '@/lib/ai/anthropic';
import type { TokenUsage } from '@/lib/billing/plans';
import { EMPTY_VALUES, type MetricValues } from './metrics';

const TOOL = {
  name: 'submit_metrics',
  description: 'Submit the numbers visible in the screenshot.',
  input_schema: {
    type: 'object',
    properties: {
      impressions: { type: ['integer', 'null'], description: 'Impressions or views. Null if not shown.' },
      likes: { type: ['integer', 'null'], description: 'Likes or reactions.' },
      replies: { type: ['integer', 'null'], description: 'Comments or replies.' },
      reposts: { type: ['integer', 'null'], description: 'Reposts, reshares or retweets.' },
      quotes: { type: ['integer', 'null'] },
      bookmarks: { type: ['integer', 'null'], description: 'Saves or bookmarks.' },
      clicks: { type: ['integer', 'null'], description: 'Link or profile clicks.' },
      followers_gained: { type: ['integer', 'null'] },
      readable: { type: 'boolean', description: 'False if this is not a post analytics screen or the numbers are unreadable.' },
    },
    required: ['readable'],
  },
};

const SYSTEM = `You read social media post analytics screenshots. Report only numbers that are clearly visible. Convert abbreviations (1.2K = 1200, 3.4M = 3400000). Leave a field null when it is not shown. Never estimate.`;

export async function readMetricsScreenshot(image: { mediaType: string; base64: string }): Promise<{ values: MetricValues | null; usage: TokenUsage }> {
  const { data, usage } = await structuredCall<Partial<MetricValues> & { readable?: boolean }>({
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
          { type: 'text', text: 'Read the post results in this screenshot.' },
        ],
      },
    ],
    tool: TOOL,
    temperature: 0,
    maxTokens: 300,
  });

  if (!data.readable) return { values: null, usage };
  const clean = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null);
  return {
    values: {
      ...EMPTY_VALUES,
      impressions: clean(data.impressions),
      likes: clean(data.likes),
      replies: clean(data.replies),
      reposts: clean(data.reposts),
      quotes: clean(data.quotes),
      bookmarks: clean(data.bookmarks),
      clicks: clean(data.clicks),
      followers_gained: typeof data.followers_gained === 'number' ? Math.round(data.followers_gained) : null,
    },
    usage,
  };
}
