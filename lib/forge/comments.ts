/**
 * lib/forge/comments.ts
 *
 * The comment inbox: replies under the person's own posts, read back from
 * each platform, with questions picked out (they become ideas) and reply
 * drafts written in the person's voice.
 *
 * Forge never replies by itself. A drafted reply is copied, or opened in the
 * platform's own reply box (X's intent URL), and the person sends it.
 *
 * Where comments come from:
 *   Bluesky   the public AppView, for any post linked to Forge
 *   Threads   the replies edge, with the threads_read_replies permission
 *   X         recent search on the conversation, when the X API is set up
 *   LinkedIn  not available: LinkedIn restricts comment access to approved
 *             partners, so LinkedIn comments are not read
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { structuredCall, type ToolDefinition } from '@/lib/ai/anthropic';
import { createServiceClient } from '@/lib/supabase/service';
import { blueskyReplies, blueskyUriFromUrl } from '@/lib/platforms/bluesky';
import { PlatformError } from '@/lib/platforms/http';
import { THREADS_REPLIES_SCOPE, threadsReplies } from '@/lib/platforms/threads';
import { searchRecent, xConfigured } from '@/lib/x/client';
import { loadBrandVoice } from './brand-voice';
import { getCredential } from './connections';
import { DRAFT_COLUMNS } from './data/drafts';
import { draftText } from './draft-text';
import { createIdea } from './ideas';
import { languageInstructions } from './language';
import { estimateTokens, metered } from './metered';
import { brandLanguage } from './profile';
import { slopPromptList } from './slop';
import { PLATFORM_LIMITS, truncate } from './text';
import { PLATFORM_NAMES, type DraftRecord } from './types';

export interface PostComment {
  id: string;
  user_id: string;
  workspace_id: string | null;
  draft_id: string;
  platform: string;
  external_id: string;
  author_handle: string | null;
  author_name: string | null;
  author_url: string | null;
  body: string;
  posted_at: string | null;
  is_question: boolean;
  status: 'new' | 'replied' | 'dismissed';
  reply_text: string | null;
  idea_id: string | null;
  created_at: string;
}

export const COMMENT_COLUMNS =
  'id, user_id, workspace_id, draft_id, platform, external_id, author_handle, author_name, author_url, body, posted_at, is_question, status, reply_text, idea_id, created_at';

const QUESTION_START = /^(how|what|why|when|where|which|who|whom|can|could|would|will|do|does|did|is|are|should|have|has|any|kya|kaise|kyun|kyu|kab|kahan|kaun)\b/i;

/** A question is worth an idea when it asks something the author can answer at length. */
export function isQuestion(text: string): boolean {
  const cleaned = text.replace(/@\w+/g, '').trim();
  if (cleaned.length < 12) return false;
  return /\?/.test(cleaned) || QUESTION_START.test(cleaned);
}

interface FetchedComment {
  externalId: string;
  handle: string | null;
  name: string | null;
  url: string | null;
  body: string;
  postedAt: string | null;
}

export class CommentsUnavailableError extends Error {}

async function fetchComments(draft: DraftRecord, ownHandle: string | null): Promise<FetchedComment[]> {
  switch (draft.platform) {
    case 'bluesky': {
      const uri = draft.external_id?.startsWith('at://') ? draft.external_id : draft.post_url ? await blueskyUriFromUrl(draft.post_url) : null;
      if (!uri) throw new CommentsUnavailableError('Link the Bluesky post first.');
      const replies = await blueskyReplies(uri);
      return replies.map((r) => ({
        externalId: r.uri,
        handle: r.handle,
        name: r.displayName,
        url: `https://bsky.app/profile/${r.handle}/post/${r.uri.split('/').pop()}`,
        body: r.text,
        postedAt: r.createdAt,
      }));
    }
    case 'threads': {
      const credential = await getCredential(draft.user_id, draft.workspace_id, 'threads');
      if (!credential || !draft.external_id || !/^\d+$/.test(draft.external_id)) throw new CommentsUnavailableError('Publish from Forge with Threads connected to read replies.');
      if (!credential.scopes.includes(THREADS_REPLIES_SCOPE)) throw new CommentsUnavailableError('Reconnect Threads to let Forge read replies.');
      const replies = await threadsReplies(credential.accessToken, draft.external_id);
      return replies.map((r) => ({ externalId: r.id, handle: r.username, name: null, url: r.permalink, body: r.text, postedAt: r.timestamp }));
    }
    case 'x': {
      if (!xConfigured()) throw new CommentsUnavailableError('X replies are not available on this server.');
      if (!draft.external_id) throw new CommentsUnavailableError('Link the X post first.');
      const exclude = ownHandle ? ` -from:${ownHandle}` : '';
      const { posts, authors } = await searchRecent(`conversation_id:${draft.external_id}${exclude}`, { max: 50, sort: 'recency' });
      return posts.map((post) => {
        const author = authors.get(post.author_id);
        return {
          externalId: post.id,
          handle: author?.username ?? null,
          name: author?.name ?? null,
          url: author ? `https://x.com/${author.username}/status/${post.id}` : null,
          body: post.text,
          postedAt: post.created_at,
        };
      });
    }
    default:
      throw new CommentsUnavailableError(`${PLATFORM_NAMES[draft.platform]} comments cannot be read automatically.`);
  }
}

/**
 * Reads new comments for one posted draft and stores them. Questions also
 * become ideas, once each. Returns how many new comments were stored.
 */
export async function syncDraftComments(draft: DraftRecord): Promise<number> {
  const service = createServiceClient();
  const { data: profile } = await service.from('profiles').select('x_handle').eq('id', draft.user_id).maybeSingle();
  const fetched = await fetchComments(draft, (profile?.x_handle as string | null) ?? null);

  let stored = 0;
  for (const comment of fetched.slice(0, 100)) {
    if (!comment.body.trim()) continue;
    const question = isQuestion(comment.body);
    const { data, error } = await service
      .from('post_comments')
      .insert({
        user_id: draft.user_id,
        workspace_id: draft.workspace_id,
        draft_id: draft.id,
        platform: draft.platform,
        external_id: comment.externalId,
        author_handle: comment.handle,
        author_name: comment.name,
        author_url: comment.url,
        body: comment.body.slice(0, 5000),
        posted_at: comment.postedAt,
        is_question: question,
      })
      .select('id')
      .single();
    if (error?.code === '23505') continue;
    if (error || !data) {
      console.error('[forge/comments] could not store a comment:', error?.message);
      continue;
    }
    stored += 1;

    if (question) {
      const idea = await createIdea(service, draft.user_id, draft.workspace_id, {
        source: 'reply_question',
        angle: `Answer this properly in a post: "${truncate(comment.body.replace(/\s+/g, ' '), 300)}"`,
        rationale: `${comment.handle ? `@${comment.handle}` : 'Someone'} asked under your post about "${truncate(draftText(draft).split('\n')[0] ?? '', 80)}".`,
        platform: draft.platform,
        commentId: data.id,
      }).catch(() => null);
      if (idea) await service.from('post_comments').update({ idea_id: idea.id }).eq('id', data.id);
    }
  }

  await service.from('drafts').update({ comments_synced_at: new Date().toISOString() }).eq('id', draft.id);
  return stored;
}

/** Posted drafts for a brand whose comments are worth checking: recent, and not checked lately. */
export async function draftsDueForComments(db: SupabaseClient, filter: { userId?: string; workspaceId?: string | null }, limit: number): Promise<DraftRecord[]> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const stale = new Date(Date.now() - 2 * 3_600_000).toISOString();
  let query = db
    .from('drafts')
    .select(DRAFT_COLUMNS)
    .eq('status', 'posted')
    .in('platform', ['x', 'bluesky', 'threads'])
    .gte('posted_at', since)
    .or(`comments_synced_at.is.null,comments_synced_at.lt.${stale}`);
  if (filter.workspaceId) query = query.eq('workspace_id', filter.workspaceId);
  else if (filter.userId) query = query.eq('user_id', filter.userId).is('workspace_id', null);
  const { data } = await query.order('posted_at', { ascending: false }).limit(limit);
  return (data ?? []) as DraftRecord[];
}

// ============================================================================
// REPLY DRAFTS
// ============================================================================

const REPLY_TOOL: ToolDefinition = {
  name: 'submit_reply',
  description: 'Submit the reply.',
  input_schema: {
    type: 'object',
    properties: { reply: { type: 'string', description: 'The reply, ready to send.' } },
    required: ['reply'],
  },
};

export async function draftReply(db: SupabaseClient, actorId: string, comment: PostComment, post: DraftRecord): Promise<string> {
  const [voice, language] = await Promise.all([loadBrandVoice(db, post.user_id, post.workspace_id, comment.body), brandLanguage(post.user_id, post.workspace_id)]);
  const limit = Math.min(PLATFORM_LIMITS[post.platform as keyof typeof PLATFORM_LIMITS] ?? 500, 500);

  const system = [
    'You write one reply, as the author, to a comment under their own post. Warm, specific, brief. Answer what was asked; if it needs a long answer, give the core of it and say a fuller post is coming only if that is natural.',
    'Never invent facts about the author; use only the post, the comment and the stories given. No em dashes, no hashtags, no flattery openers like "Great question".',
    `Keep it under ${limit} characters.`,
    languageInstructions(language),
    `Never use these phrases:\n${slopPromptList()}`,
    voice.promptBlock ? `The author's voice:\n${voice.promptBlock}` : '',
    voice.rules.length > 0 ? `The author's rules:\n${voice.rules.map((r) => `- ${r}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const user = [`THE AUTHOR'S POST:\n"""\n${draftText(post).slice(0, 3000)}\n"""`, `THE COMMENT${comment.author_handle ? ` from @${comment.author_handle}` : ''}:\n"""\n${comment.body}\n"""`, `STORIES:\n${voice.stories}`].join('\n\n');

  return metered({ userId: actorId, route: 'comments:reply', maxOutputTokens: 400, estimatedInputTokens: estimateTokens(system, user) }, async () => {
    const { data, usage } = await structuredCall<{ reply?: string }>({ system, messages: [{ role: 'user', content: user }], tool: REPLY_TOOL, temperature: 0.5, maxTokens: 400 });
    const reply = (data.reply ?? '').replace(/—/g, ',').trim().slice(0, limit);
    if (!reply) throw new PlatformError('No reply was written. Try again.', 502);
    return { value: reply, usage };
  });
}

/** X's own reply box, filled in. The person presses Reply. */
export function xReplyIntent(commentId: string, text: string): string {
  return `https://x.com/intent/post?in_reply_to=${encodeURIComponent(commentId)}&text=${encodeURIComponent(text)}`;
}
