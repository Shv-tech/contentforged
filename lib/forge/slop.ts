/**
 * lib/forge/slop.ts
 *
 * Phrases that mark text as machine-written. Readers have learned these
 * patterns, and a post that contains them reads as generic no matter how
 * good the idea underneath is.
 *
 * Two layers apply to every draft:
 *   1. The shared list below, curated by hand.
 *   2. A per-user list, built from phrases the user deletes from drafts
 *      (see lib/forge/learning.ts) and phrases they ban in chat.
 *
 * Patterns are matched case-insensitively against whole words. Each carries a
 * short reason so the UI can say why a line was flagged instead of only
 * underlining it.
 */

export interface SlopPattern {
  id: string;
  pattern: RegExp;
  reason: string;
}

const phrase = (id: string, source: string, reason: string): SlopPattern => ({
  id,
  // A lookahead rather than a trailing \b: several patterns end in
  // punctuation, after which \b would demand a following word character.
  pattern: new RegExp(`\\b${source}(?![\\p{L}\\p{N}])`, 'iu'),
  reason,
});

export const SHARED_SLOP: readonly SlopPattern[] = [
  phrase('realized-something', "that'?s when i realized", 'A stock turn that signals a template story.'),
  phrase('heres-the-thing', "here'?s the thing", 'Filler that delays the point.'),
  phrase('lets-dive', "let'?s dive in", 'Announces content instead of delivering it.'),
  phrase('delve', 'delve', 'One of the most recognisable machine-written words.'),
  phrase('tapestry', 'tapestry', 'Ornamental, rarely meant literally.'),
  phrase('testament', 'a testament to', 'Ornamental phrasing.'),
  phrase('game-changer', 'game[- ]changer', 'Overused claim with no information in it.'),
  phrase('in-todays', "in today'?s (?:fast-paced|digital|ever-changing)", 'A generic opener readers skip.'),
  phrase('unlock-potential', 'unlock(?:ing)? (?:your|the) (?:full )?potential', 'Vague promise.'),
  phrase('navigate-landscape', 'navigat(?:e|ing) the (?:\\w+ )?landscape', 'Abstract filler.'),
  phrase('double-edged', 'double[- ]edged sword', 'Cliche.'),
  phrase('foster', 'foster(?:s|ing)? a sense of', 'Corporate filler.'),
  phrase('elevate', 'elevate your', 'Marketing cliche.'),
  phrase('moreover', 'moreover', 'Essay transition, not how people post.'),
  phrase('furthermore', 'furthermore', 'Essay transition, not how people post.'),
  phrase('in-conclusion', 'in conclusion', 'Essay structure.'),
  phrase('hard-truth', 'the hard truth\\?', 'Overused setup.'),
  phrase('nobody-talks', 'nobody (?:is )?talk(?:s|ing) about', 'Overused setup, usually untrue.'),
  phrase('humbled', '(?:humbled|thrilled|excited) to (?:announce|share)', 'Announcement cliche.'),
  phrase('buckle-up', 'buckle up', 'Hype filler.'),
  phrase('secret-sauce', 'secret sauce', 'Cliche.'),
  phrase('at-the-end-of-the-day', 'at the end of the day', 'Filler.'),
  phrase('it-is-important-to-note', "it'?s (?:important|worth) (?:to note|noting)", 'Hedging filler.'),
  phrase('not-x-not-y', 'not \\w+\\. not \\w+\\.', 'The "Not X. Not Y." rhythm is a recognisable template.'),
];

export interface SlopHit {
  id: string;
  match: string;
  reason: string;
  index: number;
}

/**
 * Finds every slop pattern in `text`, plus any user-banned phrase.
 * User phrases are matched literally (escaped), never as regular expressions,
 * because they come from user input.
 */
export function findSlop(text: string, bannedPhrases: readonly string[] = []): SlopHit[] {
  const hits: SlopHit[] = [];

  for (const entry of SHARED_SLOP) {
    const global = new RegExp(entry.pattern.source, 'giu');
    let match: RegExpExecArray | null;
    while ((match = global.exec(text)) !== null) {
      hits.push({ id: entry.id, match: match[0], reason: entry.reason, index: match.index });
    }
  }

  for (const banned of bannedPhrases) {
    const trimmed = banned.trim();
    if (trimmed.length < 2) continue;
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(trimmed)}(?![\\p{L}\\p{N}])`, 'giu');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      hits.push({
        id: `user:${trimmed.toLowerCase()}`,
        match: match[0],
        reason: 'You have cut this phrase from earlier drafts.',
        index: match.index,
      });
    }
  }

  return hits.sort((a, b) => a.index - b.index);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Plain-text list for the system prompt, so the model avoids them up front. */
export function slopPromptList(): string {
  const examples = [
    "That's when I realized",
    "Here's the thing",
    "Let's dive in",
    'delve',
    'tapestry',
    'a testament to',
    'game-changer',
    "In today's fast-paced world",
    'unlock your potential',
    'navigate the landscape',
    'Moreover / Furthermore / In conclusion',
    'The hard truth?',
    'Nobody talks about',
    'Excited to announce',
    'Not X. Not Y. (as a rhythm device)',
  ];
  return examples.map((e) => `- ${e}`).join('\n');
}
