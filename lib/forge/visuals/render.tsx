/**
 * lib/forge/visuals/render.tsx
 *
 * Renders slides to PNG with Satori (through next/og), using the brand kit's
 * typeface and colours, and binds them into a PDF for LinkedIn documents.
 *
 * Typefaces are bundled TTFs under public/fonts/visuals: Instrument Sans
 * (static instances of the variable font, SIL Open Font License) and the
 * unmodified DejaVu Serif and DejaVu Sans Mono (Bitstream Vera licence). See
 * LICENSES.md there. Satori does not shape complex scripts and the bundled
 * faces are Latin, so slides render Latin text: Hinglish, Tenglish and the
 * other mixes in Roman script render correctly, other scripts do not, and the
 * visual panel says so (renderableOnSlides in lib/forge/language.ts).
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { PDFDocument } from 'pdf-lib';
import type { BrandKit, KitFont } from '../data/brand-kit';
import type { VisualLayout } from '../types';

export const ASPECTS = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
} as const;

export type Aspect = keyof typeof ASPECTS;

const FONT_FILES: Record<KitFont, { family: string; medium: string; bold: string }> = {
  sans: { family: 'Instrument Sans', medium: 'InstrumentSans-Medium.ttf', bold: 'InstrumentSans-Bold.ttf' },
  serif: { family: 'DejaVu Serif', medium: 'DejaVuSerif.ttf', bold: 'DejaVuSerif-Bold.ttf' },
  mono: { family: 'DejaVu Sans Mono', medium: 'DejaVuSansMono.ttf', bold: 'DejaVuSansMono-Bold.ttf' },
};

const fontCache = new Map<string, ArrayBuffer>();

async function fontData(file: string): Promise<ArrayBuffer> {
  const cached = fontCache.get(file);
  if (cached) return cached;
  const buffer = await readFile(join(process.cwd(), 'public', 'fonts', 'visuals', file));
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  fontCache.set(file, data);
  return data;
}

async function fontsFor(font: KitFont) {
  const spec = FONT_FILES[font];
  const [medium, bold] = await Promise.all([fontData(spec.medium), fontData(spec.bold)]);
  return {
    family: spec.family,
    fonts: [
      { name: spec.family, data: medium, weight: 500 as const, style: 'normal' as const },
      { name: spec.family, data: bold, weight: 700 as const, style: 'normal' as const },
    ],
  };
}

/** Type size that keeps a slide's text inside the frame. */
function sizeFor(text: string, aspect: Aspect, emphasis: boolean): number {
  const n = text.length;
  const tall = aspect === 'portrait' ? 1.08 : 1;
  const base = n <= 60 ? 84 : n <= 120 ? 68 : n <= 190 ? 56 : n <= 260 ? 48 : 42;
  return Math.round(base * tall * (emphasis ? 1 : 0.92));
}

export interface SlideInput {
  text: string;
  index: number;
  total: number;
  layout: VisualLayout;
  aspect: Aspect;
  kit: BrandKit;
  /** Data URIs, already loaded. */
  headshot: string | null;
  logo: string | null;
}

function Slide({ input, family }: { input: SlideInput; family: string }) {
  const { kit, text, index, total, layout, aspect } = input;
  const emphasis = layout !== 'carousel' || index === 0;
  const size = sizeFor(text, aspect, emphasis);
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  const showCounter = total > 1;
  const showArrow = total > 1 && index < total - 1;
  const name = kit.display_name?.trim() || null;
  const handle = kit.handle?.trim() ? `@${kit.handle.trim().replace(/^@/, '')}` : null;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: kit.background,
        color: kit.ink,
        padding: '84px 88px',
        fontFamily: family,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', width: 64, height: 7, borderRadius: 7, background: kit.accent }} />
        {kit.logo_path && input.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={input.logo} width={120} height={48} style={{ objectFit: 'contain' }} alt="" />
        ) : showCounter ? (
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 500, opacity: 0.5 }}>{`${index + 1}/${total}`}</div>
        ) : (
          <div style={{ display: 'flex' }} />
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, paddingTop: 24, paddingBottom: 24 }}>
        {layout === 'quote' && <div style={{ display: 'flex', fontSize: 180, lineHeight: 0.8, color: kit.accent, fontWeight: 700, marginBottom: 12 }}>{'“'}</div>}
        {layout === 'list' && index > 0 && (
          <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: kit.accent, marginBottom: 24 }}>{String(index).padStart(2, '0')}</div>
        )}
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              fontSize: size,
              lineHeight: 1.16,
              fontWeight: emphasis ? 700 : 500,
              letterSpacing: emphasis ? -1.5 : -0.5,
              marginTop: i === 0 ? 0 : Math.round(size * 0.45),
            }}
          >
            {line}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {input.headshot && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={input.headshot} width={72} height={72} style={{ borderRadius: 72, objectFit: 'cover', marginRight: 22 }} alt="" />
          )}
          {(name || handle) && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {name && <div style={{ display: 'flex', fontSize: 30, fontWeight: 700 }}>{name}</div>}
              {handle && <div style={{ display: 'flex', fontSize: 26, fontWeight: 500, opacity: 0.55, marginTop: 4 }}>{handle}</div>}
            </div>
          )}
        </div>
        {showArrow && (
          <div style={{ display: 'flex', width: 72, height: 72, borderRadius: 72, background: kit.accent, alignItems: 'center', justifyContent: 'center' }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={kit.background} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

export async function renderSlidePng(input: SlideInput): Promise<Uint8Array> {
  const { family, fonts } = await fontsFor(input.kit.font);
  const { width, height } = ASPECTS[input.aspect];
  const response = new ImageResponse(<Slide input={input} family={family} />, { width, height, fonts });
  return new Uint8Array(await response.arrayBuffer());
}

/** All slides as one PDF, one page per slide, at the slide's own size. */
export async function renderPdf(inputs: SlideInput[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setProducer('Forge');
  pdf.setCreator('Forge');
  for (const input of inputs) {
    const png = await pdf.embedPng(await renderSlidePng(input));
    const { width, height } = ASPECTS[input.aspect];
    // 1080 px at 144 dpi: a 7.5 inch page, crisp on screen and in print.
    const page = pdf.addPage([width / 2, height / 2]);
    page.drawImage(png, { x: 0, y: 0, width: width / 2, height: height / 2 });
  }
  return pdf.save();
}
