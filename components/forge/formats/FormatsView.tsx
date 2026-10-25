'use client';

/**
 * Formats: the structures behind posts that worked, shared without anyone's
 * facts in them. Browse the gallery, use one (Forge writes a draft that
 * follows it with your own stories), or share the structure of one of your
 * own posts.
 *
 * Results are shown only once enough people who opted in to anonymous
 * insights have posted with a format that no one can be singled out.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api, onBrandChange, useActiveBrand, useDraftStore } from '@/lib/forge/client';
import { draftText } from '@/lib/forge/draft-text';
import type { FormatProposal, GalleryFormat } from '@/lib/forge/formats';
import { DRAFT_PLATFORMS, PLATFORM_NAMES, type DraftPlatform, type DraftRecord } from '@/lib/forge/types';
import type { FormatSlot } from '@/lib/forge/writer';
import { PlatformGlyph } from '@/components/forge/icons';
import { PlatformPicker } from '@/components/forge/drafts/PlatformPicker';
import { UpsellCard } from '@/components/forge/views/UpsellCard';
import { ViewShell } from '@/components/forge/views/ViewShell';
import { Button, Dialog, EmptyState, Field, LoadingRow, Segmented, Tag, Toggle, cn, focusRing, inputClass, relativeTime, textareaClass } from '@/components/forge/ui';

type Sort = 'popular' | 'proven' | 'new' | 'mine';

export function FormatsView() {
  const [sort, setSort] = useState<Sort>('popular');
  const [platform, setPlatform] = useState<DraftPlatform | 'all'>('all');
  const [search, setSearch] = useState('');
  const [formats, setFormats] = useState<GalleryFormat[] | null>(null);
  const [applying, setApplying] = useState<GalleryFormat | null>(null);
  const [sharing, setSharing] = useState(false);
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    setFormats(null);
    const params = new URLSearchParams({ sort });
    if (platform !== 'all') params.set('platform', platform);
    if (search.trim()) params.set('q', search.trim());
    try {
      setFormats((await api<{ formats: GalleryFormat[] }>(`/api/formats?${params}`)).formats);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not load formats.');
      setFormats([]);
    }
  }, [sort, platform, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  async function remove(format: GalleryFormat) {
    try {
      await api(`/api/formats/${format.id}`, { method: 'DELETE' });
      setFormats((current) => (current ?? []).filter((f) => f.id !== format.id));
      toast.success('Removed from the gallery.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not remove it.');
    }
  }

  if (locked) {
    return (
      <ViewShell title="Formats">
        <UpsellCard feature="formats" body="Structures from posts that worked, shared without anyone's facts. Use one and Forge fills it with your own stories." />
      </ViewShell>
    );
  }

  return (
    <ViewShell
      title="Formats"
      subtitle="The shape of a post that worked, with every fact taken out. Use one and Forge fills each part with your own stories, in your voice."
      width="wide"
      actions={
        <Button variant="secondary" onClick={() => setSharing(true)}>
          Share a format
        </Button>
      }
    >
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="overflow-x-auto pb-1">
          <Segmented<Sort>
            label="Sort"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'popular', label: 'Most used' },
              { value: 'proven', label: 'Proven' },
              { value: 'new', label: 'New' },
              { value: 'mine', label: 'Yours' },
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as DraftPlatform | 'all')}
            aria-label="Platform"
            className={cn('h-10 rounded-full border border-white/[0.09] bg-white/[0.03] px-4 text-[13.5px] text-white', focusRing)}
          >
            <option value="all" className="bg-[#111]">
              Every platform
            </option>
            {DRAFT_PLATFORMS.map((p) => (
              <option key={p} value={p} className="bg-[#111]">
                {PLATFORM_NAMES[p]}
              </option>
            ))}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search formats" className={cn(inputClass, 'h-10 w-[220px] rounded-full py-0')} aria-label="Search formats" />
        </div>
      </div>

      {sort === 'proven' && <p className="mb-5 text-[13px] leading-relaxed text-white/45">Formats with results from at least five people who share anonymous insights, best first. Each person counts once, however much they post.</p>}

      {formats === null ? (
        <LoadingRow label="Loading formats" />
      ) : formats.length === 0 ? (
        <EmptyState
          plate="ingot"
          title={sort === 'mine' ? 'You have not shared a format yet' : sort === 'proven' ? 'Nothing proven yet' : 'No formats here yet'}
          body={
            sort === 'mine'
              ? 'Pick one of your posts that did well. Forge pulls out its structure, removes every personal fact, and you decide whether to share it.'
              : sort === 'proven'
                ? 'Results appear once enough people have posted with a format. Try Most used in the meantime.'
                : 'Be the first: share the structure of a post that worked for you.'
          }
          action={
            <Button variant="primary" onClick={() => setSharing(true)}>
              Share a format
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {formats.map((format) => (
            <FormatCard key={format.id} format={format} onUse={() => setApplying(format)} onRemove={() => remove(format)} />
          ))}
        </ul>
      )}

      <ApplyDialog format={applying} onClose={() => setApplying(null)} onLocked={() => setLocked(true)} />
      <ShareDialog
        open={sharing}
        onClose={() => setSharing(false)}
        onShared={() => {
          setSort('mine');
          void load();
        }}
      />
    </ViewShell>
  );
}

function FormatCard({ format, onUse, onRemove }: { format: GalleryFormat; onUse: () => void; onRemove: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="flex flex-col rounded-[22px] border border-white/[0.07] bg-forge-card p-5 transition-colors hover:border-white/[0.13]">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[16px] font-semibold leading-snug tracking-[-0.01em] text-white">{format.title}</h3>
        {format.platform && <PlatformGlyph platform={format.platform} className="mt-1 h-4 w-4 shrink-0 text-white/45" />}
      </div>
      {format.summary && <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/50">{format.summary}</p>}

      <ol className="mt-4 flex flex-col gap-2">
        {format.structure.map((slot, index) => (
          <li key={index} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-forge-ember/15 text-[10.5px] font-semibold tabular-nums text-forge-gold">{index + 1}</span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-medium text-white/85">{slot.label}</span>
              <span className="block text-[12.5px] leading-relaxed text-white/45">{slot.guidance}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-white/40">
        {format.stats ? (
          <Tag tone={format.stats.median_relative >= 1.1 ? 'good' : 'neutral'}>
            {format.stats.median_relative.toFixed(1)}x usual across {format.stats.user_count} people
          </Tag>
        ) : null}
        <span>
          Used {format.use_count} {format.use_count === 1 ? 'time' : 'times'}
          {format.author_name ? ` · by ${format.mine ? 'you' : format.author_name}` : ''}
        </span>
        {format.visibility === 'unlisted' && <Tag>Unlisted</Tag>}
      </div>

      <div className="mt-5 flex items-center gap-2 pt-1">
        <Button variant="primary" size="sm" onClick={onUse}>
          Use this format
        </Button>
        {format.mine && (
          <Button variant={confirming ? 'danger' : 'quiet'} size="sm" className="ml-auto" onClick={() => (confirming ? onRemove() : setConfirming(true))}>
            {confirming ? 'Remove for good' : 'Remove'}
          </Button>
        )}
      </div>
    </li>
  );
}

function ApplyDialog({ format, onClose, onLocked }: { format: GalleryFormat | null; onClose: () => void; onLocked: () => void }) {
  const brand = useActiveBrand();
  const [angle, setAngle] = useState('');
  const [platform, setPlatform] = useState<DraftPlatform>('linkedin');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ draft: DraftRecord; missingFacts: string[] } | null>(null);
  const upsert = useDraftStore((s) => s.upsert);

  useEffect(() => {
    if (format) {
      setPlatform(format.platform ?? 'linkedin');
      setResult(null);
      setAngle('');
    }
  }, [format]);

  async function apply() {
    if (!format) return;
    setBusy(true);
    try {
      const response = await api<{ draft: DraftRecord; missingFacts: string[] }>(`/api/formats/${format.id}/apply`, { method: 'POST', json: { angle: angle.trim(), platform } });
      upsert(response.draft);
      setResult(response);
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) {
        onClose();
        onLocked();
      } else toast.error(error instanceof ApiError ? error.message : 'Could not write it.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={format !== null}
      onClose={onClose}
      title={result ? 'Your draft is ready' : (format?.title ?? '')}
      className="max-w-[620px]"
      footer={
        result ? (
          <>
            <Button variant="quiet" onClick={onClose}>
              Close
            </Button>
            <Link href={`/drafts/${result.draft.id}`} className="inline-flex h-8 items-center rounded-full bg-white px-3.5 text-[13px] font-medium text-black hover:bg-white/85">
              Open in studio
            </Link>
          </>
        ) : (
          <>
            <Button variant="quiet" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="ember" onClick={apply} loading={busy} disabled={angle.trim().length < 3 || !brand.canEdit}>
              Write it
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-3">
          <p className="max-h-[320px] overflow-y-auto whitespace-pre-wrap rounded-[16px] bg-white/[0.03] p-4 text-[14.5px] leading-relaxed text-white/85">{draftText(result.draft)}</p>
          {result.missingFacts.length > 0 && <p className="text-[12.5px] text-forge-warn">Fill in before posting: {result.missingFacts.join('; ')}.</p>}
        </div>
      ) : (
        format && (
          <div className="flex flex-col gap-5">
            <Field label="What is your post about?" htmlFor="format-angle" hint="Forge fills each part of the format from your Story Bank. Anything it cannot find is left as a [bracket] for you.">
              <textarea id="format-angle" value={angle} onChange={(e) => setAngle(e.target.value)} rows={3} className={textareaClass} autoFocus maxLength={1000} placeholder="Why we stopped offering discounts, and what happened to churn" />
            </Field>
            <Field label="Platform">
              <PlatformPicker value={platform} onChange={setPlatform} size="sm" />
            </Field>
            <SlotList slots={format.structure} />
          </div>
        )
      )}
    </Dialog>
  );
}

function SlotList({ slots }: { slots: FormatSlot[] }) {
  return (
    <ol className="flex flex-col gap-1.5 rounded-[16px] bg-white/[0.025] p-4">
      {slots.map((slot, index) => (
        <li key={index} className="text-[12.5px] leading-relaxed text-white/55">
          <span className="font-semibold text-white/75">
            {index + 1}. {slot.label}
          </span>{' '}
          {slot.guidance}
        </li>
      ))}
    </ol>
  );
}

/** Pick one of your posts, review the structure Forge pulls out of it, and publish. */
function ShareDialog({ open, onClose, onShared }: { open: boolean; onClose: () => void; onShared: () => void }) {
  const [step, setStep] = useState<'pick' | 'review'>('pick');
  const [drafts, setDrafts] = useState<DraftRecord[] | null>(null);
  const [source, setSource] = useState<DraftRecord | null>(null);
  const [proposal, setProposal] = useState<FormatProposal | null>(null);
  const [example, setExample] = useState('');
  const [includeExample, setIncludeExample] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'unlisted'>('public');
  const [busy, setBusy] = useState(false);

  const loadDrafts = useCallback(async () => {
    try {
      setDrafts((await api<{ drafts: DraftRecord[] }>('/api/drafts?view=library&status=posted')).drafts);
    } catch {
      setDrafts([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setStep('pick');
    setSource(null);
    setProposal(null);
    setIncludeExample(false);
    void loadDrafts();
    return onBrandChange(loadDrafts);
  }, [open, loadDrafts]);

  async function extract(draft: DraftRecord) {
    setSource(draft);
    setBusy(true);
    try {
      const data = await api<{ proposal: FormatProposal; example: string }>('/api/formats/extract', { method: 'POST', json: { draftId: draft.id } });
      setProposal(data.proposal);
      setExample(data.example);
      setStep('review');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not read the structure.');
      setSource(null);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!proposal || !source) return;
    setBusy(true);
    try {
      await api('/api/formats', {
        method: 'POST',
        json: {
          title: proposal.title,
          summary: proposal.summary || null,
          platform: proposal.platform,
          structure: proposal.structure,
          example: includeExample ? example : null,
          sourceDraftId: source.id,
          visibility,
        },
      });
      toast.success(visibility === 'public' ? 'Shared in the gallery.' : 'Saved. Only people with the link can find it.');
      onShared();
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not publish it.');
    } finally {
      setBusy(false);
    }
  }

  const setSlot = (index: number, patch: Partial<FormatSlot>) => setProposal((p) => (p ? { ...p, structure: p.structure.map((s, i) => (i === index ? { ...s, ...patch } : s)) } : p));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={step === 'pick' ? 'Share a format' : 'Review before sharing'}
      className="max-w-[680px]"
      footer={
        step === 'review' && proposal ? (
          <>
            <Button variant="quiet" onClick={() => setStep('pick')} disabled={busy}>
              Back
            </Button>
            <Button variant="primary" onClick={publish} loading={busy} disabled={proposal.title.trim().length < 3 || proposal.structure.length < 2 || proposal.structure.some((s) => !s.label.trim() || !s.guidance.trim())}>
              Share
            </Button>
          </>
        ) : undefined
      }
    >
      {step === 'pick' ? (
        <div className="flex flex-col gap-3">
          <p className="text-[13.5px] leading-relaxed text-white/55">Choose a post. Forge reads its structure and strips out every name, number and event, and you check the result before anything is shared.</p>
          {drafts === null ? (
            <LoadingRow label="Loading your posts" />
          ) : drafts.length === 0 ? (
            <p className="rounded-[14px] bg-white/[0.03] p-4 text-[13.5px] text-white/50">Formats come from posts you have published. Link a post to a draft first.</p>
          ) : (
            <ul className="flex max-h-[420px] flex-col gap-1.5 overflow-y-auto">
              {drafts.map((draft) => (
                <li key={draft.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => extract(draft)}
                    className={cn('flex w-full items-start gap-3 rounded-[14px] px-4 py-3 text-left transition-colors hover:bg-white/[0.05] disabled:opacity-60', source?.id === draft.id && 'bg-white/[0.05]', focusRing)}
                  >
                    <PlatformGlyph platform={draft.platform} className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[13.5px] leading-relaxed text-white/80">{draftText(draft)}</span>
                      <span className="mt-1 block text-[11.5px] text-white/35">Posted {relativeTime(draft.posted_at)}</span>
                    </span>
                    {busy && source?.id === draft.id && <span className="text-[12px] text-white/45">Reading</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        proposal && (
          <div className="flex flex-col gap-5">
            <Field label="Name" htmlFor="format-title">
              <input id="format-title" value={proposal.title} onChange={(e) => setProposal({ ...proposal, title: e.target.value })} maxLength={80} className={inputClass} />
            </Field>
            <Field label="When it fits" htmlFor="format-summary">
              <input id="format-summary" value={proposal.summary} onChange={(e) => setProposal({ ...proposal, summary: e.target.value })} maxLength={300} className={inputClass} />
            </Field>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-[13px] font-medium text-white/80">Parts</legend>
              {proposal.structure.map((slot, index) => (
                <div key={index} className="flex flex-col gap-2 rounded-[16px] border border-white/[0.07] p-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-[12px] font-semibold tabular-nums text-forge-gold">{index + 1}</span>
                    <input value={slot.label} onChange={(e) => setSlot(index, { label: e.target.value })} maxLength={60} className={cn(inputClass, 'h-9 py-0')} aria-label={`Part ${index + 1} name`} />
                    {proposal.structure.length > 2 && (
                      <button type="button" onClick={() => setProposal({ ...proposal, structure: proposal.structure.filter((_, i) => i !== index) })} className="text-[12px] text-white/40 hover:text-forge-bad">
                        Remove
                      </button>
                    )}
                  </div>
                  <textarea value={slot.guidance} onChange={(e) => setSlot(index, { guidance: e.target.value })} rows={2} maxLength={280} className={textareaClass} aria-label={`Part ${index + 1} guidance`} />
                </div>
              ))}
            </fieldset>
            <p className="rounded-[14px] bg-forge-warn/10 px-4 py-3 text-[12.5px] leading-relaxed text-forge-warn">Check that no part mentions a client, a number or anything else specific to you. Formats are public.</p>
            <label className="flex items-start justify-between gap-4">
              <span>
                <span className="block text-[14px] font-medium text-white">Include my post as the example</span>
                <span className="mt-0.5 block text-[12.5px] text-white/45">Off by default. Your post is shown word for word.</span>
              </span>
              <Toggle checked={includeExample} onChange={setIncludeExample} label="Include my post as the example" />
            </label>
            <label className="flex items-start justify-between gap-4">
              <span>
                <span className="block text-[14px] font-medium text-white">List it in the gallery</span>
                <span className="mt-0.5 block text-[12.5px] text-white/45">Off keeps it out of the gallery; you can still use it.</span>
              </span>
              <Toggle checked={visibility === 'public'} onChange={(value) => setVisibility(value ? 'public' : 'unlisted')} label="List it in the gallery" />
            </label>
          </div>
        )
      )}
    </Dialog>
  );
}
