/**
 * lib/forge/data/voice.ts
 *
 * Voice samples and the stored fingerprint.
 *
 * The fingerprint is recomputed from all samples whenever samples change.
 * That is cheap (pure computation over at most a few hundred short posts) and
 * avoids an incremental-update scheme that could drift from the samples.
 *
 * Every function takes the brand's workspace id and resolves where the voice
 * actually lives (see voiceScopeId): a client workspace has one shared voice,
 * a company workspace uses each member's own.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildVoiceProfile, describeVoice, type VoiceProfile } from '../voice';
import { scopeRows, voiceScopeId } from './workspace';

export const MAX_SAMPLES = 300;

export interface StoredFingerprint {
  profile: VoiceProfile;
  traits: string[];
  sample_count: number;
  updated_at: string;
}

export interface VoiceSampleRow {
  id: string;
  platform: string;
  body: string;
  external_id: string | null;
  posted_at: string | null;
  source: string;
  created_at: string;
}

export async function getFingerprint(db: SupabaseClient, userId: string, workspaceId: string | null): Promise<StoredFingerprint | null> {
  const scopeId = await voiceScopeId(db, workspaceId);
  const query = db.from('voice_fingerprints').select('profile, traits, sample_count, updated_at');
  const { data } = await scopeRows(query, userId, scopeId).maybeSingle();
  return (data as StoredFingerprint | null) ?? null;
}

export async function listSamples(db: SupabaseClient, userId: string, workspaceId: string | null): Promise<VoiceSampleRow[]> {
  return listSamplesIn(db, userId, await voiceScopeId(db, workspaceId));
}

async function listSamplesIn(db: SupabaseClient, userId: string, scopeId: string | null): Promise<VoiceSampleRow[]> {
  const query = db.from('voice_samples').select('id, platform, body, external_id, posted_at, source, created_at');
  const { data, error } = await scopeRows(query, userId, scopeId).order('created_at', { ascending: false }).limit(MAX_SAMPLES);
  if (error) throw new Error(`Could not load voice samples: ${error.message}`);
  return (data ?? []) as VoiceSampleRow[];
}

export interface NewSample {
  platform: string;
  body: string;
  external_id?: string | null;
  posted_at?: string | null;
  source: 'paste' | 'x_import' | 'upload' | 'posted_draft';
}

/**
 * Inserts samples, skipping exact duplicates of what is already stored, then
 * rebuilds the fingerprint. Returns the new fingerprint.
 */
export async function addSamples(db: SupabaseClient, userId: string, workspaceId: string | null, samples: NewSample[]): Promise<StoredFingerprint> {
  const scopeId = await voiceScopeId(db, workspaceId);
  const existing = await listSamplesIn(db, userId, scopeId);
  const seenBodies = new Set(existing.map((s) => normalise(s.body)));
  const seenExternal = new Set(existing.map((s) => s.external_id).filter(Boolean));

  const fresh = samples
    .map((s) => ({ ...s, body: s.body.trim() }))
    .filter((s) => s.body.length >= 20)
    .filter((s) => !seenBodies.has(normalise(s.body)) && !(s.external_id && seenExternal.has(s.external_id)));

  if (fresh.length > 0) {
    const room = Math.max(MAX_SAMPLES - existing.length, 0);
    const rows = fresh.slice(0, Math.max(room, 0)).map((s) => ({
      user_id: userId,
      workspace_id: scopeId,
      platform: s.platform,
      body: s.body.slice(0, 10_000),
      external_id: s.external_id ?? null,
      posted_at: s.posted_at ?? null,
      source: s.source,
    }));
    if (rows.length > 0) {
      const { error } = await db.from('voice_samples').insert(rows);
      if (error) throw new Error(`Could not save voice samples: ${error.message}`);
    }
  }

  return rebuildIn(db, userId, scopeId);
}

export async function deleteSample(db: SupabaseClient, userId: string, workspaceId: string | null, sampleId: string): Promise<StoredFingerprint> {
  const scopeId = await voiceScopeId(db, workspaceId);
  const { error } = await scopeRows(db.from('voice_samples').delete().eq('id', sampleId), userId, scopeId);
  if (error) throw new Error(`Could not delete the sample: ${error.message}`);
  return rebuildIn(db, userId, scopeId);
}

export async function rebuildFingerprint(db: SupabaseClient, userId: string, workspaceId: string | null): Promise<StoredFingerprint> {
  return rebuildIn(db, userId, await voiceScopeId(db, workspaceId));
}

async function rebuildIn(db: SupabaseClient, userId: string, scopeId: string | null): Promise<StoredFingerprint> {
  const samples = await listSamplesIn(db, userId, scopeId);
  const profile = buildVoiceProfile(samples.map((s) => s.body));
  const traits = describeVoice(profile);
  const updatedAt = new Date().toISOString();

  // Delete-then-insert rather than upsert: the uniqueness constraint is on an
  // expression (coalesce over workspace_id), which PostgREST's on_conflict
  // cannot target.
  await scopeRows(db.from('voice_fingerprints').delete(), userId, scopeId);

  const { error } = await db.from('voice_fingerprints').insert({
    user_id: userId,
    workspace_id: scopeId,
    profile,
    traits,
    sample_count: profile.sampleCount,
    updated_at: updatedAt,
  });
  if (error) throw new Error(`Could not save the voice fingerprint: ${error.message}`);

  return { profile, traits, sample_count: profile.sampleCount, updated_at: updatedAt };
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}
