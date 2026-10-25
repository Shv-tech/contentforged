'use client';

/**
 * Voice Fingerprint: the samples it is built from, what it measured, and the
 * two ways to feed it (import from X, or paste).
 */

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError, useProfileStore, useVoiceStore, WORKSPACE_CHANGED_EVENT } from '@/lib/forge/client';
import type { StoredFingerprint, VoiceSampleRow } from '@/lib/forge/data/voice';
import { Button, Card, Field, Meter, Segmented, Spinner, Tag, cn, inputClass, relativeTime } from '../ui';
import { XGlyph } from '../icons';

interface VoiceResponse {
  fingerprint: StoredFingerprint | null;
  samples: VoiceSampleRow[];
  bannedPhrases: string[];
  minSamples: number;
  xAvailable: boolean;
}

type PastePlatform = 'linkedin' | 'x' | 'threads' | 'bluesky' | 'newsletter' | 'other';

/** Past this many samples, more mostly confirms what is already measured. */
const SATURATION = 40;

export function VoicePanel() {
  const [data, setData] = useState<VoiceResponse | null>(null);
  const [showSamples, setShowSamples] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<VoiceResponse>('/api/voice'));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not load your voice.');
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(WORKSPACE_CHANGED_EVENT, load);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, load);
  }, [load]);

  const onAdded = (fingerprint: StoredFingerprint) => {
    useVoiceStore.getState().set(fingerprint);
    void load();
  };

  if (!data) {
    return (
      <div className="flex items-center gap-2 py-16 text-[13.5px] text-white/45">
        <Spinner /> Loading your voice
      </div>
    );
  }

  const count = data.fingerprint?.sample_count ?? data.samples.length;
  const ready = count >= data.minSamples;

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-[17px] font-semibold text-white">Voice Fingerprint</h3>
            <p className="mt-1 max-w-[520px] text-[14px] leading-relaxed text-white/55">
              Measured from your own posts: sentence length, line breaks, punctuation, how you open. Every draft is scored against it as you edit, and lines
              that drift are marked.
            </p>
          </div>
          <Tag tone={ready ? 'good' : 'steel'} dot>
            {ready ? 'Scoring drafts' : `${data.minSamples - count} more ${data.minSamples - count === 1 ? 'post' : 'posts'} to start`}
          </Tag>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-baseline justify-between text-[12.5px] text-white/45">
            <span>
              {count} {count === 1 ? 'sample' : 'samples'}
            </span>
            <span>{count >= SATURATION ? 'Well measured' : `Sharper up to ${SATURATION}`}</span>
          </div>
          <Meter value={Math.min(count, SATURATION)} max={SATURATION} label="Samples collected" />
        </div>

        {data.fingerprint && data.fingerprint.traits.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-white/35">What it measured</h4>
            <div className="flex flex-wrap gap-2">
              {data.fingerprint.traits.map((trait) => (
                <Tag key={trait}>{trait}</Tag>
              ))}
            </div>
            {data.fingerprint.profile.signatureWords.length > 0 && (
              <p className="mt-4 text-[13px] text-white/50">
                Words you reach for: <span className="text-white/80">{data.fingerprint.profile.signatureWords.slice(0, 10).join(', ')}</span>
              </p>
            )}
          </div>
        )}

        {data.bannedPhrases.length > 0 && (
          <p className="mt-4 text-[13px] text-white/50">
            Never writes: <span className="text-white/80">{data.bannedPhrases.slice(0, 12).join(', ')}</span>
          </p>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {data.xAvailable && <XImportCard onAdded={onAdded} />}
        <PasteCard onAdded={onAdded} />
      </div>

      {data.samples.length > 0 && (
        <Card className="p-6">
          <button type="button" onClick={() => setShowSamples(!showSamples)} className="flex w-full items-center justify-between text-left">
            <span className="text-[15px] font-semibold text-white">Samples</span>
            <span className="text-[13px] text-white/45">{showSamples ? 'Hide' : `Show ${data.samples.length}`}</span>
          </button>
          {showSamples && (
            <ul className="mt-4 flex flex-col divide-y divide-white/[0.05]">
              {data.samples.map((sample) => (
                <SampleRow key={sample.id} sample={sample} onRemoved={load} />
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function XImportCard({ onAdded }: { onAdded: (fingerprint: StoredFingerprint) => void }) {
  const { profile, load } = useProfileStore();
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (profile?.x_handle && !handle) setHandle(profile.x_handle);
  }, [profile?.x_handle, handle]);

  const run = async () => {
    setBusy(true);
    try {
      const result = await api<{ fingerprint: StoredFingerprint; added: number }>('/api/voice', {
        method: 'POST',
        json: { source: 'x_import', handle: handle.trim() || undefined },
      });
      onAdded(result.fingerprint);
      void useProfileStore.getState().load(true);
      toast.success(result.added > 0 ? `Read ${result.added} of your posts.` : 'No new posts to add.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not import from X.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col p-6">
      <div className="flex items-center gap-2">
        <XGlyph className="h-4 w-4 text-white" />
        <h3 className="text-[15px] font-semibold text-white">Import from X</h3>
      </div>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/55">Reads your recent public posts. Replies and reposts are skipped.</p>
      <div className="mt-4 flex gap-2">
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="@handle"
          aria-label="X handle"
          className={cn(inputClass, 'h-10 flex-1 rounded-full py-0')}
          onKeyDown={(e) => e.key === 'Enter' && !busy && run()}
        />
        <Button variant="primary" size="md" loading={busy} onClick={run} disabled={!handle.trim()}>
          Import
        </Button>
      </div>
    </Card>
  );
}

function PasteCard({ onAdded }: { onAdded: (fingerprint: StoredFingerprint) => void }) {
  const [text, setText] = useState('');
  const [platform, setPlatform] = useState<PastePlatform>('linkedin');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const result = await api<{ fingerprint: StoredFingerprint; added: number }>('/api/voice', {
        method: 'POST',
        json: { source: 'paste', text, platform },
      });
      onAdded(result.fingerprint);
      setText('');
      toast.success(result.added === 1 ? 'Added 1 post.' : `Added ${result.added} posts.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not add those posts.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col p-6">
      <h3 className="text-[15px] font-semibold text-white">Paste posts</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/55">
        Posts you wrote yourself, from any platform. Separate them with a line of three dashes.
      </p>
      <Segmented
        className="mt-4 self-start"
        label="Where these posts are from"
        value={platform}
        onChange={setPlatform}
        options={[
          { value: 'linkedin', label: 'LinkedIn' },
          { value: 'x', label: 'X' },
          { value: 'threads', label: 'Threads' },
          { value: 'other', label: 'Other' },
        ]}
      />
      <Field label="Posts" htmlFor="voice-paste">
        <textarea
          id="voice-paste"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={'First post\n---\nSecond post'}
          className={cn(inputClass, 'mt-3 resize-y')}
        />
      </Field>
      <div className="mt-3 flex justify-end">
        <Button variant="primary" size="md" loading={busy} onClick={run} disabled={text.trim().length < 20}>
          Add to voice
        </Button>
      </div>
    </Card>
  );
}

function SampleRow({ sample, onRemoved }: { sample: VoiceSampleRow; onRemoved: () => void }) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      const { fingerprint } = await api<{ fingerprint: StoredFingerprint | null }>(`/api/voice/samples/${sample.id}`, { method: 'DELETE' });
      useVoiceStore.getState().set(fingerprint);
      onRemoved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not remove that sample.');
      setBusy(false);
    }
  };
  return (
    <li className="flex items-start gap-4 py-3.5">
      <p className="line-clamp-3 min-w-0 flex-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-white/75">{sample.body}</p>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-[11.5px] text-white/35">
          {sample.source === 'x_import' ? 'X' : sample.platform} · {relativeTime(sample.posted_at ?? sample.created_at)}
        </span>
        <button type="button" onClick={remove} disabled={busy} className="text-[12px] text-white/45 hover:text-forge-bad disabled:opacity-50">
          Remove
        </button>
      </div>
    </li>
  );
}
