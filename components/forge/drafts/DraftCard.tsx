'use client';

/**
 * components/forge/drafts/DraftCard.tsx
 *
 * A draft as an object, not as text in a chat bubble. Everything a user does
 * with a post happens here: edit it, see how much it sounds like them, grade
 * it, try other openings, rewrite one line, preview it as it will appear,
 * schedule it, post it, and link it back so results flow into the Playbook.
 *
 * Editing model: the card shows the post as read, with lines that drift from
 * the user's voice underlined. Clicking the text switches to editing; leaving
 * the field saves. Saved user edits feed edit learning, and any suggestion
 * that unlocks appears inside the card as a yes/no question.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError, useDraftStore, useVoiceStore } from '@/lib/forge/client';
import { draftText } from '@/lib/forge/draft-text';
import type { RuleSuggestion } from '@/lib/forge/learning';
import { firstLine, measure, PLATFORM_LIMITS, splitIntoThread } from '@/lib/forge/text';
import { PLATFORM_NAMES, type DraftRecord } from '@/lib/forge/types';
import { DRIFT_LABELS } from '@/lib/forge/voice';
import { PlatformGlyph } from '../icons';
import { Button, IconButton, Popover, Spinner, Tag, cn, relativeTime } from '../ui';
import { GradeStrip } from './GradeStrip';
import { PublishPanel } from './PublishPanel';
import { ResultsStrip } from './ResultsStrip';
import { SchedulePopover } from './SchedulePopover';
import { VariantsDialog } from './VariantsDialog';
import { useVoiceScore, VoiceMeter } from './VoiceMeter';
import { PredictionChip } from './PredictionChip';
import { usePrediction } from '@/lib/forge/use-prediction';

const REWRITE_CHIPS = [
  { mode: 'punchier', label: 'Punchier' },
  { mode: 'shorter', label: 'Shorter' },
  { mode: 'voice', label: 'More like me' },
  { mode: 'true', label: 'Make it true' },
] as const;

type RewriteMode = (typeof REWRITE_CHIPS)[number]['mode'];

export function draftStatusTag(draft: DraftRecord) {
  if (draft.status === 'posted')
    return (
      <Tag tone="good" dot>
        Posted {relativeTime(draft.posted_at)}
      </Tag>
    );
  if (draft.status === 'scheduled' && draft.scheduled_for) {
    return (
      <Tag tone="ember" dot>
        {new Date(draft.scheduled_for).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
      </Tag>
    );
  }
  if (draft.approval_status === 'pending')
    return (
      <Tag tone="steel" dot>
        Awaiting client
      </Tag>
    );
  if (draft.approval_status === 'approved')
    return (
      <Tag tone="good" dot>
        Client approved
      </Tag>
    );
  if (draft.approval_status === 'changes_requested')
    return (
      <Tag tone="warn" dot>
        Changes requested
      </Tag>
    );
  return null;
}

export function DraftCardById({ id }: { id: string }) {
  const draft = useDraftStore((s) => s.drafts[id]);
  const ensure = useDraftStore((s) => s.ensure);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!draft) ensure([id]).catch(() => setFailed(true));
  }, [draft, ensure, id]);

  if (failed) {
    return <div className="my-4 rounded-[22px] border border-white/[0.06] p-4 text-[13px] text-white/45">This draft could not be loaded.</div>;
  }
  if (!draft) {
    return (
      <div className="my-4 flex h-[180px] w-full max-w-[680px] items-center justify-center rounded-[24px] border border-white/[0.06] bg-forge-card">
        <Spinner className="text-white/40" />
      </div>
    );
  }
  return <DraftCard draft={draft} />;
}

export function DraftCard({ draft }: { draft: DraftRecord }) {
  const upsert = useDraftStore((s) => s.upsert);
  const setPreview = useDraftStore((s) => s.setPreview);
  const previewId = useDraftStore((s) => s.previewId);
  const loadVoice = useVoiceStore((s) => s.load);

  const savedText = draftText(draft);
  const prediction = usePrediction(draft.status === 'posted' ? null : draft);
  const isThread = draft.kind === 'thread';

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(savedText);
  const [segments, setSegments] = useState<string[]>(draft.segments);
  const [saving, setSaving] = useState(false);
  const [grading, setGrading] = useState(!draft.grade && Date.now() - new Date(draft.created_at).getTime() < 30_000);
  const [suggestion, setSuggestion] = useState<RuleSuggestion | null>(null);
  const [showVariants, setShowVariants] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selection, setSelection] = useState<{ text: string; top: number; left: number } | null>(null);
  const [rewriting, setRewriting] = useState<RewriteMode | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadVoice();
  }, [loadVoice]);

  // Server updates (a grade landing, a schedule change) refresh local text
  // only while the user is not mid-edit.
  useEffect(() => {
    if (editing) return;
    setText(draftText(draft));
    setSegments(draft.segments);
  }, [draft, editing]);

  // The grade arrives through the stream a few seconds after the card; stop
  // showing "Grading" once it lands or after a generous timeout.
  useEffect(() => {
    if (draft.grade) setGrading(false);
    if (!grading) return;
    const timer = setTimeout(() => setGrading(false), 30_000);
    return () => clearTimeout(timer);
  }, [draft.grade, grading]);

  const liveText = isThread ? segments.join('\n\n') : text;
  const voice = useVoiceScore(liveText);

  const setWorking = useDraftStore((s) => s.setWorking);
  useEffect(() => {
    setWorking(draft.id, editing ? liveText : null);
  }, [draft.id, editing, liveText, setWorking]);
  useEffect(() => () => setWorking(draft.id, null), [draft.id, setWorking]);
  const limit = PLATFORM_LIMITS[draft.platform];
  const length = measure(liveText, draft.platform);
  const overLimit = !isThread && length > limit;

  const driftByLine = useMemo(() => new Map(voice.drift.map((d) => [d.line, d])), [voice.drift]);

  // ----- persistence --------------------------------------------------------

  const save = useCallback(
    async (patch: { body?: string; segments?: string[] }, origin: 'user' | 'assist' = 'user') => {
      setSaving(true);
      try {
        const result = await api<{ draft: DraftRecord; suggestions: RuleSuggestion[] }>(`/api/drafts/${draft.id}`, {
          method: 'PATCH',
          json: { ...patch, origin },
        });
        upsert(result.draft);
        if (result.suggestions.length > 0) setSuggestion(result.suggestions[0]);
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : 'Could not save your edit.');
      } finally {
        setSaving(false);
      }
    },
    [draft.id, upsert]
  );

  const commitEdit = async () => {
    setEditing(false);
    if (isThread) {
      const cleaned = segments.map((s) => s.trim()).filter(Boolean);
      if (cleaned.join('\n\n') !== draft.segments.join('\n\n')) await save({ segments: cleaned });
    } else if (text.trim() !== draft.body.trim()) {
      await save({ body: text });
    }
  };

  const regrade = async () => {
    setGrading(true);
    try {
      const { draft: updated } = await api<{ draft: DraftRecord }>(`/api/drafts/${draft.id}/grade`, { method: 'POST' });
      upsert(updated);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Grading failed.');
    } finally {
      setGrading(false);
    }
  };

  const replaceOpening = async (hook: string) => {
    const current = firstLine(liveText);
    if (isThread) {
      const next = [...segments];
      next[0] = next[0].replace(current, hook);
      setSegments(next);
      await save({ segments: next });
    } else {
      const next = text.replace(current, hook);
      setText(next);
      await save({ body: next });
    }
  };

  const copyPost = async () => {
    await navigator.clipboard.writeText(liveText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const answerSuggestion = async (accept: boolean) => {
    if (!suggestion) return;
    const current = suggestion;
    setSuggestion(null);
    try {
      await api('/api/rules', {
        method: 'POST',
        json: { action: accept ? 'accept' : 'reject', signalKey: current.signalKey, rule: current.rule, kind: current.kind, evidence: current.evidence },
      });
      if (accept) {
        toast.success('Saved to your rules. Every draft follows it from now on.');
        useVoiceStore.getState().load(true);
      }
    } catch {
      toast.error('Could not save that.');
    }
  };

  const convertToThread = async () => {
    const parts = splitIntoThread(text, draft.platform);
    setSegments(parts);
    try {
      const result = await api<{ draft: DraftRecord }>(`/api/drafts/${draft.id}`, {
        method: 'PATCH',
        json: { kind: 'thread', segments: parts, origin: 'assist' },
      });
      upsert(result.draft);
    } catch {
      toast.error('Could not convert to a thread.');
    }
  };

  const archive = async () => {
    try {
      const { draft: updated } = await api<{ draft: DraftRecord }>(`/api/drafts/${draft.id}`, { method: 'DELETE' });
      upsert(updated);
      toast.success('Archived.');
    } catch {
      toast.error('Could not archive the draft.');
    }
  };

  const requestApproval = async () => {
    try {
      const { url } = await api<{ url: string }>(`/api/drafts/${draft.id}/approval`, { method: 'POST' });
      await navigator.clipboard.writeText(url);
      const refreshed = await api<{ draft: DraftRecord }>(`/api/drafts/${draft.id}`);
      upsert(refreshed.draft);
      toast.success('Approval link copied. Send it to your client.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not create the approval link.');
    }
  };

  // ----- select a line to rewrite ------------------------------------------

  useEffect(() => {
    if (editing) {
      setSelection(null);
      return;
    }
    const onUp = () => {
      const active = window.getSelection();
      if (!active || active.isCollapsed || active.rangeCount === 0) return setSelection(null);
      const range = active.getRangeAt(0);
      if (!bodyRef.current?.contains(range.commonAncestorContainer)) return setSelection(null);
      const selected = active.toString().trim();
      if (selected.length < 3 || !liveText.includes(selected)) return setSelection(null);
      const rect = range.getBoundingClientRect();
      const host = bodyRef.current.getBoundingClientRect();
      setSelection({ text: selected, top: rect.top - host.top, left: Math.min(Math.max(rect.left - host.left + rect.width / 2, 120), host.width - 120) });
    };
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
    return () => {
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchend', onUp);
    };
  }, [editing, liveText]);

  const rewrite = async (mode: RewriteMode) => {
    if (!selection) return;
    setRewriting(mode);
    try {
      const { replacement, note } = await api<{ replacement: string; note: string | null }>(`/api/drafts/${draft.id}/rewrite`, {
        method: 'POST',
        json: { span: selection.text, mode },
      });
      if (isThread) {
        const next = segments.map((segment) => (segment.includes(selection.text) ? segment.replace(selection.text, replacement) : segment));
        setSegments(next);
        await save({ segments: next }, 'assist');
      } else {
        const next = text.replace(selection.text, replacement);
        setText(next);
        await save({ body: next }, 'assist');
      }
      if (note) toast(note, { duration: 6000 });
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not rewrite that.');
    } finally {
      setRewriting(null);
    }
  };

  // ----- render --------------------------------------------------------------

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text, editing]);

  const renderReadOnly = (value: string, lineOffset = 0) =>
    value.split('\n').map((line, index) => {
      const drift = driftByLine.get(index + lineOffset);
      if (!line.trim()) return <div key={index} className="h-[0.9em]" />;
      return (
        <div
          key={index}
          className={cn(drift && 'decoration-forge-warn/70 underline decoration-dotted decoration-[1.5px] underline-offset-[5px]')}
          title={drift ? `${DRIFT_LABELS[drift.reasons[0]]}. ${drift.detail}` : undefined}
        >
          {line}
        </div>
      );
    });

  const lineOffsets = useMemo(() => {
    let offset = 0;
    return segments.map((segment) => {
      const start = offset;
      offset += segment.split('\n').length + 1;
      return start;
    });
  }, [segments]);

  return (
    <article
      className={cn(
        'my-4 w-full max-w-[680px] rounded-[24px] border bg-forge-card transition-colors',
        previewId === draft.id ? 'border-white/20' : 'border-white/[0.08]'
      )}
      aria-label={`${PLATFORM_NAMES[draft.platform]} draft`}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-1 pt-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-white">
            <PlatformGlyph platform={draft.platform} className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-[13px] font-medium text-white/80">
            {draft.title || `${PLATFORM_NAMES[draft.platform]} ${draft.kind === 'thread' ? `thread, ${segments.length} posts` : draft.kind}`}
          </span>
          {draftStatusTag(draft)}
          <PredictionChip prediction={prediction} className="hidden sm:inline-flex" />
        </div>
        <VoiceMeter score={voice.score} needsSamples={voice.needsSamples} />
      </header>

      <div ref={bodyRef} className="relative px-5 py-3">
        {selection && !editing && (
          <div
            className="absolute z-20 flex -translate-x-1/2 -translate-y-full gap-1 rounded-full border border-white/10 bg-[#161616] p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.9)]"
            style={{ top: selection.top - 6, left: selection.left }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {REWRITE_CHIPS.map((chip) => (
              <button
                key={chip.mode}
                type="button"
                disabled={rewriting !== null}
                onClick={() => rewrite(chip.mode)}
                className="flex h-7 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                {rewriting === chip.mode && <Spinner className="h-3 w-3" />}
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {isThread ? (
          <ol className="flex flex-col gap-3">
            {segments.map((segment, index) => {
              const segmentLength = measure(segment, draft.platform);
              const segmentOver = segmentLength > limit;
              return (
                <li key={index} className="relative flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.07] text-[11px] font-semibold text-white/60 tabular-nums">
                      {index + 1}
                    </span>
                    {index < segments.length - 1 && <span className="mt-1 w-px flex-1 bg-white/[0.08]" />}
                  </div>
                  <div className="min-w-0 flex-1 pb-1">
                    {editing ? (
                      <textarea
                        value={segment}
                        onChange={(e) => setSegments(segments.map((s, i) => (i === index ? e.target.value : s)))}
                        rows={Math.max(2, segment.split('\n').length)}
                        className="w-full resize-none bg-transparent text-[15.5px] leading-relaxed text-white outline-none"
                      />
                    ) : (
                      <div className="cursor-text whitespace-pre-wrap text-[15.5px] leading-relaxed text-white/95" onClick={() => setEditing(true)}>
                        {renderReadOnly(segment, lineOffsets[index])}
                      </div>
                    )}
                    <div className={cn('mt-1 text-[11.5px] tabular-nums', segmentOver ? 'text-forge-bad' : 'text-white/30')}>
                      {segmentLength}/{limit}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : editing ? (
          <textarea
            ref={textareaRef}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commitEdit}
            className="w-full resize-none bg-transparent text-[15.5px] leading-relaxed text-white outline-none"
          />
        ) : (
          <div className="cursor-text whitespace-pre-wrap text-[15.5px] leading-relaxed text-white/95" onClick={() => setEditing(true)} title="Click to edit">
            {renderReadOnly(text)}
          </div>
        )}

        {isThread && editing && (
          <div className="mt-3 flex gap-2">
            <Button variant="quiet" size="xs" onClick={() => setSegments([...segments, ''])}>
              Add a post
            </Button>
            <Button variant="primary" size="xs" onClick={commitEdit} loading={saving}>
              Done
            </Button>
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-white/35">
          {!isThread && (
            <span className={cn('tabular-nums', overLimit && 'text-forge-bad')}>
              {length.toLocaleString()} / {limit.toLocaleString()}
            </span>
          )}
          {overLimit && draft.platform === 'x' && (
            <button type="button" onClick={convertToThread} className="text-forge-gold hover:underline">
              Split into a thread
            </button>
          )}
          {voice.drift.length > 0 && (
            <span>
              {voice.drift.length} {voice.drift.length === 1 ? 'line drifts' : 'lines drift'} from your voice. Hover to see why.
            </span>
          )}
          {saving && <span>Saving</span>}
          {!editing && <span className="hidden sm:inline">Select any line to rewrite it.</span>}
        </div>
      </div>

      {draft.notes && <p className="px-5 pb-3 text-[13px] leading-relaxed text-white/50">{draft.notes}</p>}

      {suggestion && (
        <div className="mx-5 mb-3 flex flex-col gap-3 rounded-2xl border border-forge-ember/25 bg-forge-ember/[0.06] p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13.5px] leading-snug text-white/90">{suggestion.prompt}</p>
          <div className="flex shrink-0 gap-2">
            <Button variant="primary" size="xs" onClick={() => answerSuggestion(true)}>
              Yes
            </Button>
            <Button variant="quiet" size="xs" onClick={() => answerSuggestion(false)}>
              No
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 px-5">
        <GradeStrip grade={draft.grade} grading={grading} onGrade={regrade} onUseRewrite={replaceOpening} />
        {draft.status === 'posted' && <ResultsStrip draft={draft} />}
      </div>

      <footer className="flex flex-wrap items-center gap-1.5 px-4 pb-4 pt-3">
        <Button variant="quiet" size="sm" onClick={copyPost}>
          {copied ? 'Copied' : 'Copy post'}
        </Button>
        <Button variant="quiet" size="sm" onClick={() => setPreview(previewId === draft.id ? null : draft.id)}>
          {previewId === draft.id ? 'Hide preview' : 'Preview'}
        </Button>
        <SchedulePopover
          draft={draft}
          trigger={({ toggle }) => (
            <Button variant="quiet" size="sm" onClick={toggle} disabled={draft.status === 'posted'}>
              {draft.status === 'scheduled' ? 'Reschedule' : 'Schedule'}
            </Button>
          )}
        />
        <Button variant="quiet" size="sm" onClick={() => setShowVariants(true)}>
          Variants
        </Button>
        <div className="ml-auto flex items-center gap-1">
          {draft.status === 'posted' && draft.post_url ? (
            <a
              href={draft.post_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium text-white/70 hover:bg-white/[0.06] hover:text-white"
            >
              View post
            </a>
          ) : (
            <Button variant="primary" size="sm" onClick={() => setShowPublish(true)}>
              {draft.status === 'posted' ? 'Link post' : 'Post'}
            </Button>
          )}
          <Popover
            align="end"
            side="top"
            trigger={({ toggle }) => (
              <IconButton label="More actions" onClick={toggle}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                  <circle cx="5" cy="12" r="1.7" />
                  <circle cx="12" cy="12" r="1.7" />
                  <circle cx="19" cy="12" r="1.7" />
                </svg>
              </IconButton>
            )}
          >
            {(close) => (
              <div className="flex flex-col">
                {[
                  { label: 'Open in studio', run: () => window.location.assign(`/drafts/${draft.id}`) },
                  { label: 'Edit text', run: () => setEditing(true) },
                  !isThread && draft.platform === 'x' ? { label: 'Turn into a thread', run: convertToThread } : null,
                  draft.workspace_id ? { label: 'Send to client for approval', run: requestApproval } : null,
                  draft.status !== 'posted' ? { label: 'Mark as posted', run: () => setShowPublish(true) } : null,
                  { label: 'Archive', run: archive },
                ]
                  .filter((item): item is { label: string; run: () => void } => item !== null)
                  .map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        close();
                        item.run();
                      }}
                      className="rounded-xl px-3 py-2 text-left text-[13.5px] text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                      {item.label}
                    </button>
                  ))}
              </div>
            )}
          </Popover>
        </div>
      </footer>

      <VariantsDialog
        draftId={draft.id}
        currentScore={draft.grade?.score ?? null}
        open={showVariants}
        onClose={() => setShowVariants(false)}
        onPick={replaceOpening}
      />
      <PublishPanel draft={draft} open={showPublish} onClose={() => setShowPublish(false)} />
    </article>
  );
}
