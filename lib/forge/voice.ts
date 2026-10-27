/**
 * lib/forge/voice.ts
 *
 * The voice fingerprint: a measured description of how someone writes, built
 * from their own past posts, and a scorer that says how closely a draft
 * matches it.
 *
 * WHY MEASURED AND NOT DESCRIBED
 *
 * "Direct, witty, professional" describes half of LinkedIn. Sentence length,
 * line-break rhythm, punctuation habits and the words someone reaches for are
 * specific to one person and can be checked line by line. A description can
 * be pasted into any chatbot; a fingerprint built from 80 real posts cannot.
 *
 * Everything here is deterministic and runs in under a millisecond per
 * draft, so the meter can update on every keystroke in the editor and the
 * same number appears on the server and the client.
 */

import { classifyHook, HOOK_TYPES, type HookType } from './hooks';
import { buildLanguageProfile, describeLanguage, languageMismatch, languageTraitLine, type LanguageProfile } from './language';
import { findSlop, type SlopHit } from './slop';
import { splitSentences, words } from './text';
import type { WritingLanguage } from './types';

/** Fewer samples than this and the fingerprint is too noisy to score with. */
export const MIN_SAMPLES_FOR_SCORING = 5;

export interface VoiceProfile {
  version: 1;
  sampleCount: number;
  chars: { median: number; p90: number };
  sentenceWords: { mean: number; sd: number; p90: number };
  /** Line breaks per 100 words. */
  lineBreaksPer100: number;
  /** Share of lines that start with a lowercase letter. */
  lowercaseLineShare: number;
  /** Per 100 words. */
  punctuation: {
    emDash: number;
    ellipsis: number;
    exclamation: number;
    question: number;
    semicolon: number;
    colon: number;
  };
  /** Per post. */
  perPost: { emoji: number; hashtags: number; mentions: number; links: number; listLines: number };
  openers: Record<HookType, number>;
  /** Words this person reaches for unusually often. */
  signatureWords: string[];
  /** Script and code-switching. Absent on fingerprints built before it was measured. */
  language?: LanguageProfile;
}

export type DriftReason = 'slop' | 'long_sentence' | 'em_dash' | 'exclamation' | 'semicolon' | 'emoji' | 'hashtag' | 'capitalisation';

export interface LineDrift {
  line: number;
  reasons: DriftReason[];
  detail: string;
}

export interface VoiceScore {
  /** 0 to 100, or null when there are too few samples to judge. */
  score: number | null;
  drift: LineDrift[];
  slop: SlopHit[];
  /** Set when the draft is in a different language or script from the person's own posts. */
  language?: { expected: WritingLanguage; found: WritingLanguage } | null;
}

export const DRIFT_LABELS: Record<DriftReason, string> = {
  slop: 'Reads as machine-written',
  long_sentence: 'Longer than you usually write',
  em_dash: 'You rarely use dashes',
  exclamation: 'You rarely use exclamation marks',
  semicolon: 'You rarely use semicolons',
  emoji: 'You rarely use emoji',
  hashtag: 'You rarely use hashtags',
  capitalisation: 'You usually write in lowercase',
};

// ============================================================================
// FEATURE EXTRACTION
// ============================================================================

const EMOJI = /\p{Extended_Pictographic}/gu;
const HASHTAG = /(?:^|\s)#[\p{L}\p{N}_]+/gu;
const MENTION = /(?:^|\s)@[A-Za-z0-9_]{1,30}/g;
const LINK = /https?:\/\/\S+/g;
const LIST_LINE = /^\s*(?:[-*\u2022]|\d+[.)])\s+/;

// Non-global twins for single-line tests. A global pattern's .test() moves
// lastIndex, which makes the next call on a different string skip ahead.
const HAS_EMOJI = /\p{Extended_Pictographic}/u;
const HAS_HASHTAG = /(?:^|\s)#[\p{L}\p{N}_]+/u;

function count(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

function per100(value: number, wordCount: number): number {
  return wordCount === 0 ? 0 : (value / wordCount) * 100;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sorted[base + 1] ?? sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1));
}

function sentenceLengths(text: string): number[] {
  return splitSentences(text)
    .map((sentence) => words(sentence).length)
    .filter((length) => length > 0);
}

function nonEmptyLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

// ============================================================================
// BUILD
// ============================================================================

export function buildVoiceProfile(samples: string[]): VoiceProfile {
  const posts = samples.map((s) => s.trim()).filter((s) => s.length > 0);
  const all = posts.join('\n\n');
  const allWords = words(all);
  const wordCount = allWords.length;

  const lengths = posts.map((p) => p.length).sort((a, b) => a - b);
  const sentences = posts.flatMap(sentenceLengths).sort((a, b) => a - b);
  const lines = posts.flatMap(nonEmptyLines);
  const letterLines = lines.filter((l) => /^\p{L}/u.test(l));

  const openers = Object.fromEntries(HOOK_TYPES.map((t) => [t, 0])) as Record<HookType, number>;
  for (const post of posts) openers[classifyHook(post)] += 1;

  const postCount = Math.max(posts.length, 1);

  return {
    version: 1,
    sampleCount: posts.length,
    chars: { median: quantile(lengths, 0.5), p90: quantile(lengths, 0.9) },
    sentenceWords: {
      mean: round(mean(sentences)),
      sd: round(standardDeviation(sentences)),
      p90: round(quantile(sentences, 0.9)),
    },
    lineBreaksPer100: round(per100(count(all, /\n/g), wordCount)),
    lowercaseLineShare: round(letterLines.length === 0 ? 0 : letterLines.filter((l) => /^\p{Ll}/u.test(l)).length / letterLines.length),
    punctuation: {
      emDash: round(per100(count(all, /\u2014|\s--\s|\s\u2013\s/g), wordCount)),
      ellipsis: round(per100(count(all, /\.\.\.|\u2026/g), wordCount)),
      exclamation: round(per100(count(all, /!/g), wordCount)),
      question: round(per100(count(all, /\?/g), wordCount)),
      semicolon: round(per100(count(all, /;/g), wordCount)),
      colon: round(per100(count(all, /:(?!\/\/)/g), wordCount)),
    },
    perPost: {
      emoji: round(count(all, EMOJI) / postCount),
      hashtags: round(count(all, HASHTAG) / postCount),
      mentions: round(count(all, MENTION) / postCount),
      links: round(count(all, LINK) / postCount),
      listLines: round(lines.filter((l) => LIST_LINE.test(l)).length / postCount),
    },
    openers,
    signatureWords: signatureWords(allWords, posts.length),
    language: buildLanguageProfile(posts),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Words used often by this person and not merely common in English.
 * A word must appear in at least two different posts to count, so one long
 * post about a single topic does not fill the list with its subject.
 */
function signatureWords(allWords: string[], postCount: number): string[] {
  if (postCount < 2) return [];
  const frequency = new Map<string, number>();
  for (const raw of allWords) {
    const word = raw.replace(/'/g, '');
    if (word.length < 3 || COMMON_WORDS.has(word) || /^\d+$/.test(word)) continue;
    frequency.set(word, (frequency.get(word) ?? 0) + 1);
  }
  return Array.from(frequency.entries())
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([word]) => word);
}

/**
 * Short plain-language traits for the Brand DNA card. Derived from the
 * profile, so they are always true of the samples rather than flattering.
 */
export function describeVoice(profile: VoiceProfile): string[] {
  const traits: string[] = [];
  const s = profile.sentenceWords.mean;

  const languageTrait = profile.language ? describeLanguage(profile.language) : null;
  if (languageTrait) traits.push(languageTrait);

  if (s > 0 && s <= 9) traits.push('Short, clipped sentences');
  else if (s >= 18) traits.push('Long, developed sentences');
  else if (s > 0) traits.push('Medium-length sentences');

  if (profile.lineBreaksPer100 >= 12) traits.push('Lots of white space');
  if (profile.lowercaseLineShare >= 0.6) traits.push('Writes in lowercase');
  if (profile.perPost.emoji < 0.15) traits.push('No emoji');
  else if (profile.perPost.emoji >= 1.5) traits.push('Emoji as punctuation');
  if (profile.punctuation.question >= 1.5) traits.push('Asks the reader questions');
  if (profile.perPost.listLines >= 2) traits.push('Thinks in lists');
  if (profile.perPost.hashtags < 0.1) traits.push('No hashtags');

  const topOpener = (Object.entries(profile.openers) as [HookType, number][]).sort((a, b) => b[1] - a[1])[0];
  if (topOpener && topOpener[1] >= Math.max(2, profile.sampleCount * 0.3)) {
    const openerTrait: Record<HookType, string> = {
      question: 'Opens with a question',
      number: 'Leads with numbers',
      confession: 'Opens with an admission',
      contrarian: 'Opens against the grain',
      how_to: 'Opens with the method',
      list: 'Opens with a list',
      story: 'Opens with a scene',
      statement: 'Opens with a flat statement',
    };
    traits.push(openerTrait[topOpener[0]]);
  }

  return traits.slice(0, 6);
}

// ============================================================================
// SCORE
// ============================================================================

/**
 * Scores `draft` against `profile`.
 *
 * The score is built from penalties that each map to something the user can
 * see and fix: a sentence far longer than they write, punctuation they never
 * use, a phrase that reads as machine-written. A number with no visible
 * reason behind it would not be trusted, and would not teach anything.
 */
export function scoreVoice(draft: string, profile: VoiceProfile | null, bannedPhrases: readonly string[] = []): VoiceScore {
  const slop = findSlop(draft, bannedPhrases);
  const drift = lineDrift(draft, profile, slop);

  if (!profile || profile.sampleCount < MIN_SAMPLES_FOR_SCORING) {
    return { score: null, drift, slop };
  }

  const draftWords = words(draft);
  const wordCount = Math.max(draftWords.length, 1);
  const sentences = sentenceLengths(draft);

  let penalty = 0;

  // Rhythm: distance of the average sentence from theirs, in units of their
  // own spread, with a floor so very consistent writers are not punished for
  // a one-word difference.
  const spread = Math.max(profile.sentenceWords.sd, 3);
  const sentenceGap = Math.abs(mean(sentences) - profile.sentenceWords.mean) / spread;
  penalty += Math.min(sentenceGap, 3) * 9;

  // Line-break density.
  const breaks = per100(count(draft, /\n/g), wordCount);
  const breakTolerance = Math.max(profile.lineBreaksPer100 * 0.5, 4);
  penalty += Math.min(Math.abs(breaks - profile.lineBreaksPer100) / breakTolerance, 3) * 5;

  // Punctuation and markers they almost never use. Each is a visible tell.
  penalty += markerPenalty(per100(count(draft, /\u2014|\s--\s|\s\u2013\s/g), wordCount), profile.punctuation.emDash, 7);
  penalty += markerPenalty(per100(count(draft, /!/g), wordCount), profile.punctuation.exclamation, 5);
  penalty += markerPenalty(per100(count(draft, /;/g), wordCount), profile.punctuation.semicolon, 4);
  penalty += markerPenalty(count(draft, EMOJI), profile.perPost.emoji, 6);
  penalty += markerPenalty(count(draft, HASHTAG), profile.perPost.hashtags, 5);

  // Capitalisation, for people who write in lowercase.
  if (profile.lowercaseLineShare >= 0.6) {
    const lines = nonEmptyLines(draft).filter((l) => /^\p{L}/u.test(l));
    const upper = lines.filter((l) => /^\p{Lu}/u.test(l)).length;
    if (lines.length > 0) penalty += (upper / lines.length) * 12;
  }

  // Machine-written phrasing is the strongest single signal.
  penalty += slop.length * 8;

  // A Hinglish writer's draft in textbook English is not their voice,
  // however good the rhythm.
  const mismatch = languageMismatch(draft, profile.language);
  if (mismatch) penalty += mismatch.penalty;

  // A small credit for reaching for their own words.
  const signature = new Set(profile.signatureWords);
  const shared = new Set(draftWords.filter((w) => signature.has(w))).size;
  penalty -= Math.min(shared, 4) * 1.5;

  const score = Math.round(Math.max(0, Math.min(100, 100 - penalty)));
  return { score, drift, slop, language: mismatch ? { expected: mismatch.expected, found: mismatch.found } : null };
}

/** Penalty for using a marker the person rarely uses. Zero if they use it. */
function markerPenalty(draftRate: number, usualRate: number, weight: number): number {
  if (draftRate === 0) return 0;
  if (usualRate >= draftRate * 0.5) return 0;
  const excess = usualRate === 0 ? 1 : Math.min((draftRate - usualRate) / Math.max(draftRate, 1e-6), 1);
  return weight * excess;
}

function lineDrift(draft: string, profile: VoiceProfile | null, slop: SlopHit[]): LineDrift[] {
  const results: LineDrift[] = [];
  const lines = draft.split('\n');
  let offset = 0;

  const usable = profile && profile.sampleCount >= MIN_SAMPLES_FOR_SCORING ? profile : null;

  lines.forEach((line, index) => {
    const start = offset;
    const end = offset + line.length;
    offset = end + 1;
    if (!line.trim()) return;

    const reasons: DriftReason[] = [];
    const details: string[] = [];

    const lineSlop = slop.filter((hit) => hit.index >= start && hit.index < end);
    if (lineSlop.length > 0) {
      reasons.push('slop');
      details.push(`"${lineSlop[0].match}": ${lineSlop[0].reason}`);
    }

    if (usable) {
      const longest = Math.max(0, ...sentenceLengths(line));
      if (usable.sentenceWords.p90 > 0 && longest > usable.sentenceWords.p90 * 1.4 && longest >= 14) {
        reasons.push('long_sentence');
        details.push(`${longest} words; you usually stay under ${Math.round(usable.sentenceWords.p90)}.`);
      }
      if (/\u2014|\s--\s|\s\u2013\s/.test(line) && usable.punctuation.emDash < 0.1) reasons.push('em_dash');
      if (/!/.test(line) && usable.punctuation.exclamation < 0.1) reasons.push('exclamation');
      if (/;/.test(line) && usable.punctuation.semicolon < 0.05) reasons.push('semicolon');
      if (HAS_EMOJI.test(line) && usable.perPost.emoji < 0.15) reasons.push('emoji');
      if (HAS_HASHTAG.test(line) && usable.perPost.hashtags < 0.1) reasons.push('hashtag');
      if (usable.lowercaseLineShare >= 0.7 && /^\p{Lu}/u.test(line.trim()) && !/^I\b/.test(line.trim())) {
        reasons.push('capitalisation');
      }
    }

    if (reasons.length > 0) {
      results.push({
        line: index,
        reasons,
        detail: details[0] ?? DRIFT_LABELS[reasons[0]],
      });
    }
  });

  return results;
}

/**
 * A compact, prompt-ready description of the profile. Sent with every
 * generation so the model writes toward the fingerprint instead of away from
 * it and then being corrected.
 */
export function voicePromptBlock(profile: VoiceProfile, traits: string[]): string {
  const p = profile.punctuation;
  const lines = [
    `Measured from ${profile.sampleCount} of the user's own posts. Match these numbers, not a generic style:`,
    `- Typical post length: about ${Math.round(profile.chars.median)} characters (90% under ${Math.round(profile.chars.p90)}).`,
    `- Sentences average ${profile.sentenceWords.mean} words; 90% are ${Math.round(profile.sentenceWords.p90)} words or fewer.`,
    `- Line breaks: about ${profile.lineBreaksPer100} per 100 words.`,
    profile.lowercaseLineShare >= 0.6 ? '- Writes lines in lowercase. Keep that.' : '',
    p.emDash < 0.1 ? '- Never uses dashes as punctuation.' : '',
    p.exclamation < 0.1 ? '- Almost never uses exclamation marks.' : '',
    profile.perPost.emoji < 0.15 ? '- Uses no emoji.' : `- Uses about ${profile.perPost.emoji} emoji per post.`,
    profile.perPost.hashtags < 0.1 ? '- Uses no hashtags.' : `- Uses about ${profile.perPost.hashtags} hashtags per post.`,
    profile.signatureWords.length > 0 ? `- Words they reach for: ${profile.signatureWords.slice(0, 12).join(', ')}.` : '',
    languageTraitLine(profile.language) ?? '',
    traits.length > 0 ? `- In short: ${traits.join('; ')}.` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

/**
 * The 250 most frequent English words plus common social filler. Excluded
 * from signature words because everyone uses them.
 */
const COMMON_WORDS = new Set(
  (
    'the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us is are was were been has had did does said got made thing things really very much more many lot still need going ' +
    'here where why while those should may might must shall every each few own same such too into through during before above below between both under again further once off down why let also ever never always often sometimes today yesterday tomorrow week month years months weeks days im ive dont cant wont didnt doesnt isnt arent youre theyre thats whats theres lets its youve weve wasnt werent hasnt havent hadnt couldnt wouldnt shouldnt yes yeah okay ok actually maybe probably already almost enough quite rather right left last next big small great little long short high low old young early late real sure'
  ).split(/\s+/)
);
