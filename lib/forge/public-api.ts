/**
 * lib/forge/public-api.ts
 *
 * Forge as a service other tools call: the operations behind the public
 * REST API (/api/v1) and the MCP server (/api/mcp). Both are thin adapters
 * over these functions, so they always behave identically.
 *
 * The point is reach. A support agent, a newsletter tool or Claude itself
 * can ask Forge to write as a specific person, check a draft against their
 * measured voice, or look up a true story from their Story Bank, and get
 * the same truth rule and voice the app enforces.
 */

import { brandRequest } from './brand-request';
import { createDraft, DRAFT_COLUMNS } from './data/drafts';
import { acceptedRules, bannedPhrasesFrom } from './data/rules';
import { createStory, searchStories, listStories, STORY_KINDS } from './data/stories';
import { getFingerprint } from './data/voice';
import { scopeRows, type WorkspaceRef } from './data/workspace';
import { appUrl } from './app-url';
import { draftText } from './draft-text';
import { track } from './events';
import { gradeOpening } from './grader';
import { HttpError, requireScope, type ForgeContext } from './http';
import { listIdeas } from './ideas';
import { consumeLimit } from './limits';
import { estimateTokens, metered } from './metered';
import { requireBrandFeature, resolvePlan } from './plan';
import { DRIFT_LABELS, MIN_SAMPLES_FOR_SCORING, scoreVoice, voicePromptBlock } from './voice';
import { estimateWriteTokens, loadBrandContext, writePost } from './writer';
import { PLATFORM_NAMES, type DraftKind, type DraftPlatform, type DraftRecord, type StoryKind } from './types';

export interface ApiCaller {
  ctx: ForgeContext;
  workspace: WorkspaceRef | null;
  workspaceId: string | null;
}

const REQUESTS_PER_HOUR = 600;

/** Authenticates, rate limits, and checks the brand's plan includes the API. */
export async function apiCaller(req: Request): Promise<ApiCaller> {
  // A bearer key is required: cookie sessions on a cross-origin JSON API
  // invite request forgery, and every real caller here is a program.
  if (!(req.headers.get('authorization') ?? '').startsWith('Bearer ')) {
    throw new HttpError(401, 'Send an API key as "Authorization: Bearer fx_...". Create one in Account, API keys.');
  }
  const { ctx, workspace, workspaceId } = await brandRequest(req);
  const limit = await consumeLimit(`api:${ctx.tokenId ?? ctx.userId}`, REQUESTS_PER_HOUR, 3600);
  if (!limit.allowed) throw new HttpError(429, `Rate limit reached: ${REQUESTS_PER_HOUR} requests an hour. Resets in ${Math.ceil(limit.resetSeconds / 60)} minutes.`);
  await requireBrandFeature(ctx.userId, workspaceId, 'api');
  return { ctx, workspace, workspaceId };
}

function draftUrl(id: string): string {
  return `${appUrl()}/drafts/${id}`;
}

function summariseDraft(draft: DraftRecord) {
  return {
    id: draft.id,
    platform: draft.platform,
    kind: draft.kind,
    title: draft.title,
    text: draftText(draft),
    segments: draft.segments,
    status: draft.status,
    grade: draft.grade ? { score: draft.grade.score, verdict: draft.grade.verdict, weakest: draft.grade.weakest } : null,
    voice_score: draft.voice_score,
    scheduled_for: draft.scheduled_for,
    post_url: draft.post_url,
    url: draftUrl(draft.id),
    updated_at: draft.updated_at,
  };
}

export async function me(caller: ApiCaller) {
  const plan = await resolvePlan(caller.workspace?.ownerId ?? caller.ctx.userId);
  return {
    name: caller.ctx.name,
    email: caller.ctx.email,
    brand: caller.workspace ? { type: 'workspace', id: caller.workspace.id, name: caller.workspace.name, kind: caller.workspace.kind, role: caller.workspace.role } : { type: 'personal' },
    plan,
    scopes: caller.ctx.scopes ?? ['read', 'write', 'generate'],
  };
}

export async function voice(caller: ApiCaller) {
  requireScope(caller.ctx, 'read');
  const fingerprint = await getFingerprint(caller.ctx.db, caller.ctx.userId, caller.workspaceId);
  const usable = fingerprint && fingerprint.sample_count >= MIN_SAMPLES_FOR_SCORING;
  return {
    sample_count: fingerprint?.sample_count ?? 0,
    measured: Boolean(usable),
    traits: fingerprint?.traits ?? [],
    language: fingerprint?.profile.language?.primary ?? 'en',
    /** Paste into any model's system prompt to write toward this voice. */
    instructions: usable ? voicePromptBlock(fingerprint!.profile, fingerprint!.traits) : null,
  };
}

export async function checkVoice(caller: ApiCaller, text: string) {
  requireScope(caller.ctx, 'read');
  if (!text.trim()) throw new HttpError(400, 'text is required.');
  const [fingerprint, rules] = await Promise.all([getFingerprint(caller.ctx.db, caller.ctx.userId, caller.workspaceId), acceptedRules(caller.ctx.db, caller.ctx.userId, caller.workspaceId).catch(() => [])]);
  const result = scoreVoice(text.slice(0, 20_000), fingerprint?.profile ?? null, bannedPhrasesFrom(rules));
  return {
    score: result.score,
    measured: result.score !== null,
    lines: result.drift.map((d) => ({ line: d.line + 1, reasons: d.reasons.map((r) => DRIFT_LABELS[r]), detail: d.detail })),
    machine_phrases: result.slop.map((s) => ({ phrase: s.match, why: s.reason })),
    language: result.language ?? null,
  };
}

export async function grade(caller: ApiCaller, text: string, platform: DraftPlatform | undefined) {
  requireScope(caller.ctx, 'generate');
  if (!text.trim()) throw new HttpError(400, 'text is required.');
  const result = await metered({ userId: caller.ctx.userId, route: 'api:grade', maxOutputTokens: 600, estimatedInputTokens: estimateTokens(text) + 900 }, async () => {
    const graded = await gradeOpening({ text: text.slice(0, 4000), platform });
    return { value: graded.grade, usage: graded.usage };
  });
  void track(caller.ctx.userId, 'api.called', { op: 'grade' });
  return result;
}

export async function stories(caller: ApiCaller, query: string | null, limit: number) {
  requireScope(caller.ctx, 'read');
  const items = query?.trim()
    ? await searchStories(caller.ctx.db, caller.ctx.userId, caller.workspaceId, query, Math.min(limit, 20))
    : await listStories(caller.ctx.db, caller.ctx.userId, caller.workspaceId, Math.min(limit, 100));
  return items.map((s) => ({ id: s.id, kind: s.kind, title: s.title, body: s.body, occurred_on: s.occurred_on, tags: s.tags }));
}

export async function saveStory(caller: ApiCaller, input: { kind?: string; title: string; body: string; occurred_on?: string | null }) {
  requireScope(caller.ctx, 'write');
  if (caller.workspace && caller.workspace.role !== 'owner' && caller.workspace.role !== 'editor') throw new HttpError(403, 'Your role in this workspace is read-only.');
  const kind = (STORY_KINDS as readonly string[]).includes(input.kind ?? '') ? (input.kind as StoryKind) : 'story';
  if (!input.title?.trim() || !input.body?.trim()) throw new HttpError(400, 'title and body are required.');
  const story = await createStory(caller.ctx.db, caller.ctx.userId, caller.workspaceId, { kind, title: input.title, body: input.body, occurred_on: input.occurred_on ?? null, source: 'import' });
  return { id: story.id, kind: story.kind, title: story.title };
}

export async function ideas(caller: ApiCaller) {
  requireScope(caller.ctx, 'read');
  const list = await listIdeas(caller.ctx.db, caller.ctx.userId, caller.workspaceId, 'open', 30);
  return list.map((i) => ({ id: i.id, angle: i.angle, why: i.rationale, source: i.source, platform: i.platform, created_at: i.created_at }));
}

export async function drafts(caller: ApiCaller, status: string | null, limit: number) {
  requireScope(caller.ctx, 'read');
  let query = caller.ctx.db.from('drafts').select(DRAFT_COLUMNS);
  query = scopeRows(query, caller.ctx.userId, caller.workspaceId);
  query = status && ['draft', 'scheduled', 'posted'].includes(status) ? query.eq('status', status) : query.neq('status', 'archived');
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(Math.min(Math.max(limit, 1), 50));
  if (error) throw new Error(error.message);
  return ((data ?? []) as DraftRecord[]).map(summariseDraft);
}

export async function draftPost(caller: ApiCaller, input: { angle: string; platform: DraftPlatform; kind?: DraftKind; save?: boolean }) {
  requireScope(caller.ctx, 'generate');
  const save = input.save !== false;
  if (save) {
    requireScope(caller.ctx, 'write');
    if (caller.workspace && caller.workspace.role !== 'owner' && caller.workspace.role !== 'editor') throw new HttpError(403, 'Your role in this workspace is read-only.');
  }
  if (!input.angle?.trim()) throw new HttpError(400, 'angle is required: what the post is about.');

  const context = await loadBrandContext(caller.ctx.db, caller.ctx.userId, caller.workspace);
  const request = { angle: input.angle.slice(0, 2000), platform: input.platform, kind: input.kind ?? 'post' };
  const written = await metered(
    { userId: caller.ctx.userId, route: 'api:draft', maxOutputTokens: 2400, estimatedInputTokens: estimateWriteTokens(context, request) },
    async () => {
      const result = await writePost(context, request);
      return { value: result.draft, usage: result.usage };
    }
  );
  void track(caller.ctx.userId, 'api.called', { op: 'draft', save });

  if (!save) {
    return { saved: false, platform: PLATFORM_NAMES[written.platform], text: written.segments.length > 0 ? written.segments.join('\n\n') : written.body, segments: written.segments, missing_facts: written.missingFacts };
  }

  const draft = await createDraft(caller.ctx.db, caller.ctx.userId, caller.workspaceId, {
    platform: written.platform,
    kind: written.kind,
    body: written.body,
    segments: written.segments,
    title: written.title,
    notes: written.missingFacts.length > 0 ? `Fill in before posting: ${written.missingFacts.join('; ')}.` : null,
    language: context.language,
  });
  return { saved: true, ...summariseDraft(draft), missing_facts: written.missingFacts };
}
