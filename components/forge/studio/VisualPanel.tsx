'use client';

/**
 * Rendered visuals: the draft as a quote card, a statement image, a list or
 * a carousel, set in the brand's kit (name, headshot, typeface, colours).
 * Each slide downloads as a PNG; the set downloads as one PDF, which is
 * what LinkedIn takes as a document post.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api } from '@/lib/forge/client';
import { renderableOnSlides } from '@/lib/forge/language';
import type { DraftRecord, DraftVisual, VisualLayout } from '@/lib/forge/types';
import { MAX_SLIDES, VISUAL_LAYOUTS } from '@/lib/forge/visuals/layouts';
import { UpsellCard } from '@/components/forge/views/UpsellCard';
import { Button, LoadingRow, Segmented, Skeleton, cn, textareaClass } from '@/components/forge/ui';

export function VisualPanel({ draft, canEdit, onUpdated }: { draft: DraftRecord; canEdit: boolean; onUpdated: (draft: DraftRecord) => void }) {
  const [visual, setVisual] = useState<DraftVisual | null>(null);
  const [placeholders, setPlaceholders] = useState(false);
  const [locked, setLocked] = useState(false);
  const [slides, setSlides] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ visual: DraftVisual; placeholders: boolean }>(`/api/drafts/${draft.id}/visual?format=json`);
      setVisual(data.visual);
      setSlides(data.visual.slides);
      setPlaceholders(data.placeholders);
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) setLocked(true);
      else toast.error(error instanceof ApiError ? error.message : 'Could not load the visual.');
    }
  }, [draft.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(change: { layout?: VisualLayout; aspect?: DraftVisual['aspect']; slides?: string[] }) {
    if (!visual) return;
    setBusy(true);
    try {
      const layoutChanged = change.layout !== undefined && change.layout !== visual.layout;
      const response = await api<{ draft: DraftRecord; placeholders: boolean }>(`/api/drafts/${draft.id}/visual`, {
        method: 'POST',
        json: {
          layout: change.layout ?? visual.layout,
          aspect: change.aspect ?? visual.aspect,
          // A new layout derives fresh slides from the text; otherwise keep the edited ones.
          slides: layoutChanged ? undefined : (change.slides ?? visual.slides),
        },
      });
      onUpdated(response.draft);
      if (response.draft.visual) {
        setVisual(response.draft.visual);
        setSlides(response.draft.visual.slides);
      }
      setPlaceholders(response.placeholders);
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not update the visual.');
    } finally {
      setBusy(false);
    }
  }

  if (locked) return <UpsellCard feature="visuals" body="Turn any draft into a quote card, carousel or LinkedIn document in your brand's colours and type, ready to download." />;
  if (!visual) return <LoadingRow label="Rendering" />;

  const version = encodeURIComponent(visual.updatedAt);
  const src = (index: number, download = false) => `/api/drafts/${draft.id}/visual?slide=${index}&v=${version}${download ? '&download=1' : ''}`;
  const aspectClass = visual.aspect === 'portrait' ? 'aspect-[4/5]' : 'aspect-square';

  return (
    <div className="flex flex-col gap-5">
      {canEdit && (
        <div className="flex flex-col gap-3">
          <Segmented<VisualLayout> label="Layout" value={visual.layout} onChange={(layout) => save({ layout })} options={VISUAL_LAYOUTS.map(({ value, label }) => ({ value, label }))} />
          <p className="text-[12.5px] text-white/45">{VISUAL_LAYOUTS.find((l) => l.value === visual.layout)?.description}</p>
          <Segmented<DraftVisual['aspect']>
            label="Shape"
            value={visual.aspect}
            onChange={(aspect) => save({ aspect })}
            options={[
              { value: 'square', label: 'Square' },
              { value: 'portrait', label: 'Portrait 4:5' },
            ]}
            className="self-start"
          />
        </div>
      )}

      {!renderableOnSlides(visual.slides.join('\n')) && (
        <p className="rounded-[12px] bg-forge-warn/10 px-3 py-2 text-[12.5px] leading-relaxed text-forge-warn">
          Slides draw Latin script only for now, so letters in other scripts show as empty boxes. Edit the slide text into Roman script before downloading.
        </p>
      )}

      {placeholders && <p className="rounded-[12px] bg-forge-warn/10 px-3 py-2 text-[12.5px] text-forge-warn">A slide still has a [bracket]. Fill it in before downloading.</p>}

      {editing ? (
        <div className="flex flex-col gap-3">
          {slides.map((slide, index) => (
            <div key={index} className="flex gap-2">
              <span className="w-5 shrink-0 pt-3 text-[12px] tabular-nums text-white/35">{index + 1}</span>
              <textarea
                value={slide}
                onChange={(e) => setSlides(slides.map((s, i) => (i === index ? e.target.value : s)))}
                rows={3}
                maxLength={400}
                className={textareaClass}
                aria-label={`Slide ${index + 1}`}
              />
              {slides.length > 1 && (
                <button type="button" onClick={() => setSlides(slides.filter((_, i) => i !== index))} className="shrink-0 self-start pt-3 text-[12px] text-white/35 hover:text-forge-bad" aria-label={`Remove slide ${index + 1}`}>
                  Remove
                </button>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {slides.length < MAX_SLIDES && visual.layout !== 'quote' && visual.layout !== 'statement' && (
              <Button variant="quiet" size="xs" onClick={() => setSlides([...slides, ''])}>
                Add a slide
              </Button>
            )}
            <Button variant="primary" size="xs" loading={busy} disabled={slides.some((s) => !s.trim())} onClick={() => save({ slides: slides.map((s) => s.trim()) })}>
              Save slides
            </Button>
            <Button
              variant="quiet"
              size="xs"
              onClick={() => {
                setSlides(visual.slides);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className={cn('grid gap-3', visual.slides.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {visual.slides.map((_, index) => (
            <figure key={`${index}-${version}`} className="group relative overflow-hidden rounded-[14px] border border-white/[0.08] bg-black">
              <SlideImage src={src(index)} alt={`Slide ${index + 1}`} className={aspectClass} />
              <a href={src(index, true)} download className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus:opacity-100">
                PNG
              </a>
            </figure>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <a href={`/api/drafts/${draft.id}/visual?format=pdf&v=${version}`} download className="inline-flex h-8 items-center rounded-full bg-white px-3.5 text-[13px] font-medium text-black hover:bg-white/85">
          Download PDF
        </a>
        {canEdit && !editing && (
          <Button variant="quiet" size="sm" onClick={() => setEditing(true)}>
            Edit slide text
          </Button>
        )}
        <Link href="/dashboard?view=brand&tab=visuals" className="ml-auto text-[12.5px] text-white/45 hover:text-white">
          Brand kit
        </Link>
      </div>
    </div>
  );
}

/** A rendered slide, with a placeholder of the right shape while it draws. */
function SlideImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={cn('relative w-full', className)}>
      {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
      {/* eslint-disable-next-line @next/next/no-img-element -- rendered on demand by our own route, not a static asset */}
      <img src={src} alt={alt} loading="lazy" onLoad={() => setLoaded(true)} className={cn('h-full w-full object-cover transition-opacity', loaded ? 'opacity-100' : 'opacity-0')} />
    </div>
  );
}
