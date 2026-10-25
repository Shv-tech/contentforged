'use client';

/**
 * The comment inbox: comments under your posts on LinkedIn, Threads,
 * Bluesky and X, read every couple of hours. Forge drafts a reply in your
 * voice when you ask; you post it yourself. Nothing here replies, likes or
 * follows on its own. Questions people ask also go to the idea queue,
 * because a question from your audience is a post they want.
 */

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api, onBrandChange, useActiveBrand } from '@/lib/forge/client';
import type { PostComment } from '@/lib/forge/comments';
import { PLATFORM_NAMES, isDraftPlatform, type DraftPlatform } from '@/lib/forge/types';
import { replyIntent } from '@/lib/x/intent';
import { PlatformGlyph } from '@/components/forge/icons';
import { UpsellCard } from '@/components/forge/views/UpsellCard';
import { Avatar, Button, EmptyState, LoadingRow, Segmented, Tag, copyText, relativeTime, textareaClass } from '@/components/forge/ui';

type Status = 'new' | 'replied' | 'dismissed';

interface PostSummary {
  id: string;
  platform: DraftPlatform;
  opening: string;
  post_url: string | null;
  posted_at: string | null;
}

export function CommentsPanel() {
  const brand = useActiveBrand();
  const [status, setStatus] = useState<Status>('new');
  const [comments, setComments] = useState<PostComment[] | null>(null);
  const [posts, setPosts] = useState<Record<string, PostSummary>>({});
  const [syncing, setSyncing] = useState(false);
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    setComments(null);
    try {
      const data = await api<{ comments: PostComment[]; posts: Record<string, PostSummary> }>(`/api/comments?status=${status}`);
      setComments(data.comments);
      setPosts(data.posts);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not load comments.');
      setComments([]);
    }
  }, [status]);

  useEffect(() => {
    void load();
    return onBrandChange(load);
  }, [load]);

  async function sync() {
    setSyncing(true);
    try {
      const result = await api<{ checked: number; stored: number; notes: string[] }>('/api/comments', { method: 'POST', json: { action: 'sync' } });
      toast.success(result.stored > 0 ? `${result.stored} new ${result.stored === 1 ? 'comment' : 'comments'}.` : result.checked > 0 ? 'No new comments.' : 'No recent posts to check.');
      result.notes.forEach((note) => toast(note));
      if (status === 'new') void load();
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) setLocked(true);
      else toast.error(error instanceof ApiError ? error.message : 'Could not check for comments.');
    } finally {
      setSyncing(false);
    }
  }

  const settle = (id: string) => setComments((current) => (current ?? []).filter((c) => c.id !== id));

  if (locked) return <UpsellCard feature="comment_inbox" body="Every comment on your posts in one place, with a reply drafted in your voice for you to post. Questions become ideas for your next posts." />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Status>
          label="Comment status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'new', label: 'To answer' },
            { value: 'replied', label: 'Replied' },
            { value: 'dismissed', label: 'Dismissed' },
          ]}
        />
        <Button variant="secondary" size="sm" onClick={sync} loading={syncing}>
          Check now
        </Button>
      </div>
      <p className="text-[12.5px] leading-relaxed text-white/40">Forge drafts replies; you post them. It never replies, likes or follows for you.</p>

      {comments === null ? (
        <LoadingRow label="Loading comments" />
      ) : comments.length === 0 ? (
        <EmptyState
          plate="quench"
          title={status === 'new' ? 'Nothing to answer' : status === 'replied' ? 'No replies yet' : 'Nothing dismissed'}
          body={status === 'new' ? 'Comments on posts you published through Forge, or linked to a draft, arrive here. LinkedIn, Threads and Bluesky need the account connected.' : 'Comments move here as you deal with them.'}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => (
            <CommentRow key={comment.id} comment={comment} post={posts[comment.draft_id]} canEdit={brand.canEdit} onSettled={settle} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentRow({ comment, post, canEdit, onSettled }: { comment: PostComment; post: PostSummary | undefined; canEdit: boolean; onSettled: (id: string) => void }) {
  const [reply, setReply] = useState(comment.reply_text ?? '');
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const platform = isDraftPlatform(comment.platform) ? comment.platform : null;
  const name = comment.author_name || comment.author_handle || 'Someone';

  async function draft() {
    setDrafting(true);
    try {
      const result = await api<{ reply: string }>(`/api/comments/${comment.id}`, { method: 'POST', json: { action: 'draft_reply' } });
      setReply(result.reply);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not draft a reply.');
    } finally {
      setDrafting(false);
    }
  }

  async function mark(status: 'replied' | 'dismissed' | 'new') {
    setBusy(true);
    try {
      await api(`/api/comments/${comment.id}`, { method: 'PATCH', json: { status, replyText: reply.trim() || null } });
      onSettled(comment.id);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not update it.');
    } finally {
      setBusy(false);
    }
  }

  /** Opens the platform with the reply ready, or copies it where no reply link exists. */
  async function openReply() {
    const text = reply.trim();
    if (platform === 'x') {
      window.open(replyIntent(comment.external_id, text), '_blank', 'noopener,noreferrer');
      return;
    }
    const copied = await copyText(text);
    toast.success(copied ? 'Reply copied. Paste it under the comment.' : 'Copy the reply, then paste it under the comment.');
    const target = post?.post_url ?? comment.author_url;
    if (target) window.open(target, '_blank', 'noopener,noreferrer');
  }

  return (
    <li className="rounded-[20px] border border-white/[0.07] bg-forge-card p-5">
      <div className="flex items-start gap-3">
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-white">{name}</span>
            {comment.author_handle && comment.author_name && <span className="text-[12.5px] text-white/40">@{comment.author_handle.replace(/^@/, '')}</span>}
            {comment.is_question && <Tag tone="good">Question, added to ideas</Tag>}
            <span className="text-[12px] text-white/30">{relativeTime(comment.posted_at ?? comment.created_at)}</span>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-[14.5px] leading-relaxed text-white/85">{comment.body}</p>
          {post && (
            <p className="mt-2 flex items-center gap-2 text-[12px] text-white/35">
              {platform && <PlatformGlyph platform={platform} className="h-3 w-3" />}
              On {platform ? PLATFORM_NAMES[platform] : 'your post'}: <span className="truncate">{post.opening}</span>
            </p>
          )}
        </div>
      </div>

      {canEdit && comment.status === 'new' && (
        <div className="mt-4 flex flex-col gap-3 pl-11">
          {reply ? (
            <>
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} className={textareaClass} maxLength={3000} aria-label="Your reply" />
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={openReply} disabled={!reply.trim()}>
                  {platform === 'x' ? 'Open reply on X' : 'Copy and open'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => mark('replied')} loading={busy}>
                  I replied
                </Button>
                <Button variant="quiet" size="sm" onClick={draft} loading={drafting}>
                  Try again
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={draft} loading={drafting}>
                Draft a reply
              </Button>
              <Button variant="quiet" size="sm" onClick={() => mark('replied')} disabled={busy}>
                Already replied
              </Button>
              <Button variant="quiet" size="sm" onClick={() => mark('dismissed')} disabled={busy} className="ml-auto">
                Dismiss
              </Button>
            </div>
          )}
        </div>
      )}

      {comment.status !== 'new' && (
        <div className="mt-3 flex items-center gap-3 pl-11">
          {comment.reply_text && <p className="min-w-0 flex-1 truncate text-[12.5px] text-white/45">You: {comment.reply_text}</p>}
          {canEdit && (
            <Button variant="quiet" size="xs" onClick={() => mark('new')} disabled={busy}>
              Move back
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
