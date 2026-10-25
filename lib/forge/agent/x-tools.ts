/**
 * lib/forge/agent/x-tools.ts
 *
 * X intelligence exposed to the chat model, so "why is my account quiet?" or
 * "what is my niche talking about?" can be answered from live data inside a
 * conversation. The same modules back the Signals view and the public audit.
 */

import type { ToolDefinition } from '@/lib/ai/anthropic';
import type { PlanId } from '@/lib/billing/plans';
import { runProfileAudit } from '@/lib/x/audit';
import { xConfigured, XApiError } from '@/lib/x/client';
import { runNichePulse } from '@/lib/x/pulse';
import { hasFeature } from '../entitlements';
import type { AgentContext, ToolOutcome } from './tools';

export const X_AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'x_profile_audit',
    description:
      'Audit a public X account from live data: posting frequency, engagement, best and worst recent posts, and why it may be quiet. Use when the user asks about an X account, including their own.',
    input_schema: {
      type: 'object',
      properties: { handle: { type: 'string', description: 'The X handle, with or without @.' } },
      required: ['handle'],
    },
  },
  {
    name: 'x_niche_pulse',
    description:
      'See what a niche is talking about on X in the last 48 hours, grouped into topics with example posts. Use before writing a timely post, or when the user asks what to post about.',
    input_schema: {
      type: 'object',
      properties: { niche: { type: 'string', description: 'A few words describing the niche, e.g. "indie SaaS, building in public".' } },
      required: ['niche'],
    },
  },
];

export function xToolsAvailable(plan: PlanId): boolean {
  return xConfigured() && hasFeature(plan, 'profile_audit');
}

export async function executeXAgentTool(name: string, input: Record<string, unknown>, _ctx: AgentContext): Promise<ToolOutcome> {
  try {
    if (name === 'x_profile_audit') {
      const handle = typeof input.handle === 'string' ? input.handle : '';
      const { report } = await runProfileAudit(handle);
      const s = report.stats;
      return {
        result: [
          `@${report.user.username} (${report.user.name}): ${report.user.followers} followers, ${report.user.following} following.`,
          `Bio: ${report.user.bio || '(empty)'}`,
          `Last ${s.analysed} original posts over ${s.spanDays} days: ${s.postsPerWeek} per week, median ${s.medianLikes} likes, ${s.medianReplies} replies, ${s.medianReposts} reposts${s.medianImpressions !== null ? `, ${s.medianImpressions} impressions` : ''}.`,
          `Longest silence: ${s.longestGapDays} days. Posts with links: ${s.linkShare}%.`,
          report.flags.length > 0 ? `Flags: ${report.flags.map((f) => `${f.title} (${f.detail})`).join(' | ')}` : 'No major flags.',
          `Best post: "${report.best[0]?.text.slice(0, 280) ?? ''}" (${report.best[0]?.likes ?? 0} likes, ${report.best[0]?.replies ?? 0} replies)`,
          `Summary: ${report.narrative.headline}`,
          'Use only these numbers. Do not add benchmarks.',
        ].join('\n'),
      };
    }

    if (name === 'x_niche_pulse') {
      const niche = typeof input.niche === 'string' ? input.niche : '';
      const { pulse } = await runNichePulse(niche);
      if (pulse.topics.length === 0) {
        return { result: `No notable posts found for "${pulse.niche}" in the last 48 hours. Suggest broader terms.` };
      }
      return {
        result: pulse.topics
          .map(
            (topic, index) =>
              `${index + 1}. ${topic.title}: ${topic.summary}\nSuggested angle: ${topic.angle}\nExample: "${topic.posts[0]?.text.slice(0, 200) ?? ''}" (@${topic.posts[0]?.author.username ?? ''})`
          )
          .join('\n\n'),
      };
    }

    return { result: `Unknown tool: ${name}`, isError: true };
  } catch (error) {
    const message = error instanceof XApiError ? error.message : 'X data could not be loaded right now.';
    return { result: `${message} Tell the user plainly and continue without it.`, isError: true };
  }
}
