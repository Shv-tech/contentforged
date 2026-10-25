/**
 * lib/forge/hooks.ts
 *
 * Classifies an opening line into a hook type.
 *
 * Deterministic on purpose: the Playbook compares performance across hook
 * types for one user, and niche intelligence compares them across many. Both
 * need the same post to land in the same bucket every time, which a model
 * call cannot promise. The rules are ordered from most to least specific and
 * the first match wins.
 */

import { firstLine } from './text';

export const HOOK_TYPES = ['question', 'number', 'confession', 'contrarian', 'how_to', 'list', 'story', 'statement'] as const;

export type HookType = (typeof HOOK_TYPES)[number];

export const HOOK_TYPE_LABELS: Record<HookType, string> = {
  question: 'Question',
  number: 'Number-led',
  confession: 'Confession',
  contrarian: 'Contrarian',
  how_to: 'How-to',
  list: 'List',
  story: 'Story',
  statement: 'Statement',
};

const CONFESSION =
  /\b(i (?:was wrong|failed|lost|quit|got fired|messed up|screwed up|made a mistake|almost)|my (?:biggest )?(?:mistake|failure)|i'?ve never told|confession|i (?:spent|wasted) \d)/i;
const CONTRARIAN =
  /\b(stop (?:doing|using|posting|trying)|unpopular opinion|is (?:dead|overrated|a lie|a myth)|you don'?t need|everyone is wrong|nobody should|forget (?:about )?|(?:is|are) not (?:the|a) (?:problem|answer))\b/i;
const HOW_TO = /^(how (?:to|i|we)|the (?:simple |easiest )?way to|here'?s how)\b/i;
const LIST =
  /^(\d+\s+(?:things|ways|lessons|mistakes|rules|tools|ideas|reasons|habits|tips|steps|books|signs)|(?:three|four|five|six|seven|ten) (?:things|ways|lessons|mistakes|rules))\b/i;
const STORY =
  /^(?:(?:in|on|last|yesterday|this|when|after|two|three|\d+) [^.]{0,40}(?:ago|year|month|week|day|morning|night|i|we)\b|i (?:was|remember|walked|got|had|met|started|built|launched))/i;
const NUMBER = /^[^a-z]*[$₹€£]?\d/i;

export function classifyHook(text: string): HookType {
  const line = firstLine(text);
  if (!line) return 'statement';

  if (/\?\s*$/.test(line)) return 'question';
  if (LIST.test(line)) return 'list';
  if (CONFESSION.test(line)) return 'confession';
  if (CONTRARIAN.test(line)) return 'contrarian';
  if (HOW_TO.test(line)) return 'how_to';
  if (NUMBER.test(line)) return 'number';
  if (STORY.test(line)) return 'story';
  return 'statement';
}
