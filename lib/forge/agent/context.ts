/**
 * lib/forge/agent/context.ts
 *
 * Assembles everything Forge knows about the user into the per-user context
 * block of the system prompt: Brand DNA, voice fingerprint, accepted rules,
 * Story Bank titles and Playbook findings.
 *
 * Each source loads independently with allSettled. A failure in one (say the
 * Playbook query) must never blank out the others for the turn.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { assembleBrandIdentity } from '@/lib/brand-dna';
import { listStories } from '../data/stories';
import { acceptedRules, bannedPhrasesFrom } from '../data/rules';
import { getFingerprint } from '../data/voice';
import type { WorkspaceRef } from '../data/workspace';
import { computePlaybook, loadPostedPosts, playbookPromptLines } from '../playbook';
import { buildUserContextBlock } from '../prompts/system';
import { MIN_SAMPLES_FOR_SCORING, voicePromptBlock, type VoiceProfile } from '../voice';
import { languageInstructions } from '../language';
import { brandLanguage } from '../profile';

export interface ChatContext {
  block: string;
  hasBrandDna: boolean;
  bannedPhrases: string[];
  voiceProfile: VoiceProfile | null;
}

function settled<T>(result: PromiseSettledResult<T>, fallback: T, label: string): T {
  if (result.status === 'fulfilled') return result.value;
  console.warn(`[forge/context] ${label} failed; continuing without it.`, result.reason);
  return fallback;
}

export async function buildChatContext(db: SupabaseClient, userId: string, workspace: WorkspaceRef | null, timezone: string): Promise<ChatContext> {
  const workspaceId = workspace?.id ?? null;

  const [brandResult, fingerprintResult, rulesResult, storiesResult, postsResult, languageResult] = await Promise.allSettled([
    workspace ? Promise.resolve(workspace.brand_dna) : assembleBrandIdentity(userId),
    getFingerprint(db, userId, workspaceId),
    acceptedRules(db, userId, workspaceId),
    listStories(db, userId, workspaceId, 40),
    loadPostedPosts(db, userId, workspaceId, 200),
    brandLanguage(userId, workspaceId),
  ]);

  const brandDna = settled(brandResult, null, 'Brand DNA');
  const fingerprint = settled(fingerprintResult, null, 'Voice fingerprint');
  const rules = settled(rulesResult, [], 'Writing rules');
  const stories = settled(storiesResult, [], 'Story Bank');
  const posts = settled(postsResult, [], 'Playbook');

  const usableVoice = fingerprint && fingerprint.sample_count >= MIN_SAMPLES_FOR_SCORING ? fingerprint : null;
  const playbook = posts.length > 0 ? computePlaybook(posts, timezone) : null;

  const language = settled(languageResult, 'en' as const, 'Writing language');
  const contextBlock = buildUserContextBlock({
    todayIso: new Date().toISOString().slice(0, 10),
    timezone,
    brandDna: brandDna && brandDna.trim() ? brandDna.trim() : null,
    voice: usableVoice ? voicePromptBlock(usableVoice.profile, usableVoice.traits) : null,
    rules: rules.map((rule) => rule.rule),
    storyTitles: stories.map((story) => `${story.title}${story.occurred_on ? ` (${story.occurred_on})` : ''}`),
    playbook: playbook ? playbookPromptLines(playbook) : [],
    workspaceName: workspace?.name ?? null,
  });
  // Language comes last so it is the most recent instruction the model reads
  // before the conversation: a Hinglish writer's drafts stay Hinglish.
  const block = `${contextBlock}\n\n════════════════════════════════════════\n\n${languageInstructions(language, usableVoice?.profile.language ?? null)}`;

  return {
    block,
    hasBrandDna: Boolean(brandDna && brandDna.trim()),
    bannedPhrases: bannedPhrasesFrom(rules),
    voiceProfile: usableVoice?.profile ?? null,
  };
}
