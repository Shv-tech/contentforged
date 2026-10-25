'use client';

/**
 * Results for a posted draft: the latest numbers, where they came from, and
 * a way to add them when the platform cannot be read automatically (type
 * them, or drop a screenshot of the analytics screen and confirm what Forge
 * read off it).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError } from '@/lib/forge/client';
import type { DraftRecord, PostMetrics } from '@/lib/forge/types';
import { Button, Dialog, Field, Spinner, cn, compactNumber, inputClass, relativeTime } from '../ui';

type Values = Pick<PostMetrics, 'impressions' | 'likes' | 'replies' | 'reposts' | 'bookmarks' | 'clicks'>;

const FIELDS: ReadonlyArray<{ key: keyof Values; label: string }> = [
  { key: 'impressions', label: 'Views' },
  { key: 'likes', label: 'Likes' },
  { key: 'replies', label: 'Replies' },
  { key: 'reposts', label: 'Reposts' },
  { key: 'bookmarks', label: 'Saves' },
  { key: 'clicks', label: 'Clicks' },
];

const CHECKPOINT_LABEL: Record<PostMetrics['checkpoint'], string> = {
  '1h': 'after 1 hour',
  '24h': 'after 24 hours',
  '7d': 'after 7 days',
  manual: 'added',
};

const PRIORITY: Record<PostMetrics['checkpoint'], number> = { '7d': 4, '24h': 3, manual: 2, '1h': 1 };

/** Platforms whose numbers Forge can pull on its own. */
function autoReadable(platform: DraftRecord['platform']): boolean {
  return platform === 'x' || platform === 'bluesky' || platform === 'threads' || platform === 'linkedin';
}

export function ResultsStrip({ draft }: { draft: DraftRecord }) {
  const [metrics, setMetrics] = useState<PostMetrics[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [entering, setEntering] = useState(false);

  const load = useCallback(async () => {
    try {
      setMetrics((await api<{ metrics: PostMetrics[] }>(`/api/drafts/${draft.id}/metrics`)).metrics);
    } catch {
      setMetrics([]);
    }
  }, [draft.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await api(`/api/drafts/${draft.id}/metrics`, { method: 'POST', json: { action: 'refresh' } });
      await load();
    } catch (error) {
      if (error instanceof ApiError && error.body.manual) setEntering(true);
      else toast.error(error instanceof ApiError ? error.message : 'Could not read the results.');
    } finally {
      setRefreshing(false);
    }
  };

  const latest = metrics && metrics.length > 0 ? [...metrics].sort((a, b) => PRIORITY[b.checkpoint] - PRIORITY[a.checkpoint])[0] : null;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/40">Results</span>
        <span className="flex gap-1">
          {autoReadable(draft.platform) && (
            <Button variant="quiet" size="xs" loading={refreshing} onClick={refresh}>
              Refresh
            </Button>
          )}
          <Button variant="quiet" size="xs" onClick={() => setEntering(true)}>
            Add numbers
          </Button>
        </span>
      </div>

      {metrics === null ? (
        <div className="mt-3 flex items-center gap-2 text-[12.5px] text-white/40">
          <Spinner className="h-3 w-3" /> Loading
        </div>
      ) : latest ? (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {FIELDS.map(({ key, label }) => (
              <div key={key}>
                <dt className="text-[11.5px] text-white/40">{label}</dt>
                <dd className="mt-0.5 text-[16px] font-semibold text-white tabular-nums">{latest[key] === null ? '–' : compactNumber(latest[key])}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[11.5px] text-white/35">
            {CHECKPOINT_LABEL[latest.checkpoint]}, {relativeTime(latest.captured_at)}
            {latest.source === 'screenshot' ? ', from a screenshot' : latest.source === 'manual' ? ', entered by hand' : ''}
          </p>
        </>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-white/50">
          {autoReadable(draft.platform) && draft.external_id
            ? 'Forge collects results at 1 hour, 24 hours and 7 days.'
            : 'Add the numbers when you have them. They teach Forge what works for you.'}
        </p>
      )}

      <ResultsDialog
        draft={draft}
        open={entering}
        onClose={() => setEntering(false)}
        onSaved={() => {
          setEntering(false);
          void load();
        }}
      />
    </div>
  );
}

function ResultsDialog({ draft, open, onClose, onSaved }: { draft: DraftRecord; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState<Record<keyof Values, string>>({ impressions: '', likes: '', replies: '', reposts: '', bookmarks: '', clicks: '' });
  const [source, setSource] = useState<'manual' | 'screenshot'>('manual');
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const readScreenshot = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('That image is over 5 MB.');
      return;
    }
    setReading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const { values: read } = await api<{ values: Partial<Record<keyof Values, number | null>> }>(`/api/drafts/${draft.id}/metrics`, {
        method: 'POST',
        json: { action: 'read_screenshot', image: { mediaType: file.type, base64 } },
      });
      setValues((prev) => {
        const next = { ...prev };
        for (const { key } of FIELDS) if (typeof read[key] === 'number') next[key] = String(read[key]);
        return next;
      });
      setSource('screenshot');
      toast.success('Read the screenshot. Check the numbers, then save.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not read that screenshot.');
    } finally {
      setReading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const parsed = Object.fromEntries(
        FIELDS.map(({ key }) => [key, values[key].trim() === '' ? null : Math.max(0, Math.round(Number(values[key].replace(/[,\s]/g, ''))))])
      );
      if (Object.values(parsed).some((v) => v !== null && !Number.isFinite(v))) {
        toast.error('Use whole numbers only.');
        return;
      }
      await api(`/api/drafts/${draft.id}/metrics`, {
        method: 'POST',
        json: { action: 'save', source, values: { ...parsed, quotes: null, followers_gained: null } },
      });
      toast.success('Saved. Your Playbook is updated.');
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add results"
      footer={
        <>
          <Button variant="quiet" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" loading={saving} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={reading}
          className={cn(
            'flex flex-col items-center justify-center gap-1.5 rounded-[18px] border border-dashed border-white/15 px-4 py-6 text-center transition-colors hover:border-white/30',
            reading && 'opacity-60'
          )}
        >
          {reading ? <Spinner /> : <span className="text-[14px] font-medium text-white">Drop in a screenshot</span>}
          <span className="text-[12.5px] text-white/45">
            {reading ? 'Reading the numbers' : 'Of the post analytics screen. Forge reads the numbers for you to check.'}
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readScreenshot(file);
            e.target.value = '';
          }}
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {FIELDS.map(({ key, label }) => (
            <Field key={key} label={label} htmlFor={`metric-${key}`}>
              <input
                id={`metric-${key}`}
                inputMode="numeric"
                value={values[key]}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                placeholder="–"
                className={cn(inputClass, 'tabular-nums')}
              />
            </Field>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
