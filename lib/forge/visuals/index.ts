/**
 * lib/forge/visuals/index.ts
 *
 * A draft's visual, end to end: its stored layout (or a sensible default),
 * the brand kit it renders with, and the PNG or PDF that comes out.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getBrandKit, kitImage } from '../data/brand-kit';
import { HttpError } from '../http';
import type { DraftRecord, DraftVisual } from '../types';
import { defaultVisual } from './layouts';
import { renderPdf, renderSlidePng, type Aspect, type SlideInput } from './render';

export function visualOf(draft: DraftRecord): DraftVisual {
  return draft.visual && draft.visual.slides.length > 0 ? draft.visual : defaultVisual(draft);
}

async function slideInputs(db: SupabaseClient, draft: DraftRecord, visual: DraftVisual): Promise<SlideInput[]> {
  const kit = await getBrandKit(db, draft.user_id, draft.workspace_id);
  const [headshot, logo] = await Promise.all([kitImage(kit.headshot_path), kitImage(kit.logo_path)]);
  const aspect: Aspect = visual.aspect;
  return visual.slides.map((text, index) => ({ text, index, total: visual.slides.length, layout: visual.layout, aspect, kit, headshot, logo }));
}

export async function renderDraftSlide(db: SupabaseClient, draft: DraftRecord, slide: number): Promise<Uint8Array> {
  const visual = visualOf(draft);
  if (slide < 0 || slide >= visual.slides.length) throw new HttpError(404, 'That slide does not exist.');
  const inputs = await slideInputs(db, draft, visual);
  return renderSlidePng(inputs[slide]);
}

export async function renderDraftPdf(db: SupabaseClient, draft: DraftRecord): Promise<Uint8Array> {
  const visual = visualOf(draft);
  return renderPdf(await slideInputs(db, draft, visual));
}
