'use client';

/**
 * The idea queue: angles worth writing, each saying where it came from and
 * why it is here. Captures, the Story Bank, audience questions, posts worth
 * running again and the niche all feed it; the weekly plan draws from the
 * top. Any idea can be written now, on any platform.
 */

import Link from 'next/link';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api, useDraftStore } from '@/lib/forge/client';
import type { IdeaRecord } from '@/lib/forge/ideas';
import { IDEA_SOURCE_LABELS, type IdeaSource } from '@/lib/forge/labels';
import type { DraftPlatform, DraftRecord } from '@/lib/forge/types';
import { PlatformPicker } from '@/components/forge/drafts/PlatformPicker';
import { Button, EmptyState, Tag, inputClass, relativeTime } from '@/components/forge/ui';

export type QueuedIdea = IdeaRecord & { effective_score: number };

const SOURCE_TONE: Record<IdeaSource, 'ember' | 'good' | 'warn' | 'steel' | 'neutral'> = {
  capture: 'ember',
  story: 'ember',
  reply_question: 'good',
  repost: 'steel',
  pulse: 'warn',
  format: 'neutral',
  manual: 'neutral',
  experiment: 'steel',
};

export function IdeasPanel({ ideas, onChange, readOnly }: { ideas: QueuedIdea[]; onChange: (ideas: QueuedIdea[]) => void; readOnly: boolean }) {
  const [angle, setAngle] = useState('');
  const [adding, setAdding] = useState(false);
  const [writing, setWriting] = useState<string | null>(null);
  const [platform, setPlatform] = useState<DraftPlatform>('linkedin');
  const [busy, setBusy] = useState<string | null>(null);
  const [written, setWritten] = useState<Record<string, string>>({});
  const upsert = useDraftStore((s) => s.upsert);

  async function add() {
    if (angle.trim().length < 3) return;
    setAdding(true);
    try {
      const { idea } = await api<{ idea: IdeaRecord }>('/api/ideas', { method: 'POST', json: { angle: angle.trim() } });
      onChange([{ ...idea, effective_score: idea.score }, ...ideas]);
      setAngle('');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not add the idea.');
    } finally {
      setAdding(false);
    }
  }

  async function dismiss(idea: QueuedIdea) {
    onChange(ideas.filter((i) => i.id !== idea.id));
    try {
      await api(`/api/ideas/${idea.id}`, { method: 'PATCH', json: { status: 'dismissed' } });
      toast(
        (t) => (
          <span className="flex items-center gap-3">
            Dismissed.
            <button
              type="button"
              className="font-medium text-forge-gold"
              onClick={async () => {
                toast.dismiss(t.id);
                await api(`/api/ideas/${idea.id}`, { method: 'PATCH', json: { status: 'open' } }).catch(() => undefined);
                onChange([idea, ...ideas.filter((i) => i.id !== idea.id)]);
              }}
            >
              Undo
            </button>
          </span>
        ),
        { duration: 5000 }
      );
    } catch (error) {
      onChange(ideas);
      toast.error(error instanceof ApiError ? error.message : 'Could not dismiss it.');
    }
  }

  async function write(idea: QueuedIdea) {
    setBusy(idea.id);
    try {
      const { draft } = await api<{ draft: DraftRecord }>(`/api/ideas/${idea.id}`, { method: 'POST', json: { platform, kind: 'post' } });
      upsert(draft);
      setWritten((previous) => ({ ...previous, [idea.id]: draft.id }));
      setWriting(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not write it.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!readOnly && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
          className="flex gap-2"
        >
          <input value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="An idea of your own: what would you say about..." className={inputClass} maxLength={500} aria-label="New idea" />
          <Button type="submit" variant="secondary" size="md" loading={adding} disabled={angle.trim().length < 3}>
            Add
          </Button>
        </form>
      )}

      {ideas.length === 0 ? (
        <EmptyState
          plate="steel"
          title="No ideas waiting"
          body="Ideas arrive from what you capture, your Story Bank, questions in your comments and posts worth running again. Record a voice note about your week to start the queue."
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {ideas.map((idea) => {
            const draftId = written[idea.id] ?? idea.draft_id;
            return (
              <li key={idea.id} className="rounded-[20px] border border-white/[0.07] bg-forge-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone={SOURCE_TONE[idea.source]} dot>
                    {IDEA_SOURCE_LABELS[idea.source]}
                  </Tag>
                  <span className="text-[12px] text-white/30">{relativeTime(idea.created_at)}</span>
                </div>
                <p className="mt-3 text-[15.5px] font-medium leading-snug text-white">{idea.angle}</p>
                {idea.rationale && <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/50">{idea.rationale}</p>}

                {draftId ? (
                  <div className="mt-4 flex items-center gap-3 rounded-[14px] bg-forge-good/10 px-4 py-3 text-[13.5px] text-forge-good">
                    Draft written.
                    <Link href={`/drafts/${draftId}`} className="font-medium text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
                      Open in studio
                    </Link>
                  </div>
                ) : writing === idea.id ? (
                  <div className="mt-4 flex flex-col gap-3 rounded-[16px] bg-white/[0.03] p-4">
                    <PlatformPicker value={platform} onChange={setPlatform} size="sm" />
                    <div className="flex gap-2">
                      <Button variant="ember" size="sm" loading={busy === idea.id} onClick={() => write(idea)}>
                        Write it
                      </Button>
                      <Button variant="quiet" size="sm" onClick={() => setWriting(null)} disabled={busy === idea.id}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  !readOnly && (
                    <div className="mt-4 flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setPlatform(idea.platform ?? 'linkedin');
                          setWriting(idea.id);
                        }}
                      >
                        Write now
                      </Button>
                      <Button variant="quiet" size="sm" onClick={() => dismiss(idea)} className="ml-auto">
                        Dismiss
                      </Button>
                    </div>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
