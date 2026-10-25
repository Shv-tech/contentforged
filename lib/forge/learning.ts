/**
 * lib/forge/learning.ts
 *
 * Edit-diff learning. A general-purpose assistant never sees what a user
 * changes before posting; Forge does, because the post is edited in Forge.
 * Every saved edit is reduced to a set of named signals, and signals that
 * repeat become suggested writing rules the user can accept with one click.
 *
 * Nothing is applied silently. A suggestion becomes a rule only when the user
 * says yes, because a pattern in someone's edits is evidence, not consent.
 */

import { firstLine, words } from './text';

// ============================================================================
// TOKEN DIFF
// ============================================================================

export type DiffOp = { kind: 'equal' | 'insert' | 'delete'; text: string };

const TOKEN_PATTERN = /\s+|[^\s]+/g;

function tokenize(text: string): string[] {
  return text.match(TOKEN_PATTERN) ?? [];
}

/**
 * Word-level diff via longest common subsequence. Posts are short, so the
 * quadratic table is cheap; past MAX_TOKENS it falls back to a line diff to
 * keep worst-case memory bounded.
 */
export function diffWords(before: string, after: string): DiffOp[] {
  const MAX_TOKENS = 1600;
  let a = tokenize(before);
  let b = tokenize(after);

  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    a = before.split(/(?<=\n)/);
    b = after.split(/(?<=\n)/);
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint16Array(rows * cols);

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] = a[i] === b[j] ? table[(i + 1) * cols + (j + 1)] + 1 : Math.max(table[(i + 1) * cols + j], table[i * cols + (j + 1)]);
    }
  }

  const ops: DiffOp[] = [];
  const push = (kind: DiffOp['kind'], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.kind === kind) last.text += text;
    else ops.push({ kind, text });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('equal', a[i]);
      i++;
      j++;
    } else if (table[(i + 1) * cols + j] >= table[i * cols + (j + 1)]) {
      push('delete', a[i]);
      i++;
    } else {
      push('insert', b[j]);
      j++;
    }
  }
  while (i < a.length) push('delete', a[i++]);
  while (j < b.length) push('insert', b[j++]);

  return ops;
}

// ============================================================================
// SIGNALS
// ============================================================================

export const SIGNAL_KEYS = [
  'removed_last_line',
  'removed_closing_question',
  'hook_rewritten',
  'hook_shortened',
  'shortened',
  'lengthened',
  'removed_emoji',
  'removed_hashtags',
  'removed_exclamation',
  'removed_em_dash',
  'lowercased',
  'added_line_breaks',
  'removed_line_breaks',
] as const;

export type SignalKey = (typeof SIGNAL_KEYS)[number];

export interface EditSignals {
  flags: Partial<Record<SignalKey, true>>;
  /** Short contiguous phrases the user deleted outright. */
  removedPhrases: string[];
  lengthRatio: number;
}

const EMOJI = /\p{Extended_Pictographic}/gu;
const HASHTAG = /(?:^|\s)#[\p{L}\p{N}_]+/gu;

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

function nonEmptyLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export function extractSignals(before: string, after: string): EditSignals {
  const flags: EditSignals['flags'] = {};
  const beforeLines = nonEmptyLines(before);
  const afterLines = nonEmptyLines(after);

  const lastBefore = beforeLines[beforeLines.length - 1] ?? '';
  if (lastBefore && afterLines.length < beforeLines.length && !after.includes(lastBefore)) {
    flags.removed_last_line = true;
    if (/\?[\s\p{Extended_Pictographic}]*$/u.test(lastBefore)) flags.removed_closing_question = true;
  }

  const hookBefore = firstLine(before);
  const hookAfter = firstLine(after);
  if (hookBefore && hookAfter && hookBefore !== hookAfter) {
    flags.hook_rewritten = true;
    const wb = words(hookBefore).length;
    const wa = words(hookAfter).length;
    if (wb > 0 && wa <= wb * 0.8) flags.hook_shortened = true;
  }

  const lengthRatio = before.length === 0 ? 1 : after.length / before.length;
  if (lengthRatio < 0.85) flags.shortened = true;
  if (lengthRatio > 1.15) flags.lengthened = true;

  if (countMatches(after, EMOJI) < countMatches(before, EMOJI)) flags.removed_emoji = true;
  if (countMatches(after, HASHTAG) < countMatches(before, HASHTAG)) flags.removed_hashtags = true;
  if (countMatches(after, /!/g) < countMatches(before, /!/g)) flags.removed_exclamation = true;
  if (countMatches(after, /\u2014|\s--\s|\s\u2013\s/g) < countMatches(before, /\u2014|\s--\s|\s\u2013\s/g)) {
    flags.removed_em_dash = true;
  }

  const upperBefore = beforeLines.filter((l) => /^\p{Lu}/u.test(l) && !/^I\b/.test(l)).length;
  const upperAfter = afterLines.filter((l) => /^\p{Lu}/u.test(l) && !/^I\b/.test(l)).length;
  if (upperBefore >= 2 && upperAfter <= upperBefore * 0.3) flags.lowercased = true;

  const breaksBefore = countMatches(before, /\n/g);
  const breaksAfter = countMatches(after, /\n/g);
  if (breaksAfter >= breaksBefore + 3) flags.added_line_breaks = true;
  if (breaksBefore >= breaksAfter + 3) flags.removed_line_breaks = true;

  return { flags, removedPhrases: removedPhrases(before, after), lengthRatio };
}

/**
 * Phrases of two to six words deleted without replacement. These are the
 * strongest evidence of a phrase someone does not want in their mouth.
 * Deletions that were replaced are rewrites, not rejections, and are skipped.
 */
function removedPhrases(before: string, after: string): string[] {
  const ops = diffWords(before, after);
  const phrases: string[] = [];

  ops.forEach((op, index) => {
    if (op.kind !== 'delete') return;
    const next = ops[index + 1];
    const prev = ops[index - 1];
    const replaced = (next && next.kind === 'insert') || (prev && prev.kind === 'insert');
    if (replaced) return;

    const phrase = op.text
      .replace(/\p{Extended_Pictographic}/gu, '')
      .trim()
      .replace(/[.,;:!?]+$/, '');
    const count = words(phrase).length;
    if (count >= 2 && count <= 6 && phrase.length <= 60) phrases.push(phrase.toLowerCase());
  });

  return Array.from(new Set(phrases));
}

// ============================================================================
// SUGGESTIONS
// ============================================================================

export interface RuleSuggestion {
  signalKey: string;
  rule: string;
  kind: 'preference' | 'banned_phrase' | 'structure' | 'format';
  /** The question shown to the user. */
  prompt: string;
  evidence: number;
  outOf: number;
}

const SIGNAL_RULES: Partial<Record<SignalKey, { rule: string; kind: RuleSuggestion['kind']; prompt: (n: number, of: number) => string }>> = {
  removed_last_line: {
    rule: 'Do not end posts with a separate closing line. Stop when the point is made.',
    kind: 'structure',
    prompt: (n) => `You've cut the last line of ${n} drafts. Stop writing them?`,
  },
  removed_closing_question: {
    rule: 'Do not end posts with a question to the reader.',
    kind: 'structure',
    prompt: (n) => `You've deleted the closing question ${n} times. Stop adding one?`,
  },
  hook_shortened: {
    rule: 'Keep the opening line short: one clause, under ten words.',
    kind: 'structure',
    prompt: (n, of) => `You shortened the first line in ${n} of your last ${of} drafts. Write shorter hooks?`,
  },
  shortened: {
    rule: 'Write tighter first drafts. Cut a fifth of the words before showing a draft.',
    kind: 'preference',
    prompt: (n, of) => `You trimmed ${n} of your last ${of} drafts. Start shorter?`,
  },
  removed_emoji: {
    rule: 'No emoji.',
    kind: 'format',
    prompt: (n) => `You've removed emoji from ${n} drafts. Never use them?`,
  },
  removed_hashtags: {
    rule: 'No hashtags.',
    kind: 'format',
    prompt: (n) => `You've removed hashtags from ${n} drafts. Never add them?`,
  },
  removed_exclamation: {
    rule: 'No exclamation marks.',
    kind: 'format',
    prompt: (n) => `You've removed exclamation marks ${n} times. Drop them for good?`,
  },
  removed_em_dash: {
    rule: 'Never use dashes as punctuation.',
    kind: 'format',
    prompt: (n) => `You've replaced dashes in ${n} drafts. Stop using them?`,
  },
  lowercased: {
    rule: 'Write in lowercase, except for proper nouns and "I".',
    kind: 'format',
    prompt: (n) => `You've lowercased ${n} drafts. Write in lowercase from now on?`,
  },
  added_line_breaks: {
    rule: 'Use more line breaks: one or two sentences per paragraph.',
    kind: 'format',
    prompt: (n) => `You added line breaks to ${n} drafts. Write with more white space?`,
  },
};

const MIN_EVIDENCE = 3;
const MIN_SHARE = 0.5;

/**
 * Turns a window of recent edits into rule suggestions.
 *
 * A signal must appear at least MIN_EVIDENCE times and in at least half the
 * window. Two edits that happen to share a trait are a coincidence; most of
 * the last eight are a habit.
 *
 * `known` holds signal keys already accepted or rejected, so a dismissed
 * suggestion is never raised again.
 */
export function suggestRules(recent: EditSignals[], known: ReadonlySet<string>): RuleSuggestion[] {
  const window = recent.length;
  if (window < MIN_EVIDENCE) return [];

  const suggestions: RuleSuggestion[] = [];

  for (const key of SIGNAL_KEYS) {
    const spec = SIGNAL_RULES[key];
    if (!spec || known.has(key)) continue;
    const evidence = recent.filter((s) => s.flags[key]).length;
    if (evidence >= MIN_EVIDENCE && evidence / window >= MIN_SHARE) {
      suggestions.push({
        signalKey: key,
        rule: spec.rule,
        kind: spec.kind,
        prompt: spec.prompt(evidence, window),
        evidence,
        outOf: window,
      });
    }
  }

  // The more specific closing-question rule supersedes the generic one.
  if (suggestions.some((s) => s.signalKey === 'removed_closing_question')) {
    const index = suggestions.findIndex((s) => s.signalKey === 'removed_last_line');
    if (index >= 0) suggestions.splice(index, 1);
  }

  const phraseCounts = new Map<string, number>();
  for (const signals of recent) {
    for (const phrase of signals.removedPhrases) {
      phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
    }
  }
  for (const [phrase, evidence] of phraseCounts) {
    const key = `phrase:${phrase}`;
    if (evidence < 2 || known.has(key)) continue;
    suggestions.push({
      signalKey: key,
      rule: `Never write "${phrase}".`,
      kind: 'banned_phrase',
      prompt: `You've deleted "${phrase}" ${evidence} times. Ban it?`,
      evidence,
      outOf: window,
    });
  }

  return suggestions.sort((a, b) => b.evidence - a.evidence).slice(0, 3);
}

/** Extracts the literal phrase from a banned-phrase rule, for the slop filter. */
export function bannedPhraseFromRule(rule: string): string | null {
  const match = rule.match(/^Never write "(.+)"\.$/);
  return match ? match[1] : null;
}
