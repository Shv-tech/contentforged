/**
 * lib/forge/data/brand-kit.ts
 *
 * A brand kit: the name, handle, typeface, colours, headshot and logo that
 * rendered visuals use, so a carousel looks like the person and not like a
 * template. One for the personal brand, one per workspace.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadObject } from '../storage';

export type KitFont = 'sans' | 'serif' | 'mono';

export interface BrandKit {
  display_name: string | null;
  handle: string | null;
  font: KitFont;
  background: string;
  ink: string;
  accent: string;
  headshot_path: string | null;
  logo_path: string | null;
}

export const DEFAULT_KIT: BrandKit = {
  display_name: null,
  handle: null,
  font: 'sans',
  background: '#0B0B0B',
  ink: '#FFFFFF',
  accent: '#FF8A2B',
  headshot_path: null,
  logo_path: null,
};

/** A few starting palettes; every colour stays editable. */
export const KIT_PALETTES: ReadonlyArray<{ name: string; background: string; ink: string; accent: string }> = [
  { name: 'Forge', background: '#0B0B0B', ink: '#FFFFFF', accent: '#FF8A2B' },
  { name: 'Paper', background: '#F6F3EC', ink: '#141413', accent: '#C96442' },
  { name: 'Ink', background: '#0F1A2B', ink: '#F2F5FA', accent: '#7DB4FF' },
  { name: 'Forest', background: '#0E1C16', ink: '#EEF5F0', accent: '#8EE3B0' },
  { name: 'Sand', background: '#EFE6D8', ink: '#2A2118', accent: '#9A5B2E' },
];

const KIT_COLUMNS = 'display_name, handle, font, background, ink, accent, headshot_path, logo_path';

type Filterable<Q> = { is: (c: string, v: null) => Q; eq: (c: string, v: string) => Q };
function scoped<Q extends Filterable<Q>>(query: Q, userId: string, workspaceId: string | null): Q {
  return workspaceId ? query.eq('workspace_id', workspaceId) : query.eq('user_id', userId).is('workspace_id', null);
}

export async function getBrandKit(db: SupabaseClient, userId: string, workspaceId: string | null): Promise<BrandKit> {
  const query = db.from('brand_kits').select(KIT_COLUMNS);
  const { data } = await scoped(query, userId, workspaceId).maybeSingle();
  return { ...DEFAULT_KIT, ...((data as Partial<BrandKit> | null) ?? {}) };
}

export async function saveBrandKit(db: SupabaseClient, userId: string, workspaceId: string | null, patch: Partial<BrandKit>): Promise<BrandKit> {
  const existingQuery = db.from('brand_kits').select('id');
  const { data: existing } = await scoped(existingQuery, userId, workspaceId).maybeSingle();
  const { error } = existing
    ? await db.from('brand_kits').update(patch).eq('id', existing.id)
    : await db.from('brand_kits').insert({ user_id: userId, workspace_id: workspaceId, ...patch });
  if (error) throw new Error(`Could not save the brand kit: ${error.message}`);
  return getBrandKit(db, userId, workspaceId);
}

/** An image from the kit as a data URI, for embedding in a render. */
export async function kitImage(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const { bytes, contentType } = await downloadObject('brand-assets', path);
    return `data:${contentType || 'image/png'};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}
