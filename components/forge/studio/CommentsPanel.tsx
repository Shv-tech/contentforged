'use client';

/**
 * Comments on a draft, in threads. A comment can be about the whole draft
 * or about specific words; clicking the quote selects those words in the
 * editor even after the text around them has changed. Anyone who can read
 * the draft can comment, including reviewers and clients.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api } from '@/lib/forge/client';
import type { DraftComment } from '@/lib/forge/data/collab';
import { Avatar, Button, cn, relativeTime, textareaClass } from '@/components/forge/ui';
import type { Selection } from './StudioEditor';

type NamedComment = DraftComment & { author: string };

const POLL_MS = 15_000;

export function CommentsPanel({
  draftId,
  canEdit,
  pendingAnchor,
  onClearAnchor,
  onSelectAnchor,
  onCount,
}: {
  draftId: string;
  canEdit: boolean;
  pendingAnchor: Selection | null;
  onClearAnchor: () => void;
  onSelectAnchor: (comment: Pick<DraftComment, 'anchor_text' | 'anchor_start'>) => void;
  onCount?: (open: number) => void;
}) {
  const [comments, setComments] = useState<NamedComment[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ comments: NamedComment[]; me: string }>(`/api/drafts/${draftId}/comments`);
      setComments(data.comments);
      setMe(data.me);
    } catch {
      setComments((current) => current ?? []);
    }
  }, [draftId]);

  // Comments from others appear without a reload while the page is open.
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const threads = useMemo(() => {
    const roots = (comments ?? []).filter((c) => !c.parent_id);
    const replies = new Map<string, NamedComment[]>();
    for (const c of comments ?? []) if (c.parent_id) replies.set(c.parent_id, [...(replies.get(c.parent_id) ?? []), c]);
    return roots.map((root) => ({ root, replies: replies.get(root.id) ?? [] }));
  }, [comments]);

  const open = threads.filter((t) => !t.root.resolved_at);
  const resolved = threads.filter((t) => t.root.resolved_at);
  useEffect(() => onCount?.(open.length), [open.length, onCount]);

  async function post(parentId: string | null, text: string): Promise<boolean> {
    try {
      const { comment } = await api<{ comment: NamedComment }>(`/api/drafts/${draftId}/comments`, {
        method: 'POST',
        json: {
          body: text,
          parentId,
          ...(parentId === null && pendingAnchor ? { anchorText: pendingAnchor.text, anchorStart: pendingAnchor.start, anchorEnd: pendingAnchor.end } : {}),
        },
      });
      setComments((current) => [...(current ?? []), comment]);
      return true;
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not post the comment.');
      return false;
    }
  }

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    if (await post(null, body.trim())) {
      setBody('');
      onClearAnchor();
    }
    setBusy(false);
  }

  async function patch(id: string, change: { resolved?: boolean; body?: string }) {
    try {
      const { comment } = await api<{ comment: DraftComment }>(`/api/drafts/${draftId}/comments/${id}`, { method: 'PATCH', json: change });
      setComments((current) => (current ?? []).map((c) => (c.id === id ? { ...c, ...comment } : c)));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not update the comment.');
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/drafts/${draftId}/comments/${id}`, { method: 'DELETE' });
      setComments((current) => (current ?? []).filter((c) => c.id !== id && c.parent_id !== id));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not delete the comment.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-[18px] border border-white/[0.08] bg-white/[0.02] p-3">
        {pendingAnchor && (
          <div className="flex items-start gap-2 rounded-[12px] bg-forge-ember/10 px-3 py-2">
            <p className="line-clamp-2 flex-1 text-[12.5px] italic text-forge-gold">&ldquo;{pendingAnchor.text}&rdquo;</p>
            <button type="button" onClick={onClearAnchor} className="text-[12px] text-white/50 hover:text-white" aria-label="Comment on the whole draft instead">
              Clear
            </button>
          </div>
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
          }}
          rows={3}
          placeholder={pendingAnchor ? 'What about these words?' : 'Comment on this draft'}
          className={cn(textareaClass, 'border-0 bg-transparent px-1 py-1 focus:bg-transparent')}
          maxLength={2000}
          autoFocus={Boolean(pendingAnchor)}
        />
        <div className="flex items-center justify-between">
          <span className="text-[11.5px] text-white/30">People on this draft are notified.</span>
          <Button variant="primary" size="xs" onClick={submit} loading={busy} disabled={!body.trim()}>
            Comment
          </Button>
        </div>
      </div>

      {comments === null ? null : open.length === 0 && resolved.length === 0 ? (
        <p className="px-1 text-[13px] leading-relaxed text-white/40">No comments yet. Select words in the draft to comment on them.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map((thread) => (
            <Thread key={thread.root.id} thread={thread} me={me} canEdit={canEdit} onReply={(text) => post(thread.root.id, text)} onPatch={patch} onRemove={remove} onSelectAnchor={onSelectAnchor} />
          ))}
        </ul>
      )}

      {resolved.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowResolved((v) => !v)} className="px-1 text-[12.5px] font-medium text-white/45 hover:text-white">
            {showResolved ? 'Hide' : 'Show'} {resolved.length} resolved
          </button>
          {showResolved && (
            <ul className="mt-3 flex flex-col gap-3 opacity-60">
              {resolved.map((thread) => (
                <Thread key={thread.root.id} thread={thread} me={me} canEdit={canEdit} onReply={(text) => post(thread.root.id, text)} onPatch={patch} onRemove={remove} onSelectAnchor={onSelectAnchor} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Thread({
  thread,
  me,
  canEdit,
  onReply,
  onPatch,
  onRemove,
  onSelectAnchor,
}: {
  thread: { root: NamedComment; replies: NamedComment[] };
  me: string | null;
  canEdit: boolean;
  onReply: (text: string) => Promise<boolean>;
  onPatch: (id: string, change: { resolved?: boolean; body?: string }) => void;
  onRemove: (id: string) => void;
  onSelectAnchor: (comment: Pick<DraftComment, 'anchor_text' | 'anchor_start'>) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState('');
  const { root } = thread;
  const canResolve = canEdit || root.user_id === me;

  return (
    <li className="rounded-[18px] border border-white/[0.07] bg-forge-card p-4">
      {root.anchor_text && (
        <button type="button" onClick={() => onSelectAnchor(root)} className="mb-3 block w-full rounded-[10px] border-l-2 border-forge-ember/60 bg-white/[0.02] px-3 py-1.5 text-left text-[12.5px] italic text-white/55 hover:text-white/80">
          <span className="line-clamp-2">&ldquo;{root.anchor_text}&rdquo;</span>
        </button>
      )}
      <Message comment={root} mine={root.user_id === me} onPatch={onPatch} onRemove={onRemove} />
      {thread.replies.map((r) => (
        <div key={r.id} className="mt-3 border-l border-white/[0.08] pl-3">
          <Message comment={r} mine={r.user_id === me} onPatch={onPatch} onRemove={onRemove} />
        </div>
      ))}
      {replying ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} className={textareaClass} autoFocus maxLength={2000} placeholder="Reply" />
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="xs"
              disabled={!reply.trim()}
              onClick={async () => {
                if (await onReply(reply.trim())) {
                  setReply('');
                  setReplying(false);
                }
              }}
            >
              Reply
            </Button>
            <Button variant="quiet" size="xs" onClick={() => setReplying(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-1">
          <Button variant="quiet" size="xs" onClick={() => setReplying(true)}>
            Reply
          </Button>
          {canResolve && (
            <Button variant="quiet" size="xs" onClick={() => onPatch(root.id, { resolved: !root.resolved_at })}>
              {root.resolved_at ? 'Reopen' : 'Resolve'}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function Message({ comment, mine, onPatch, onRemove }: { comment: NamedComment; mine: boolean; onPatch: (id: string, change: { body?: string }) => void; onRemove: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.body);
  return (
    <div className="flex gap-3">
      <Avatar name={comment.author} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px]">
          <span className="font-semibold text-white/85">{comment.author}</span> <span className="text-white/35">{relativeTime(comment.created_at)}</span>
          {comment.updated_at !== comment.created_at && <span className="text-white/25"> · edited</span>}
        </p>
        {editing ? (
          <div className="mt-1.5 flex flex-col gap-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className={textareaClass} maxLength={2000} />
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="xs"
                disabled={!text.trim()}
                onClick={() => {
                  onPatch(comment.id, { body: text.trim() });
                  setEditing(false);
                }}
              >
                Save
              </Button>
              <Button variant="quiet" size="xs" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-white/80">{comment.body}</p>
        )}
        {mine && !editing && (
          <div className="mt-1 flex gap-3 text-[11.5px] text-white/35">
            <button type="button" onClick={() => setEditing(true)} className="hover:text-white">
              Edit
            </button>
            <button type="button" onClick={() => onRemove(comment.id)} className="hover:text-forge-bad">
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
