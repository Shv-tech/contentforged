/**
 * lib/forge/brand-voice.ts
 *
 * The voice context a non-chat feature needs to write as the user: the
 * measured voice block, their rules, and their Story Bank. One loader so
 * replies, rewrites and digests all speak with the same voice the chat does.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { acceptedRules } from './data/rules';
import { formatStoriesForModel, listStories, searchStories } from './data/stories';
import { getFingerprint } from './data/voice';
import { MIN_SAMPLES_FOR_SCORING, voicePromptBlock } from './voice';

export interface BrandVoice {
  promptBlock: string | null;
  rules: string[];
  stories: string;
}

export async function loadBrandVoice(db: SupabaseClient, userId: string, workspaceId: string | null, topic?: string): Promise<BrandVoice> {
  const [fingerprint, rules, stories] = await Promise.all([
    getFingerprint(db, userId, workspaceId),
    acceptedRules(db, userId, workspaceId).catch(() => []),
    (topic ? searchStories(db, userId, workspaceId, topic, 8) : listStories(db, userId, workspaceId, 12)).catch(() => []),
  ]);

  return {
    promptBlock: fingerprint && fingerprint.sample_count >= MIN_SAMPLES_FOR_SCORING ? voicePromptBlock(fingerprint.profile, fingerprint.traits) : null,
    rules: rules.map((rule) => rule.rule),
    stories: formatStoriesForModel(stories),
  };
}
