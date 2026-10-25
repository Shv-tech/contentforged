/**
 * lib/forge/ideas.ts
 *
 * The idea queue: angles worth writing, collected from everywhere Forge
 * listens, ranked, and drawn down by the weekly plan.
 *
 * Sources, strongest first:
 *   capture         something the person said or did this week
 *   story           a Story Bank entry not written about recently
 *   reply_question  a question someone asked under their posts
 *   repost          one of their own proven posts, old enough to run again
 *   pulse           what their niche is discussing right now
 *   format          a structure from the gallery they chose to try
 *   manual          an idea they typed
 *
 * Scores are simple and visible: first-hand material outranks trends, and
 * every idea fades with age so the queue never fills with last month.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { runNichePulse } from '@/lib/x/pulse';
import { xConfigured } from '@/lib/x/client';
import { createServiceClient } from '@/lib/supabase/service';
import { searchStories, STORY_COLUMNS } from './data/stories';
import { scopeRows, type WorkspaceRef } from './data/workspace';
import { draftText } from './draft-text';
import { hasFeature } from './entitlements';
import { computePlaybook, loadPostedPosts } from './playbook';
import { resolvePlan } from './plan';
import { firstLine, truncate } from './text';
import type { DraftPlatform, StoryItem } from './types';

import type { IdeaSource, IdeaStatus } from './labels';

export { IDEA_SOURCE_LABELS, type IdeaSource, type IdeaStatus } from './labels';

export interface IdeaRecord {
  id: string;
  user_id: string;
  workspace_id: string | null;
  source: IdeaSource;
  angle: string;
  rationale: string | null;
  platform: DraftPlatform | null;
  story_ids: string[];
  capture_id: string | null;
  source_draft_id: string | null;
  comment_id: string | null;
  status: IdeaStatus;
  draft_id: string | null;
  score: number;
  created_at: string;
  updated_at: string;
}

export const IDEA_COLUMNS =
  'id, user_id, workspace_id, source, angle, rationale, platform, story_ids, capture_id, source_draft_id, comment_id, status, draft_id, score, created_at, updated_at';

const BASE_SCORE: Record<IdeaSource, number> = {
  capture: 0.8,
  story: 0.5,
  reply_question: 0.75,
  repost: 0.6,
  format: 0.55,
  manual: 0.7,
  pulse: 0.45,
  experiment: 0.5,
};

/** Score after ageing: an idea loses about half its weight in two weeks. */
export function effectiveScore(idea: Pick<IdeaRecord, 'score' | 'created_at'>, now = Date.now()): number {
  const days = Math.max(0, (now - new Date(idea.created_at).getTime()) / 86_400_000);
  return idea.score * Math.pow(0.5, days / 14);
}

export async function listIdeas(db: SupabaseClient, userId: string, workspaceId: string | null, status: IdeaStatus = 'open', limit = 60): Promise<IdeaRecord[]> {
  const query = db.from('ideas').select(IDEA_COLUMNS).eq('status', status);
  const { data, error } = await scopeRows(query, userId, workspaceId).order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error(`Could not load ideas: ${error.message}`);
  const now = Date.now();
  return ((data ?? []) as IdeaRecord[]).sort((a, b) => effectiveScore(b, now) - effectiveScore(a, now)).slice(0, limit);
}

export interface NewIdea {
  source: IdeaSource;
  angle: string;
  rationale?: string | null;
  platform?: DraftPlatform | null;
  storyIds?: string[];
  captureId?: string | null;
  sourceDraftId?: string | null;
  commentId?: string | null;
  score?: number;
}

export async function createIdea(db: SupabaseClient, userId: string, workspaceId: string | null, idea: NewIdea): Promise<IdeaRecord> {
  const { data, error } = await db
    .from('ideas')
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      source: idea.source,
      angle: idea.angle.trim().slice(0, 500),
      rationale: idea.rationale?.trim().slice(0, 600) ?? null,
      platform: idea.platform ?? null,
      story_ids: idea.storyIds ?? [],
      capture_id: idea.captureId ?? null,
      source_draft_id: idea.sourceDraftId ?? null,
      comment_id: idea.commentId ?? null,
      score: idea.score ?? BASE_SCORE[idea.source],
    })
    .select(IDEA_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not save the idea: ${error?.message ?? 'unknown error'}`);
  return data as IdeaRecord;
}

/**
 * Stories an idea may draw on: anything kept from the capture it came from,
 * then the best matches for its angle.
 */
export async function storiesForIdea(db: SupabaseClient, userId: string, workspaceId: string | null, idea: Pick<IdeaRecord, 'angle' | 'capture_id' | 'story_ids'>): Promise<StoryItem[]> {
  const byId = new Map<string, StoryItem>();

  if (idea.story_ids.length > 0) {
    const query = db.from('story_items').select(STORY_COLUMNS).in('id', idea.story_ids);
    const { data } = await scopeRows(query, userId, workspaceId);
    for (const story of (data ?? []) as StoryItem[]) byId.set(story.id, story);
  }
  if (idea.capture_id) {
    const query = db.from('story_items').select(STORY_COLUMNS).eq('capture_id', idea.capture_id);
    const { data } = await scopeRows(query, userId, workspaceId).limit(6);
    for (const story of (data ?? []) as StoryItem[]) byId.set(story.id, story);
  }
  for (const story of await searchStories(db, userId, workspaceId, idea.angle, 6).catch(() => [])) {
    if (byId.size >= 8) break;
    byId.set(story.id, story);
  }
  return Array.from(byId.values());
}

const EVERGREEN_MIN_AGE_DAYS = 60;
const MAX_REPOST_IDEAS = 3;
const MAX_PULSE_IDEAS = 3;

/**
 * Tops the queue up from signals that do not arrive on their own: proven
 * posts old enough to run again, and what the niche is discussing. Called
 * before a plan is built; cheap when there is nothing new.
 */
export async function refreshIdeaQueue(db: SupabaseClient, userId: string, workspace: WorkspaceRef | null, timezone: string): Promise<number> {
  const workspaceId = workspace?.id ?? null;
  let added = 0;

  const existingQuery = db.from('ideas').select('source_draft_id, angle, source').in('status', ['open', 'planned', 'drafted']);
  const existing = await scopeRows(existingQuery, userId, workspaceId).limit(400);
  const usedDrafts = new Set((existing.data ?? []).map((row: { source_draft_id: string | null }) => row.source_draft_id).filter(Boolean));
  const usedAngles = new Set((existing.data ?? []).map((row: { angle: string }) => row.angle.toLowerCase()));

  // Proven posts: the top third of the author's results, at least two months old.
  const posts = await loadPostedPosts(db, userId, workspaceId, 300).catch(() => []);
  const cutoff = Date.now() - EVERGREEN_MIN_AGE_DAYS * 86_400_000;
  const playbook = computePlaybook(
    posts.filter((p) => p.draft.posted_at && new Date(p.draft.posted_at).getTime() < cutoff),
    timezone
  );
  const candidates = playbook.scored
    .filter((p) => p.percentile >= 0.66 && !usedDrafts.has(p.draft.id))
    .sort((a, b) => b.percentile - a.percentile)
    .slice(0, MAX_REPOST_IDEAS);
  for (const post of candidates) {
    await createIdea(db, userId, workspaceId, {
      source: 'repost',
      angle: `Run this again with a new opening: "${truncate(firstLine(draftText(post.draft)), 160)}"`,
      rationale: `It did ${post.relative.toFixed(1)}x your usual on ${post.draft.platform} and most of today's audience has not seen it.`,
      platform: post.draft.platform,
      sourceDraftId: post.draft.id,
      score: BASE_SCORE.repost + (post.percentile - 0.66) * 0.3,
    });
    added += 1;
  }

  // The niche's conversation, when the plan includes it and X is configured.
  if (xConfigured()) {
    const service = createServiceClient();
    const [{ data: profile }, plan] = await Promise.all([service.from('profiles').select('niche').eq('id', workspace?.ownerId ?? userId).maybeSingle(), resolvePlan(workspace?.ownerId ?? userId)]);
    const niche = (profile?.niche as string | null)?.trim();
    if (niche && hasFeature(plan, 'niche_pulse')) {
      try {
        const { pulse } = await runNichePulse(niche);
        for (const topic of pulse.topics.slice(0, MAX_PULSE_IDEAS)) {
          if (usedAngles.has(topic.angle.toLowerCase())) continue;
          await createIdea(db, userId, workspaceId, {
            source: 'pulse',
            angle: topic.angle,
            rationale: `${topic.title}: ${truncate(topic.summary, 200)}`,
          });
          added += 1;
        }
      } catch (error) {
        console.warn('[forge/ideas] niche pulse unavailable:', error instanceof Error ? error.message : error);
      }
    }
  }

  return added;
}
