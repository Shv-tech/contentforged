/**
 * components/forge/icons.tsx
 *
 * Platform glyphs, drawn small and monochrome so they sit beside text the way
 * system icons do. Used only to label which platform a draft is for.
 */

import { PLATFORM_NAMES, type DraftPlatform } from '@/lib/forge/types';

type IconProps = { className?: string };

export function XGlyph({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.75 3h3.07l-6.71 7.67L22 21h-6.18l-4.84-6.33L5.44 21H2.37l7.18-8.2L2 3h6.34l4.38 5.79L17.75 3Zm-1.08 16.17h1.7L7.4 4.74H5.58l11.09 14.43Z" />
    </svg>
  );
}

export function LinkedInGlyph({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.5 0h3.83v1.5h.05c.53-1 1.84-2.06 3.79-2.06 4.05 0 4.8 2.67 4.8 6.14v5.42h-4v-4.8c0-1.15-.02-2.62-1.6-2.62-1.6 0-1.84 1.25-1.84 2.54v4.88h-4v-11Z" />
    </svg>
  );
}

export function ThreadsGlyph({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
      <path d="M16.6 9.6c-.5-2.4-2.2-3.7-4.7-3.7-3.2 0-5.1 2.4-5.1 6.1 0 3.8 2 6.1 5.4 6.1 2.6 0 4.6-1.4 4.6-3.6 0-2.1-1.8-3.2-4.2-3.2-2 0-3.3.9-3.3 2.3 0 1.2 1 2 2.4 2 2.3 0 3.4-1.7 3.4-4.8" />
      <path d="M20.5 12c0 5.2-3.2 8.6-8.5 8.6S3.5 17.2 3.5 12 6.7 3.4 12 3.4c3.9 0 6.6 1.8 7.8 5" />
    </svg>
  );
}

export function BlueskyGlyph({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M6.33 4.1C8.6 5.8 11.05 9.27 12 11.23c.95-1.96 3.4-5.43 5.67-7.13 1.64-1.23 4.3-2.18 4.3.85 0 .6-.35 5.07-.55 5.8-.7 2.52-3.27 3.17-5.56 2.78 4 .68 5.02 2.94 2.82 5.2-4.18 4.29-6-1.08-6.47-2.45-.09-.25-.13-.37-.21-.27-.08-.1-.12.02-.21.27-.47 1.37-2.29 6.74-6.47 2.45-2.2-2.26-1.18-4.52 2.82-5.2-2.29.39-4.86-.26-5.56-2.78-.2-.73-.55-5.2-.55-5.8 0-3.03 2.66-2.08 4.3-.85Z" />
    </svg>
  );
}

export function InstagramGlyph({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="3.8" />
      <circle cx="17.3" cy="6.7" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function NewsletterGlyph({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

export function PlatformGlyph({ platform, className }: { platform: DraftPlatform; className?: string }) {
  switch (platform) {
    case 'x':
      return <XGlyph className={className} />;
    case 'linkedin':
      return <LinkedInGlyph className={className} />;
    case 'threads':
      return <ThreadsGlyph className={className} />;
    case 'bluesky':
      return <BlueskyGlyph className={className} />;
    case 'instagram':
      return <InstagramGlyph className={className} />;
    default:
      return <NewsletterGlyph className={className} />;
  }
}

/**
 * Glyph and name together. X's glyph is its name, so the word is kept for
 * screen readers only rather than printed twice.
 */
export function PlatformLabel({ platform, glyphClassName = 'h-4 w-4' }: { platform: DraftPlatform; glyphClassName?: string }) {
  return (
    <>
      <PlatformGlyph platform={platform} className={glyphClassName} />
      <span className={platform === 'x' ? 'sr-only' : undefined}>{PLATFORM_NAMES[platform]}</span>
    </>
  );
}

/** The Forge mark, from the brand asset. */
export function ForgeMark({ className }: IconProps) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logos/forge.svg" alt="" className={className} />;
}
