'use client';

/**
 * The brand kit for rendered visuals: the name and handle on every slide,
 * a headshot and logo, the typeface, and three colours. A live preview
 * shows the card as it will render.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase-browser';
import { ApiError, api, onBrandChange, useActiveBrand } from '@/lib/forge/client';
import type { BrandKit } from '@/lib/forge/data/brand-kit';
import { UpsellCard } from '@/components/forge/views/UpsellCard';
import { Button, Card, Field, LoadingRow, Segmented, cn, focusRing, inputClass } from '@/components/forge/ui';

type Kit = BrandKit & { headshotUrl: string | null; logoUrl: string | null };
type Palette = { name: string; background: string; ink: string; accent: string };

const FONT_PREVIEW: Record<BrandKit['font'], string> = {
  sans: 'var(--font-sans), system-ui, sans-serif',
  serif: 'Georgia, "DejaVu Serif", serif',
  mono: '"DejaVu Sans Mono", ui-monospace, monospace',
};

export function VisualKitPanel() {
  const brand = useActiveBrand();
  const [kit, setKit] = useState<Kit | null>(null);
  const [palettes, setPalettes] = useState<Palette[]>([]);
  const [draft, setDraft] = useState<Partial<BrandKit>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ kit: Kit; palettes: Palette[] }>('/api/brand-kit');
      setKit(data.kit);
      setPalettes(data.palettes);
      setDraft({});
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not load the brand kit.');
    }
  }, []);

  useEffect(() => {
    void load();
    return onBrandChange(load);
  }, [load]);

  async function save(patch: Partial<BrandKit>) {
    setBusy('save');
    try {
      const { kit: next } = await api<{ kit: Kit }>('/api/brand-kit', { method: 'PATCH', json: patch });
      setKit(next);
      setDraft({});
      toast.success('Saved. New visuals use it.');
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) setLocked(true);
      else toast.error(error instanceof ApiError ? error.message : 'Could not save the kit.');
    } finally {
      setBusy(null);
    }
  }

  async function upload(kind: 'headshot' | 'logo', file: File) {
    setBusy(kind);
    try {
      const { path, token } = await api<{ path: string; token: string }>('/api/brand-kit', { method: 'POST', json: { kind, contentType: file.type, size: file.size } });
      const { error } = await createClient().storage.from('brand-assets').uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (error) throw new ApiError(error.message, 502);
      await save(kind === 'headshot' ? { headshot_path: path } : { logo_path: path });
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) setLocked(true);
      else toast.error(error instanceof ApiError ? error.message : 'Could not upload the image.');
    } finally {
      setBusy(null);
    }
  }

  if (locked) return <UpsellCard feature="visuals" body="Quote cards, carousels and LinkedIn documents in your own colours, type, name and face, from any draft." />;
  if (!kit) return <LoadingRow label="Loading the brand kit" />;

  const view: Kit = { ...kit, ...draft } as Kit;
  const dirty = Object.keys(draft).length > 0;
  const readOnly = !brand.canEdit;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="flex flex-col gap-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name on visuals" htmlFor="kit-name">
            <input id="kit-name" value={view.display_name ?? ''} onChange={(e) => setDraft({ ...draft, display_name: e.target.value || null })} className={inputClass} maxLength={80} disabled={readOnly} placeholder={brand.name} />
          </Field>
          <Field label="Handle" htmlFor="kit-handle">
            <input id="kit-handle" value={view.handle ?? ''} onChange={(e) => setDraft({ ...draft, handle: e.target.value || null })} className={inputClass} maxLength={60} disabled={readOnly} placeholder="@you" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ImageField label="Headshot" url={view.headshotUrl} busy={busy === 'headshot'} disabled={readOnly} onFile={(file) => upload('headshot', file)} onRemove={() => save({ headshot_path: null })} round />
          <ImageField label="Logo" url={view.logoUrl} busy={busy === 'logo'} disabled={readOnly} onFile={(file) => upload('logo', file)} onRemove={() => save({ logo_path: null })} />
        </div>

        <Field label="Typeface">
          <Segmented<BrandKit['font']>
            label="Typeface"
            value={view.font}
            onChange={(font) => !readOnly && setDraft({ ...draft, font })}
            options={[
              { value: 'sans', label: 'Sans' },
              { value: 'serif', label: 'Serif' },
              { value: 'mono', label: 'Mono' },
            ]}
            className="self-start"
          />
        </Field>

        <Field label="Colours">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {palettes.map((palette) => (
                <button
                  key={palette.name}
                  type="button"
                  disabled={readOnly}
                  onClick={() => setDraft({ ...draft, background: palette.background, ink: palette.ink, accent: palette.accent })}
                  className={cn('flex items-center gap-2 rounded-full border border-white/[0.1] py-1 pl-1 pr-3 text-[12.5px] text-white/70 hover:border-white/25 hover:text-white', focusRing)}
                >
                  <span className="flex h-6 w-6 overflow-hidden rounded-full" aria-hidden>
                    <span className="w-1/2" style={{ background: palette.background }} />
                    <span className="w-1/2" style={{ background: palette.accent }} />
                  </span>
                  {palette.name}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(['background', 'ink', 'accent'] as const).map((key) => (
                <label key={key} className="flex flex-col gap-1.5">
                  <span className="text-[12px] capitalize text-white/50">{key === 'ink' ? 'Text' : key}</span>
                  <span className="flex items-center gap-2 rounded-[12px] border border-white/[0.09] bg-white/[0.03] p-1.5 pr-3">
                    <input type="color" value={view[key]} disabled={readOnly} onChange={(e) => setDraft({ ...draft, [key]: e.target.value.toUpperCase() })} className="h-7 w-7 cursor-pointer rounded-[8px] border-0 bg-transparent p-0" aria-label={key} />
                    <span className="font-mono text-[12px] text-white/70">{view[key]}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </Field>

        {!readOnly && (
          <div className="flex gap-2">
            <Button variant="primary" disabled={!dirty} loading={busy === 'save'} onClick={() => save(draft)}>
              Save kit
            </Button>
            {dirty && (
              <Button variant="quiet" onClick={() => setDraft({})}>
                Discard changes
              </Button>
            )}
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-2 lg:sticky lg:top-20 lg:self-start">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/35">Preview</p>
        <div className="flex aspect-square flex-col justify-between overflow-hidden rounded-[18px] p-7 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]" style={{ background: view.background, color: view.ink, fontFamily: FONT_PREVIEW[view.font] }}>
          <span className="h-1 w-10 rounded-full" style={{ background: view.accent }} />
          <p className="text-[22px] font-semibold leading-[1.25] tracking-[-0.01em]">The best feedback we got all year came from the customer who almost left.</p>
          <div className="flex items-center gap-3">
            {view.headshotUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL, not a static asset
              <img src={view.headshotUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <span className="h-9 w-9 rounded-full" style={{ background: view.accent, opacity: 0.85 }} />
            )}
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-semibold">{view.display_name || brand.name}</span>
              {view.handle && <span className="block truncate text-[12px] opacity-60">{view.handle}</span>}
            </span>
            {view.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL, not a static asset
              <img src={view.logoUrl} alt="" className="ml-auto h-7 max-w-[80px] object-contain" />
            )}
          </div>
        </div>
        <p className="text-[12px] leading-relaxed text-white/35">Open any draft in the studio and choose Visual to render it with this kit.</p>
      </div>
    </div>
  );
}

function ImageField({ label, url, busy, disabled, round = false, onFile, onRemove }: { label: string; url: string | null; busy: boolean; disabled: boolean; round?: boolean; onFile: (file: File) => void; onRemove: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-medium text-white/80">{label}</span>
      <div className="flex items-center gap-3">
        <span className={cn('flex h-14 w-14 items-center justify-center overflow-hidden bg-white/[0.05]', round ? 'rounded-full' : 'rounded-[14px]')}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL, not a static asset
            <img src={url} alt="" className={cn('h-full w-full', round ? 'object-cover' : 'object-contain p-1.5')} />
          ) : (
            <span className="text-[11px] text-white/30">None</span>
          )}
        </span>
        {!disabled && (
          <div className="flex flex-col items-start gap-1">
            <Button variant="secondary" size="xs" loading={busy} onClick={() => input.current?.click()}>
              {url ? 'Replace' : 'Upload'}
            </Button>
            {url && (
              <button type="button" onClick={onRemove} className="text-[12px] text-white/40 hover:text-forge-bad">
                Remove
              </button>
            )}
          </div>
        )}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onFile(file);
          }}
        />
      </div>
    </div>
  );
}
