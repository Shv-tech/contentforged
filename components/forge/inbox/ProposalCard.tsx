'use client';

/**
 * One story Forge proposes from something captured. Keep it (as is, or
 * after a quick edit) and it joins the Story Bank; discard it and it is
 * gone. Nothing reaches the Story Bank without this decision.
 */

import { useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError } from '@/lib/forge/client';
import { decideProposal, type ProposalRecord } from '@/lib/forge/capture-client';
import { STORY_KIND_LABELS } from '@/lib/forge/labels';
import type { StoryKind } from '@/lib/forge/types';
import { Button, Tag, cn, formatDuration, inputClass, textareaClass } from '@/components/forge/ui';

const KIND_TONE: Record<StoryKind, 'ember' | 'good' | 'warn' | 'bad' | 'steel' | 'neutral'> = {
  story: 'ember',
  metric: 'steel',
  win: 'good',
  failure: 'bad',
  opinion: 'warn',
  fact: 'neutral',
};

export function ProposalCard({
  proposal,
  onDecided,
  onPlayFrom,
  readOnly = false,
}: {
  proposal: ProposalRecord;
  onDecided: (id: string, action: 'keep' | 'discard') => void;
  /** Interviews and voice notes: jump the recording to where this was said. */
  onPlayFrom?: (seconds: number) => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(proposal.title);
  const [body, setBody] = useState(proposal.body);
  const [kind, setKind] = useState<StoryKind>(proposal.kind);
  const [busy, setBusy] = useState<'keep' | 'discard' | null>(null);

  async function decide(action: 'keep' | 'discard') {
    setBusy(action);
    try {
      const edited = editing && (title !== proposal.title || body !== proposal.body || kind !== proposal.kind);
      await decideProposal(proposal.id, action, action === 'keep' && edited ? { title, body, kind } : undefined);
      onDecided(proposal.id, action);
      if (action === 'keep') toast.success('Kept. It is in your Story Bank.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save that decision.');
      setBusy(null);
    }
  }

  return (
    <article className="group rounded-[20px] border border-white/[0.07] bg-forge-card p-5 transition-colors hover:border-white/[0.12]">
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <div className="flex flex-wrap gap-1">
            {(Object.keys(STORY_KIND_LABELS) as StoryKind[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                aria-pressed={kind === option}
                className={cn('rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors', kind === option ? 'bg-white text-black' : 'bg-white/[0.05] text-white/55 hover:text-white')}
              >
                {STORY_KIND_LABELS[option]}
              </button>
            ))}
          </div>
        ) : (
          <Tag tone={KIND_TONE[proposal.kind]} dot>
            {STORY_KIND_LABELS[proposal.kind]}
          </Tag>
        )}
        {proposal.occurred_on && <span className="text-[12px] text-white/35">{new Date(`${proposal.occurred_on}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
      </div>

      {editing ? (
        <div className="mt-4 flex flex-col gap-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} maxLength={140} aria-label="Title" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className={textareaClass} maxLength={4000} aria-label="What happened" />
        </div>
      ) : (
        <>
          <h3 className="mt-3 text-[16px] font-semibold leading-snug tracking-[-0.01em] text-white">{proposal.title}</h3>
          <p className="mt-2 whitespace-pre-wrap text-[14.5px] leading-relaxed text-white/70">{proposal.body}</p>
        </>
      )}

      {proposal.quote && !editing && (
        <blockquote className="mt-4 border-l-2 border-forge-ember/50 pl-3 text-[13.5px] italic leading-relaxed text-white/55">
          {proposal.quote}
          {proposal.quote_start_seconds !== null && onPlayFrom && (
            <button
              type="button"
              onClick={() => onPlayFrom(proposal.quote_start_seconds ?? 0)}
              className="ml-2 not-italic text-[12px] font-medium text-forge-gold underline-offset-4 hover:underline"
            >
              Play from {formatDuration(proposal.quote_start_seconds)}
            </button>
          )}
        </blockquote>
      )}

      {!readOnly && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" loading={busy === 'keep'} disabled={busy !== null} onClick={() => decide('keep')}>
            {editing ? 'Save and keep' : 'Keep'}
          </Button>
          {editing ? (
            <Button
              variant="quiet"
              size="sm"
              disabled={busy !== null}
              onClick={() => {
                setEditing(false);
                setTitle(proposal.title);
                setBody(proposal.body);
                setKind(proposal.kind);
              }}
            >
              Cancel
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          <Button variant="quiet" size="sm" loading={busy === 'discard'} disabled={busy !== null} onClick={() => decide('discard')} className="ml-auto">
            Discard
          </Button>
        </div>
      )}
    </article>
  );
}
