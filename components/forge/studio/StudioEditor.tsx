'use client';

/**
 * The studio's writing surface: the draft's text, edited live with whoever
 * else has it open. Shows who is here and which line they are on, whether
 * the latest edit is saved, length against the platform's limit, and how
 * the text sits against the author's measured voice. Selecting words offers
 * to comment on exactly those words.
 */

import { useEffect, useRef, useState } from 'react';
import { measure, PLATFORM_LIMITS } from '@/lib/forge/text';
import type { CollabPeer, CollabStatus } from '@/lib/forge/use-collab';
import type { DraftRecord } from '@/lib/forge/types';
import { useVoiceStore } from '@/lib/forge/client';
import { VoiceMeter, useVoiceScore } from '@/components/forge/drafts/VoiceMeter';
import { Avatar, Button, cn } from '@/components/forge/ui';

const STATUS_COPY: Record<CollabStatus, { label: string; tone: string }> = {
  loading: { label: 'Opening', tone: 'text-white/40' },
  connecting: { label: 'Connecting', tone: 'text-white/40' },
  live: { label: 'Live', tone: 'text-forge-good' },
  solo: { label: 'Saved', tone: 'text-white/45' },
  saving: { label: 'Saving', tone: 'text-white/45' },
  saved: { label: 'Saved', tone: 'text-white/45' },
  error: { label: 'Not saved', tone: 'text-forge-bad' },
};

export interface Selection {
  text: string;
  start: number;
  end: number;
}

export function StudioEditor({
  draft,
  collab,
  canEdit,
  onComment,
}: {
  draft: DraftRecord;
  collab: {
    status: CollabStatus;
    text: string;
    peers: CollabPeer[];
    error: string | null;
    bind: (el: HTMLTextAreaElement | null) => void;
    onInput: () => void;
    onCursor: () => void;
  };
  canEdit: boolean;
  onComment: (selection: Selection) => void;
}) {
  const loadVoice = useVoiceStore((s) => s.load);
  const [selection, setSelection] = useState<Selection | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    loadVoice();
  }, [loadVoice]);

  const isThread = draft.kind === 'thread';
  const posts = isThread ? collab.text.split(/\n[ \t]*---[ \t]*\n/).map((p) => p.trim()).filter(Boolean) : [collab.text];
  const limit = PLATFORM_LIMITS[draft.platform];
  const lengths = posts.map((post) => measure(post, draft.platform));
  const over = lengths.some((length) => length > limit);
  const voice = useVoiceScore(collab.text);
  const status = STATUS_COPY[collab.status];
  const locked = !canEdit || draft.status === 'posted';

  // Grow with the text, so the page scrolls rather than a box inside it.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 320)}px`;
  }, [collab.text]);

  const readSelection = () => {
    const el = area.current;
    collab.onCursor();
    if (!el || el.selectionStart === el.selectionEnd) {
      setSelection(null);
      return;
    }
    const text = el.value.slice(el.selectionStart, el.selectionEnd).trim();
    setSelection(text.length >= 2 ? { text: text.slice(0, 500), start: el.selectionStart, end: el.selectionEnd } : null);
  };

  return (
    <section className="flex flex-col rounded-[26px] border border-white/[0.08] bg-forge-card">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-5 py-3.5 sm:px-7">
        <span className={cn('flex items-center gap-2 text-[12.5px] font-medium', status.tone)} aria-live="polite">
          <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', collab.status === 'live' ? 'bg-forge-good' : collab.status === 'error' ? 'bg-forge-bad' : 'bg-white/30')} />
          {status.label}
        </span>
        {collab.peers.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {collab.peers.slice(0, 5).map((peer) => (
                <span key={peer.key} title={`${peer.name}${peer.line ? `, on line ${peer.line}` : ''}${peer.canEdit ? '' : ' (viewing)'}`} className="rounded-full ring-2 ring-forge-card">
                  <Avatar name={peer.name} size="sm" />
                </span>
              ))}
            </div>
            <span className="text-[12px] text-white/45">
              {collab.peers.length === 1
                ? `${collab.peers[0].name}${collab.peers[0].line ? ` is on line ${collab.peers[0].line}` : ' is here'}`
                : `${collab.peers.length} others here`}
            </span>
          </div>
        )}
        <div className="ml-auto">
          <VoiceMeter score={voice.score} needsSamples={voice.needsSamples} compact />
        </div>
      </header>

      <div className="relative px-5 py-5 sm:px-7 sm:py-6">
        <textarea
          ref={(el) => {
            area.current = el;
            collab.bind(el);
          }}
          onInput={() => {
            collab.onInput();
            setSelection(null);
          }}
          onSelect={readSelection}
          onKeyUp={readSelection}
          onBlur={() => collab.onCursor()}
          readOnly={locked}
          dir="auto"
          spellCheck
          aria-label="Draft text"
          placeholder={canEdit ? 'Write the post here.' : ''}
          className="min-h-[320px] w-full resize-none bg-transparent text-[16.5px] leading-[1.7] text-white outline-none placeholder:text-white/25 md:text-[16px]"
        />

        {selection && (
          <div className="sticky bottom-4 z-10 mt-2 flex justify-center">
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-[#161616] p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.9)]" onMouseDown={(e) => e.preventDefault()}>
              <Button variant="quiet" size="xs" onClick={() => onComment(selection)}>
                Comment on this
              </Button>
            </div>
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.06] px-5 py-3 text-[12px] text-white/40 sm:px-7">
        {isThread ? (
          <span className={cn('tabular-nums', over && 'text-forge-bad')}>
            {posts.length} {posts.length === 1 ? 'post' : 'posts'}
            {over ? `, ${lengths.filter((l) => l > limit).length} over ${limit}` : ''}
          </span>
        ) : (
          <span className={cn('tabular-nums', over && 'text-forge-bad')}>
            {lengths[0].toLocaleString()} / {limit.toLocaleString()}
          </span>
        )}
        {isThread && <span>Put --- on its own line between posts.</span>}
        {voice.drift.length > 0 && (
          <span>
            {voice.drift.length} {voice.drift.length === 1 ? 'line drifts' : 'lines drift'} from your voice
          </span>
        )}
        {draft.status === 'posted' && <span>Posted drafts keep the words that went out.</span>}
        {!canEdit && draft.status !== 'posted' && <span>You can read and comment. Editors change the text.</span>}
        {collab.error && <span className="text-forge-bad">{collab.error}</span>}
      </footer>
    </section>
  );
}
