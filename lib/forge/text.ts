/**
 * lib/forge/text.ts
 *
 * Platform-accurate text measurement. Every limit shown in the UI and every
 * thread split comes from here, so the composer, the preview and the server
 * can never disagree about whether a post fits.
 */

import type { DraftPlatform } from './types';

// ============================================================================
// LIMITS
// ============================================================================

/**
 * Character limits as each platform counts them.
 *
 * X counts in weighted units (see countXCharacters). Bluesky counts graphemes.
 * The others count UTF-16 code units, which is what `string.length` returns,
 * and is also how their own composers count.
 */
export const PLATFORM_LIMITS: Record<DraftPlatform, number> = {
  x: 280,
  linkedin: 3000,
  threads: 500,
  bluesky: 300,
  instagram: 2200,
  newsletter: 50_000,
};

/** X shortens every URL to a t.co link that always counts as 23. */
const X_URL_WEIGHT = 23;

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/gi;

/**
 * Code point ranges X weighs as 1. Everything outside counts as 2, which is
 * why CJK text fills a post twice as fast. Mirrors twitter-text's v3 config.
 */
const X_LIGHT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
];

const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;

const graphemeSegmenter: Intl.Segmenter | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;

function graphemes(text: string): string[] {
  if (graphemeSegmenter) {
    return Array.from(graphemeSegmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

function isLightCodePoint(codePoint: number): boolean {
  return X_LIGHT_RANGES.some(([low, high]) => codePoint >= low && codePoint <= high);
}

/** Weighted length of a post as X's composer counts it. */
export function countXCharacters(text: string): number {
  let total = 0;
  let cursor = 0;

  URL_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_PATTERN.exec(text)) !== null) {
    total += weighPlainX(text.slice(cursor, match.index));
    total += X_URL_WEIGHT;
    cursor = match.index + match[0].length;
  }
  total += weighPlainX(text.slice(cursor));
  return total;
}

function weighPlainX(text: string): number {
  let total = 0;
  for (const cluster of graphemes(text)) {
    // An emoji is one unit of meaning however many code points it spans
    // (skin tones, ZWJ families), and X weighs it as 2.
    if (EMOJI_PATTERN.test(cluster)) {
      total += 2;
      continue;
    }
    for (const char of cluster) {
      total += isLightCodePoint(char.codePointAt(0) ?? 0) ? 1 : 2;
    }
  }
  return total;
}

/** Length of `text` as `platform` counts it. */
export function measure(text: string, platform: DraftPlatform): number {
  switch (platform) {
    case 'x':
      return countXCharacters(text);
    case 'bluesky':
      return graphemes(text).length;
    default:
      return text.length;
  }
}

export function fits(text: string, platform: DraftPlatform): boolean {
  return measure(text, platform) <= PLATFORM_LIMITS[platform];
}

// ============================================================================
// THREAD SPLITTING
// ============================================================================

// Sentence ends in Latin, Indic (danda), Arabic and CJK punctuation.
const SENTENCE_PATTERN = /[^.!?।॥؟。！？\n]+(?:[.!?।॥؟。！？]+["')\]」』]*|\n|$)/gu;

export function splitSentences(text: string): string[] {
  return (text.match(SENTENCE_PATTERN) ?? []).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0);
}

/**
 * Splits a long post into thread segments that each fit `platform`.
 *
 * Paragraph breaks are honoured first, then sentence boundaries, and words
 * only as a last resort, so a split never lands mid-thought when a cleaner
 * break exists. Existing segment boundaries (blank-line separated blocks the
 * author chose) are never merged across.
 */
export function splitIntoThread(text: string, platform: DraftPlatform = 'x'): string[] {
  const limit = PLATFORM_LIMITS[platform];
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const segments: string[] = [];
  let current = '';

  const flush = () => {
    if (current.trim()) segments.push(current.trim());
    current = '';
  };

  const append = (piece: string, separator: string) => {
    const candidate = current ? `${current}${separator}${piece}` : piece;
    if (measure(candidate, platform) <= limit) {
      current = candidate;
      return;
    }
    flush();
    if (measure(piece, platform) <= limit) {
      current = piece;
      return;
    }
    // A single sentence longer than the limit: fall back to word packing.
    for (const word of piece.split(/\s+/)) {
      const next = current ? `${current} ${word}` : word;
      if (measure(next, platform) <= limit) {
        current = next;
      } else {
        flush();
        current = word;
      }
    }
  };

  for (const paragraph of paragraphs) {
    if (measure(paragraph, platform) <= limit) {
      append(paragraph, '\n\n');
      continue;
    }
    flush();
    for (const sentence of splitSentences(paragraph)) {
      append(sentence, ' ');
    }
    flush();
  }
  flush();

  return segments;
}

// ============================================================================
// FEED FOLDS
// ============================================================================

/**
 * Where a platform's feed hides the rest of a post behind "see more".
 *
 * LinkedIn folds at roughly three lines on desktop, which is about 210
 * characters of unbroken text; line breaks fold it sooner. Instagram folds
 * captions after about 125 characters. These are display heuristics, not
 * guarantees, and the preview labels them that way.
 */
export function feedFoldIndex(text: string, platform: DraftPlatform): number | null {
  const charBudget = platform === 'linkedin' ? 210 : platform === 'instagram' ? 125 : null;
  if (charBudget === null) return null;

  const lineBudget = 3;
  let lines = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      lines += 1;
      if (lines >= lineBudget) return i;
    }
    if (i >= charBudget) {
      // Back up to the last word boundary so the fold never splits a word.
      const lastSpace = text.lastIndexOf(' ', i);
      return lastSpace > charBudget * 0.6 ? lastSpace : i;
    }
  }
  return null;
}

// ============================================================================
// GENERAL
// ============================================================================

export function firstLine(text: string): string {
  const line = text.split('\n').find((l) => l.trim().length > 0) ?? '';
  return line.trim();
}

const WORD_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}'\u2019-]*/gu;

export function words(text: string): string[] {
  return (text.toLowerCase().match(WORD_PATTERN) ?? []).map((w) => w.replace(/\u2019/g, "'"));
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}\u2026`;
}

/** Joins thread segments the way they would read as one post. */
export function joinSegments(segments: string[]): string {
  return segments
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n\n');
}

/** A filesystem-safe name: "My best post!" becomes "my-best-post". */
export function slug(text: string, max = 60): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max)
      .replace(/-+$/, '') || 'forge'
  );
}

/**
 * Trims a model-returned string field to `max` characters, with em dashes
 * replaced by commas (house style). Anything that is not a string is ''.
 */
export function cleanString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/—/g, ',').trim().slice(0, max) : '';
}
