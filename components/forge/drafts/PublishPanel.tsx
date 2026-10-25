'use client';

/**
 * Getting a draft out the door, per platform.
 *
 *   Connected platforms (LinkedIn, Threads, Bluesky): publish directly.
 *   X: open X's own composer with the post filled in (free, and the user
 *      presses Post). Threads on X are posted one segment at a time.
 *   Anything else: copy, then open the platform.
 *
 * After an intent opens, the panel asks "Posted it?" so the draft gets linked
 * to the live post. That link is what lets results flow back into the
 * Playbook.
 */

import { useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError, useConnectionsStore, useDraftStore } from '@/lib/forge/client';
import { draftText } from '@/lib/forge/draft-text';
import { PLATFORM_NAMES, type DraftRecord } from '@/lib/forge/types';
import { blueskyIntent, composeIntent, LINKEDIN_COMPOSE_URL, threadsIntent } from '@/lib/x/intent';
import { Button, Dialog, cn, inputClass } from '../ui';

export function PublishPanel({ draft, open, onClose }: { draft: DraftRecord; open: boolean; onClose: () => void }) {
  const upsert = useDraftStore((s) => s.upsert);
  const connections = useConnectionsStore((s) => s.connections);
  const connected = connections.some((c) => c.platform === draft.platform);

  const [stage, setStage] = useState<'choose' | 'confirm'>('choose');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const text = draftText(draft);
  const segments = draft.kind === 'thread' && draft.segments.length > 0 ? draft.segments : [text];

  const close = () => {
    setStage('choose');
    setUrl('');
    onClose();
  };

  const copy = async (value: string, index: number) => {
    await navigator.clipboard.writeText(value);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1500);
  };

  const openExternal = async () => {
    if (draft.platform === 'x') {
      window.open(composeIntent(segments[0]), '_blank', 'noopener,noreferrer');
    } else if (draft.platform === 'threads') {
      window.open(threadsIntent(text), '_blank', 'noopener,noreferrer');
    } else if (draft.platform === 'bluesky') {
      window.open(blueskyIntent(text), '_blank', 'noopener,noreferrer');
    } else if (draft.platform === 'linkedin') {
      await navigator.clipboard.writeText(text);
      toast.success('Copied. Paste it into LinkedIn.');
      window.open(LINKEDIN_COMPOSE_URL, '_blank', 'noopener,noreferrer');
    } else {
      await navigator.clipboard.writeText(text);
      toast.success('Copied.');
    }
    setStage('confirm');
  };

  const publishDirect = async () => {
    setBusy(true);
    try {
      const { draft: updated } = await api<{ draft: DraftRecord }>(`/api/drafts/${draft.id}/publish`, { method: 'POST' });
      upsert(updated);
      toast.success(`Posted to ${PLATFORM_NAMES[draft.platform]}.`);
      close();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Publishing failed.');
    } finally {
      setBusy(false);
    }
  };

  const markPosted = async (withUrl: boolean) => {
    setBusy(true);
    try {
      const result = await api<{ draft: DraftRecord; matched: boolean; linked: boolean }>(`/api/drafts/${draft.id}/posted`, {
        method: 'POST',
        json: withUrl && url.trim() ? { url: url.trim() } : {},
      });
      upsert(result.draft);
      toast.success(result.linked ? 'Linked. Results will appear in your Playbook.' : 'Marked as posted. Paste the link later to track results.');
      close();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not update the draft.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} title={stage === 'choose' ? `Post to ${PLATFORM_NAMES[draft.platform]}` : 'Posted it?'}>
      {stage === 'choose' ? (
        <div className="flex flex-col gap-4">
          {connected && (
            <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-4">
              <div className="text-[14px] font-medium text-white">Publish now</div>
              <p className="mt-1 text-[13px] text-white/55">Posts straight to your connected {PLATFORM_NAMES[draft.platform]} account.</p>
              <Button variant="primary" size="sm" className="mt-3" loading={busy} onClick={publishDirect}>
                Publish to {PLATFORM_NAMES[draft.platform]}
              </Button>
            </div>
          )}

          {draft.platform === 'x' && segments.length > 1 ? (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] leading-relaxed text-white/60">
                X does not accept whole threads from outside apps. Post the first one, then reply to it with each of the rest, in order.
              </p>
              <ol className="flex flex-col gap-2">
                {segments.map((segment, index) => (
                  <li key={index} className="flex items-start gap-3 rounded-2xl bg-white/[0.03] p-3">
                    <span className="mt-0.5 text-[12px] font-semibold text-white/35 tabular-nums">{index + 1}</span>
                    <p className="min-w-0 flex-1 whitespace-pre-wrap text-[14px] leading-snug text-white/85">{segment}</p>
                    <Button variant="quiet" size="xs" onClick={() => copy(segment, index)}>
                      {copiedIndex === index ? 'Copied' : 'Copy'}
                    </Button>
                  </li>
                ))}
              </ol>
              <Button variant={connected ? 'secondary' : 'primary'} size="md" className="mt-1 self-start" onClick={openExternal}>
                Open X with the first post
              </Button>
            </div>
          ) : (
            <Button variant={connected ? 'secondary' : 'primary'} size="md" className="self-start" onClick={openExternal}>
              {draft.platform === 'linkedin' || draft.platform === 'instagram' || draft.platform === 'newsletter'
                ? `Copy and open ${PLATFORM_NAMES[draft.platform]}`
                : `Open ${PLATFORM_NAMES[draft.platform]} with the post filled in`}
            </Button>
          )}

          <button type="button" onClick={() => setStage('confirm')} className="self-start text-[12.5px] text-white/45 hover:text-white">
            I already posted it
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[14px] leading-relaxed text-white/65">
            Link the draft to the live post so Forge can pull its results and learn what works for you.
            {draft.platform === 'x' && ' For X, Forge can usually find it on its own.'}
          </p>
          {draft.platform === 'x' && (
            <Button variant="primary" size="md" className="self-start" loading={busy} onClick={() => markPosted(false)}>
              Yes, find it for me
            </Button>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={`Paste the ${PLATFORM_NAMES[draft.platform]} link`}
              className={cn(inputClass, 'h-10 rounded-full py-0')}
              inputMode="url"
            />
            <Button variant={draft.platform === 'x' ? 'secondary' : 'primary'} size="md" loading={busy} disabled={!url.trim()} onClick={() => markPosted(true)}>
              Link it
            </Button>
          </div>
          {draft.platform !== 'x' && (
            <button type="button" onClick={() => markPosted(false)} className="self-start text-[12.5px] text-white/45 hover:text-white">
              Mark as posted without a link
            </button>
          )}
        </div>
      )}
    </Dialog>
  );
}
