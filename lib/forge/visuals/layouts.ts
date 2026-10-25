/**
 * lib/forge/visuals/layouts.ts
 *
 * How a draft becomes slides. Deterministic: the slides are cut from the
 * author's own words, never rewritten, so a carousel says exactly what the
 * approved post says.
 *
 *   quote      one line, the strongest in the post, as a pull quote
 *   statement  the opening, set large
 *   carousel   one idea per slide, from the draft's segments or paragraphs
 *   list       the post's list items, one per slide after a title slide
 */

import { draftText } from '../draft-text';
import { firstLine } from '../text';
import type { DraftRecord, DraftVisual, VisualLayout } from '../types';

export const VISUAL_LAYOUTS: ReadonlyArray<{ value: VisualLayout; label: string; description: string }> = [
  { value: 'carousel', label: 'Carousel', description: 'One idea per slide. For LinkedIn documents and Instagram.' },
  { value: 'quote', label: 'Quote card', description: 'The line people will repeat, set as a card.' },
  { value: 'statement', label: 'Statement', description: 'The opening, large, for a single image post.' },
  { value: 'list', label: 'List', description: 'A title slide, then one item per slide.' },
];

export const MAX_SLIDES = 12;
const MAX_SLIDE_CHARS = 320;

const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/;

function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Splits a paragraph that is too long for one slide at sentence boundaries. */
function fitSlides(parts: string[]): string[] {
  const slides: string[] = [];
  for (const part of parts) {
    if (part.length <= MAX_SLIDE_CHARS) {
      slides.push(part);
      continue;
    }
    let current = '';
    for (const sentence of part.split(/(?<=[.!?])\s+/)) {
      if ((current + ' ' + sentence).trim().length > MAX_SLIDE_CHARS && current) {
        slides.push(current.trim());
        current = sentence;
      } else {
        current = `${current} ${sentence}`.trim();
      }
    }
    if (current) slides.push(current.trim());
  }
  return slides;
}

/** Merges consecutive very short paragraphs so a slide is never a single word. */
function mergeShort(parts: string[]): string[] {
  const merged: string[] = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    if (last !== undefined && (last.length < 40 || part.length < 25) && last.length + part.length < 200) merged[merged.length - 1] = `${last}\n${part}`;
    else merged.push(part);
  }
  return merged;
}

/** The line most worth quoting: short, complete, and not a question. */
function strongestLine(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 20 && l.length <= 180 && !LIST_ITEM.test(l));
  const statements = lines.filter((l) => !/\?$/.test(l));
  return (statements[1] ?? statements[0] ?? lines[0] ?? firstLine(text)).slice(0, 220);
}

export function deriveSlides(draft: Pick<DraftRecord, 'body' | 'segments' | 'kind'>, layout: VisualLayout): string[] {
  const text = draftText(draft as DraftRecord);

  switch (layout) {
    case 'quote':
      return [strongestLine(text)];
    case 'statement':
      return [fitSlides([paragraphs(text)[0] ?? firstLine(text)])[0]];
    case 'list': {
      const items = text
        .split('\n')
        .map((line) => line.match(LIST_ITEM)?.[1]?.trim())
        .filter((item): item is string => Boolean(item));
      const title = firstLine(text);
      return [title, ...(items.length > 0 ? items : paragraphs(text).slice(1))].slice(0, MAX_SLIDES).map((s) => s.slice(0, MAX_SLIDE_CHARS));
    }
    case 'carousel':
    default: {
      const source = draft.segments.length > 1 ? draft.segments : mergeShort(paragraphs(text));
      return fitSlides(source).slice(0, MAX_SLIDES);
    }
  }
}

/** A sensible default visual for a draft, chosen from its shape. */
export function defaultVisual(draft: Pick<DraftRecord, 'body' | 'segments' | 'kind' | 'platform'>): DraftVisual {
  const text = draftText(draft as DraftRecord);
  const listLines = text.split('\n').filter((l) => LIST_ITEM.test(l)).length;
  const layout: VisualLayout = draft.kind === 'carousel' || draft.kind === 'thread' ? 'carousel' : listLines >= 3 ? 'list' : text.length > 500 ? 'carousel' : 'quote';
  return {
    layout,
    slides: deriveSlides(draft, layout),
    aspect: draft.platform === 'instagram' || layout === 'carousel' || layout === 'list' ? 'portrait' : 'square',
    updatedAt: new Date().toISOString(),
  };
}

/** True when a slide still has a [bracket] waiting for a fact. */
export function hasPlaceholders(slides: string[]): boolean {
  return slides.some((slide) => /\[[^\]]{2,}\]/.test(slide));
}
