'use client';

/**
 * Repurposing with lineage: one long piece (a newsletter, a talk, a
 * podcast transcript) becomes a set of posts across platforms, and every
 * post remembers where it came from. The list below shows each source with
 * how many posts it made and how many went live.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api, useDraftStore } from '@/lib/forge/client';
import { PLATFORM_NAMES, type DraftKind, type DraftPlatform, type DraftRecord } from '@/lib/forge/types';
import { PlatformMultiPicker } from '@/components/forge/drafts/PlatformPicker';
import { PlatformGlyph } from '@/components/forge/icons';
import { UpsellCard } from '@/components/forge/views/UpsellCard';
import { Button, Dialog, Field, LoadingRow, Segmented, Tag, inputClass, relativeTime, textareaClass } from '@/components/forge/ui';

type SourceKind = 'newsletter' | 'podcast' | 'video' | 'article' | 'post' | 'notes';

const KINDS: ReadonlyArray<{ value: SourceKind; label: string }> = [
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'article', label: 'Article' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'video', label: 'Talk or video' },
  { value: 'notes', label: 'Notes' },
];

interface SourceRow {
  id: string;
  kind: SourceKind;
  title: string;
  url: string | null;
  created_at: string;
  drafts: { total: number; posted: number };
}

interface RepurposeResult {
  sourceId: string;
  drafts: DraftRecord[];
  skipped: number;
}

/** Formats that suit each platform when the material is long. */
const LONG_KIND: Partial<Record<DraftPlatform, DraftKind>> = { x: 'thread', instagram: 'carousel' };

export function RepurposePanel({ readOnly }: { readOnly: boolean }) {
  const [sources, setSources] = useState<SourceRow[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setSources((await api<{ sources: SourceRow[] }>('/api/repurpose')).sources);
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) setLocked(true);
      setSources([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (locked) return <UpsellCard feature="repurpose" body="Turn a newsletter, talk or podcast into a week of posts across platforms, each one tracing back to the passage it came from." />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-[22px] border border-white/[0.07] bg-gradient-to-br from-forge-ember/[0.08] via-transparent to-transparent p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-[520px]">
          <h3 className="text-[16px] font-semibold text-white">One long piece, a week of posts</h3>
          <p className="mt-1 text-[13.5px] leading-relaxed text-white/55">Paste a newsletter or transcript, or give Forge a link. Each post is written from one passage, in your voice, and keeps a link back to it.</p>
        </div>
        {!readOnly && (
          <Button variant="ember" size="md" onClick={() => setOpen(true)}>
            Repurpose something
          </Button>
        )}
      </div>

      {sources === null ? (
        <LoadingRow label="Loading sources" />
      ) : sources.length > 0 ? (
        <ul className="flex flex-col divide-y divide-white/[0.05] overflow-hidden rounded-[20px] border border-white/[0.07] bg-forge-card">
          {sources.map((source) => (
            <li key={source.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-medium text-white">{source.title}</p>
                <p className="mt-0.5 text-[12.5px] text-white/40">
                  {KINDS.find((k) => k.value === source.kind)?.label ?? 'Source'} · {relativeTime(source.created_at)}
                  {source.url && (
                    <>
                      {' · '}
                      <a href={source.url} target="_blank" rel="noreferrer noopener" className="underline-offset-4 hover:text-white/70 hover:underline">
                        {safeHost(source.url)}
                      </a>
                    </>
                  )}
                </p>
              </div>
              <Tag tone={source.drafts.posted > 0 ? 'good' : 'neutral'}>
                {source.drafts.total} {source.drafts.total === 1 ? 'post' : 'posts'}
                {source.drafts.posted > 0 ? `, ${source.drafts.posted} live` : ''}
              </Tag>
            </li>
          ))}
        </ul>
      ) : null}

      <RepurposeDialog open={open} onClose={() => setOpen(false)} onDone={load} />
    </div>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function RepurposeDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<SourceKind>('newsletter');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [body, setBody] = useState('');
  const [platforms, setPlatforms] = useState<DraftPlatform[]>(['linkedin', 'x']);
  const [count, setCount] = useState(6);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RepurposeResult | null>(null);
  const upsert = useDraftStore((s) => s.upsert);

  const reset = () => {
    setResult(null);
    setTitle('');
    setUrl('');
    setBody('');
  };

  async function run() {
    setBusy(true);
    try {
      const response = await api<RepurposeResult>('/api/repurpose', {
        method: 'POST',
        json: {
          kind,
          title: title.trim() || 'Untitled',
          url: url.trim() || null,
          body: body.trim() || null,
          targets: platforms.map((platform) => ({ platform, kind: body.length > 4000 || url ? (LONG_KIND[platform] ?? 'post') : 'post' })),
          ideas: count,
        },
      });
      response.drafts.forEach(upsert);
      setResult(response);
      onDone();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not repurpose it.');
    } finally {
      setBusy(false);
    }
  }

  const ready = (body.trim().length >= 300 || /^https?:\/\//.test(url.trim())) && platforms.length > 0;

  return (
    <Dialog
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      title={result ? 'Your posts are ready' : 'Repurpose'}
      className="max-w-[640px]"
      footer={
        result ? (
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              reset();
            }}
          >
            Done
          </Button>
        ) : (
          <>
            <Button variant="quiet" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="ember" onClick={run} loading={busy} disabled={!ready}>
              {busy ? 'Writing posts' : `Write ${count} posts`}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-3">
          <p className="text-[13.5px] text-white/55">
            {result.drafts.length} {result.drafts.length === 1 ? 'draft' : 'drafts'} written
            {result.skipped > 0 ? `, ${result.skipped} skipped` : ''}. Each one links back to the passage it came from.
          </p>
          <ul className="flex flex-col gap-2">
            {result.drafts.map((draft) => (
              <li key={draft.id}>
                <Link href={`/drafts/${draft.id}`} className="flex items-center gap-3 rounded-[14px] bg-white/[0.03] px-4 py-3 transition-colors hover:bg-white/[0.06]">
                  <PlatformGlyph platform={draft.platform} className="h-4 w-4 shrink-0 text-white/60" />
                  <span className="min-w-0 flex-1 truncate text-[14px] text-white/85">{draft.title ?? draft.body.split('\n')[0]}</span>
                  <span className="text-[12px] text-white/35">{PLATFORM_NAMES[draft.platform]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <Segmented<SourceKind> label="What it is" value={kind} onChange={setKind} options={KINDS} className="self-start" />
          <Field label="Title" htmlFor="rp-title">
            <input id="rp-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} maxLength={200} placeholder="Issue 42: why we stopped discounting" />
          </Field>
          <Field label="Link" htmlFor="rp-url" hint="Forge reads the page. Or paste the text below instead.">
            <input id="rp-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} placeholder="https://" spellCheck={false} />
          </Field>
          <Field label="Or paste it" htmlFor="rp-body" hint={body ? `${body.trim().split(/\s+/).length} words` : 'At least a few paragraphs.'}>
            <textarea id="rp-body" value={body} onChange={(e) => setBody(e.target.value)} rows={7} className={textareaClass} maxLength={200_000} />
          </Field>
          <Field label="Platforms">
            <PlatformMultiPicker value={platforms} onChange={setPlatforms} />
          </Field>
          <Field label={`How many posts: ${count}`} htmlFor="rp-count">
            <input id="rp-count" type="range" min={1} max={12} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full accent-[#FF8A2B]" />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
