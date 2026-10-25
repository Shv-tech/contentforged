'use client';

/**
 * The recorder: a voice note to self, or a recorded interview.
 *
 * One big control that does the obvious thing at each step (record, then
 * stop), a live level ring so it is clear the microphone hears you, and a
 * review step before anything is uploaded. Interview mode adds who is being
 * interviewed and an optional question guide aimed at what the Story Bank
 * is missing.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api } from '@/lib/forge/client';
import { submitAudio, type CaptureRecord } from '@/lib/forge/capture-client';
import { MAX_RECORDING_SECONDS, useRecorder } from '@/lib/forge/use-recorder';
import type { InterviewQuestion } from '@/lib/forge/capture/interview';
import { Button, Segmented, cn, focusRing, formatDuration, inputClass } from '@/components/forge/ui';

type Mode = 'voice' | 'interview';
type Stage = 'idle' | 'uploading' | 'transcribing';

const STAGE_COPY: Record<Exclude<Stage, 'idle'>, string> = {
  uploading: 'Uploading the recording',
  transcribing: 'Transcribing and reading it for stories',
};

export function RecorderPanel({
  onCaptured,
  interviewsAllowed,
  autoStart = false,
  compact = false,
}: {
  onCaptured: (capture: CaptureRecord) => void;
  interviewsAllowed: boolean;
  autoStart?: boolean;
  /** Tighter layout for the dashboard inbox; the full-screen capture page uses the roomy one. */
  compact?: boolean;
}) {
  const recorder = useRecorder();
  const [mode, setMode] = useState<Mode>('voice');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [guide, setGuide] = useState<InterviewQuestion[] | null>(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [asked, setAsked] = useState<Set<number>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  const previewUrl = useMemo(() => (recorder.recording ? URL.createObjectURL(recorder.recording.blob) : null), [recorder.recording]);
  useEffect(() => () => (previewUrl ? URL.revokeObjectURL(previewUrl) : undefined), [previewUrl]);

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void recorder.start();
    }
  }, [autoStart, recorder]);

  useEffect(() => {
    if (recorder.error) toast.error(recorder.error);
  }, [recorder.error]);

  const live = recorder.state === 'recording' || recorder.state === 'paused';
  const busy = stage !== 'idle';

  async function send(blob: Blob, contentType: string) {
    try {
      const capture = await submitAudio({
        blob,
        contentType,
        purpose: mode,
        title: title.trim() || undefined,
        subject: mode === 'interview' ? subject.trim() || undefined : undefined,
        onStage: setStage,
      });
      onCaptured(capture);
      recorder.reset();
      setTitle('');
      setAsked(new Set());
      toast.success(
        capture.status === 'failed'
          ? 'Saved. Forge could not read it for stories; you can retry from the inbox.'
          : capture.proposal_count > 0
            ? `${capture.proposal_count} ${capture.proposal_count === 1 ? 'story' : 'stories'} to review.`
            : 'Saved. Nothing in it looked like a story to keep.'
      );
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save the recording. It is still here; try again.');
    } finally {
      setStage('idle');
    }
  }

  async function loadGuide() {
    setGuideLoading(true);
    try {
      const { questions } = await api<{ questions: InterviewQuestion[] }>('/api/capture/interview-guide', {
        method: 'POST',
        json: { subject: subject.trim() || undefined },
      });
      setGuide(questions);
      setAsked(new Set());
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not prepare questions.');
    } finally {
      setGuideLoading(false);
    }
  }

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    void send(file, file.type || 'audio/mpeg');
  }

  const ring = Math.min(1, recorder.level * 3.2);
  const remaining = MAX_RECORDING_SECONDS - recorder.seconds;

  return (
    <div className={cn('flex flex-col', compact ? 'gap-5' : 'gap-7')}>
      {interviewsAllowed && (
        <Segmented<Mode>
          label="What you are recording"
          value={mode}
          onChange={(next) => !live && !busy && setMode(next)}
          options={[
            { value: 'voice', label: 'Voice note' },
            { value: 'interview', label: 'Interview' },
          ]}
          className="self-start"
        />
      )}

      {mode === 'interview' && (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-white/75">Who are you interviewing</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Their name, or leave empty for yourself" className={inputClass} disabled={busy} />
          </label>
          <Button variant="secondary" size="md" onClick={loadGuide} loading={guideLoading} disabled={busy}>
            {guide ? 'New questions' : 'Suggest questions'}
          </Button>
        </div>
      )}

      <div className={cn('flex flex-col items-center text-center', compact ? 'gap-4 py-2' : 'gap-6 py-6')}>
        <div className="relative flex items-center justify-center">
          {/* Level ring: grows with the input so you can see the microphone hears you. */}
          <span
            aria-hidden
            className="absolute rounded-full bg-forge-ember/20 transition-transform duration-100"
            style={{ inset: compact ? -10 : -16, transform: `scale(${live && recorder.state === 'recording' ? 1 + ring * 0.35 : 1})` }}
          />
          <span aria-hidden className={cn('absolute inset-0 rounded-full', recorder.state === 'recording' && 'animate-ping bg-forge-ember/10')} />
          <button
            type="button"
            onClick={() => (live ? recorder.stop() : recorder.state === 'stopped' ? undefined : recorder.start())}
            disabled={busy || recorder.state === 'requesting' || recorder.state === 'stopped'}
            aria-label={live ? 'Stop recording' : 'Start recording'}
            className={cn(
              'relative flex items-center justify-center rounded-full shadow-[0_20px_60px_-15px_rgba(255,138,43,0.6)] transition-transform active:scale-95 disabled:opacity-40 disabled:shadow-none',
              compact ? 'h-20 w-20' : 'h-28 w-28',
              live ? 'bg-white' : 'bg-gradient-to-b from-forge-gold to-forge-ember2',
              focusRing
            )}
          >
            {live ? (
              <span className={cn('rounded-[6px] bg-black', compact ? 'h-6 w-6' : 'h-8 w-8')} />
            ) : (
              <svg viewBox="0 0 24 24" className={cn('text-black', compact ? 'h-8 w-8' : 'h-11 w-11')} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
                <rect x="9" y="3.5" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
                <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
              </svg>
            )}
          </button>
        </div>

        <div aria-live="polite">
          <p className={cn('font-semibold tabular-nums tracking-[-0.02em] text-white', compact ? 'text-[28px]' : 'text-[40px]')}>
            {formatDuration(recorder.state === 'stopped' ? recorder.recording?.seconds : recorder.seconds)}
          </p>
          <p className="mt-1 text-[13px] text-white/45">
            {recorder.state === 'requesting'
              ? 'Allow the microphone to start'
              : recorder.state === 'recording'
                ? remaining < 120
                  ? `${Math.ceil(remaining)} seconds left in this recording`
                  : mode === 'interview'
                    ? 'Recording the conversation'
                    : 'Talk it through. What happened, what you noticed, what it cost.'
                : recorder.state === 'paused'
                  ? 'Paused'
                  : recorder.state === 'stopped'
                    ? 'Listen back, then send it to Forge'
                    : mode === 'interview'
                      ? 'Put the phone between you. Forge only keeps what they say.'
                      : 'Tap to record a voice note'}
          </p>
        </div>

        {live && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={recorder.state === 'paused' ? recorder.resume : recorder.pause}>
              {recorder.state === 'paused' ? 'Resume' : 'Pause'}
            </Button>
            <Button variant="quiet" onClick={recorder.reset}>
              Discard
            </Button>
          </div>
        )}
      </div>

      {recorder.state === 'stopped' && recorder.recording && previewUrl && (
        <div className="flex flex-col gap-4 rounded-[20px] border border-white/[0.08] bg-forge-card p-4 sm:p-5">
          <audio src={previewUrl} controls className="w-full" />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className={inputClass} disabled={busy} maxLength={200} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12.5px] text-white/40" aria-live="polite">
              {busy ? STAGE_COPY[stage as Exclude<Stage, 'idle'>] : 'Nothing is posted. You review every story before it is kept.'}
            </p>
            <div className="flex gap-2">
              <Button variant="quiet" onClick={recorder.reset} disabled={busy}>
                Discard
              </Button>
              <Button variant="ember" loading={busy} onClick={() => recorder.recording && send(recorder.recording.blob, recorder.recording.type)}>
                Send to Forge
              </Button>
            </div>
          </div>
        </div>
      )}

      {recorder.state !== 'stopped' && !live && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 text-[13px] text-white/45">
          <span>Already recorded it?</span>
          <button type="button" onClick={() => fileInput.current?.click()} disabled={busy} className={cn('rounded-sm text-white/80 underline decoration-white/25 underline-offset-4 hover:text-white', focusRing)}>
            {busy ? STAGE_COPY[stage as Exclude<Stage, 'idle'>] : 'Upload an audio file'}
          </button>
          <input ref={fileInput} type="file" accept="audio/*,video/mp4,video/webm" className="hidden" onChange={onFile} />
        </div>
      )}

      {mode === 'interview' && guide && guide.length > 0 && (
        <ol className="flex flex-col gap-2" aria-label="Interview questions">
          {guide.map((item, index) => {
            const done = asked.has(index);
            return (
              <li key={index}>
                <button
                  type="button"
                  onClick={() =>
                    setAsked((previous) => {
                      const next = new Set(previous);
                      if (next.has(index)) next.delete(index);
                      else next.add(index);
                      return next;
                    })
                  }
                  aria-pressed={done}
                  className={cn(
                    'flex w-full gap-3 rounded-[16px] border p-4 text-left transition-colors',
                    done ? 'border-white/[0.04] bg-transparent opacity-45' : 'border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.045]',
                    focusRing
                  )}
                >
                  <span className="mt-0.5 w-5 shrink-0 text-[12px] font-semibold tabular-nums text-forge-gold">{index + 1}</span>
                  <span className="min-w-0">
                    <span className={cn('block text-[14.5px] leading-relaxed text-white', done && 'line-through decoration-white/40')}>{item.question}</span>
                    {item.followUp && <span className="mt-1 block text-[12.5px] text-white/45">Then: {item.followUp}</span>}
                    {item.why && <span className="mt-1.5 block text-[11.5px] font-medium uppercase tracking-[0.08em] text-white/30">{item.why}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
