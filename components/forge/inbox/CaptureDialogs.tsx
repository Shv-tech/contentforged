'use client';

/**
 * The dialogs behind the inbox: one capture opened up (its recording,
 * transcript and proposals), and writing a quick note.
 */

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api } from '@/lib/forge/client';
import { submitNote, type CaptureDetail, type CaptureRecord } from '@/lib/forge/capture-client';
import { CAPTURE_SOURCE_LABELS } from '@/lib/forge/labels';
import { Button, Dialog, LoadingRow, Tag, formatDuration, inputClass, relativeTime, textareaClass } from '@/components/forge/ui';
import { ProposalCard } from './ProposalCard';

export function CaptureDetailDialog({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<CaptureDetail | null>(null);
  const [busy, setBusy] = useState<'retry' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const player = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    setDetail(null);
    setConfirmDelete(false);
    if (!id) return;
    let cancelled = false;
    api<CaptureDetail>(`/api/capture/${id}`)
      .then((data) => !cancelled && setDetail(data))
      .catch((error) => {
        toast.error(error instanceof ApiError ? error.message : 'Could not open that capture.');
        onClose();
      });
    return () => {
      cancelled = true;
    };
  }, [id, onClose]);

  const playFrom = (seconds: number) => {
    if (!player.current) return;
    player.current.currentTime = seconds;
    void player.current.play();
  };

  async function retry() {
    if (!id) return;
    setBusy('retry');
    try {
      await api(`/api/capture/${id}`, { method: 'POST', json: { action: 'retry' } });
      setDetail(await api<CaptureDetail>(`/api/capture/${id}`));
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not read it again.');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!id) return;
    setBusy('delete');
    try {
      await api(`/api/capture/${id}`, { method: 'DELETE' });
      toast.success('Deleted. Stories you kept from it are still in your Story Bank.');
      onChanged();
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not delete it.');
      setBusy(null);
    }
  }

  const capture = detail?.capture;
  const segments = capture?.segments ?? [];

  return (
    <Dialog
      open={id !== null}
      onClose={onClose}
      title={capture?.title || (capture ? CAPTURE_SOURCE_LABELS[capture.source] : 'Capture')}
      className="max-w-[720px]"
      footer={
        capture && (
          <>
            {capture.status === 'failed' && (
              <Button variant="secondary" loading={busy === 'retry'} onClick={retry}>
                Read it again
              </Button>
            )}
            <Button variant={confirmDelete ? 'danger' : 'quiet'} loading={busy === 'delete'} onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}>
              {confirmDelete ? 'Delete for good' : 'Delete'}
            </Button>
          </>
        )
      }
    >
      {!detail || !capture ? (
        <LoadingRow label="Opening" />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-white/45">
            <Tag tone={capture.status === 'failed' ? 'bad' : capture.status === 'processing' ? 'warn' : 'neutral'}>{CAPTURE_SOURCE_LABELS[capture.source]}</Tag>
            <span>{relativeTime(capture.created_at)}</span>
            {capture.duration_seconds ? <span>{formatDuration(capture.duration_seconds)}</span> : null}
            {typeof capture.metadata?.url === 'string' && (
              <a href={capture.metadata.url} target="_blank" rel="noreferrer noopener" className="truncate text-white/60 underline-offset-4 hover:underline">
                {new URL(capture.metadata.url).hostname}
              </a>
            )}
          </div>

          {capture.error && <p className="rounded-[14px] bg-forge-bad/10 p-3 text-[13px] text-forge-bad">{capture.error}</p>}

          {detail.audioUrl && <audio ref={player} src={detail.audioUrl} controls className="w-full" preload="metadata" />}

          {detail.proposals.length > 0 && (
            <section className="flex flex-col gap-3">
              <h3 className="text-[13px] font-semibold text-white/70">What Forge found</h3>
              {detail.proposals.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  readOnly={proposal.status !== 'pending'}
                  onPlayFrom={detail.audioUrl ? playFrom : undefined}
                  onDecided={(proposalId, action) => {
                    setDetail((current) =>
                      current ? { ...current, proposals: current.proposals.map((p) => (p.id === proposalId ? { ...p, status: action === 'keep' ? 'kept' : 'discarded' } : p)) } : current
                    );
                    onChanged();
                  }}
                />
              ))}
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold text-white/70">{segments.length > 0 ? 'Transcript' : 'What was captured'}</h3>
            <div className="custom-scrollbar max-h-[340px] overflow-y-auto rounded-[16px] bg-white/[0.025] p-4">
              {segments.length > 0 ? (
                <ol className="flex flex-col gap-2.5">
                  {segments.map((segment, index) => (
                    <li key={index} className="flex gap-3 text-[14px] leading-relaxed">
                      <button
                        type="button"
                        onClick={() => playFrom(segment.start)}
                        disabled={!detail.audioUrl}
                        className="w-12 shrink-0 pt-0.5 text-left text-[11.5px] tabular-nums text-forge-gold/80 hover:text-forge-gold disabled:text-white/30"
                      >
                        {formatDuration(segment.start)}
                      </button>
                      <span className="text-white/75">{segment.text}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-white/70">{capture.raw_text || 'Nothing was captured.'}</p>
              )}
            </div>
          </section>
        </div>
      )}
    </Dialog>
  );
}

export function NoteDialog({ open, onClose, onCaptured }: { open: boolean; onClose: () => void; onCaptured: (capture: CaptureRecord) => void }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const capture = await submitNote(text.trim(), title.trim());
      onCaptured(capture);
      setTitle('');
      setText('');
      onClose();
      toast.success(capture.proposal_count > 0 ? `${capture.proposal_count} ${capture.proposal_count === 1 ? 'story' : 'stories'} to review.` : 'Saved. Nothing in it looked like a story to keep.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save the note.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Write a note"
      footer={
        <>
          <Button variant="quiet" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="ember" onClick={save} loading={busy} disabled={text.trim().length < 10}>
            Send to Forge
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13.5px] leading-relaxed text-white/55">Paste meeting notes, a message thread, or just write what happened. Forge pulls out the stories and numbers worth keeping and asks you about each one.</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className={inputClass} maxLength={200} />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder="This week a customer told us..." className={textareaClass} maxLength={50_000} autoFocus />
      </div>
    </Dialog>
  );
}
