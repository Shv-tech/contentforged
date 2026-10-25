'use client';

/**
 * Choose where a post goes. Glyph chips rather than a select, because the
 * choice is small, visual and usually made with one tap.
 */

import { DRAFT_PLATFORMS, PLATFORM_NAMES, type DraftPlatform } from '@/lib/forge/types';
import { PlatformGlyph } from '@/components/forge/icons';
import { cn, focusRing } from '@/components/forge/ui';

export function PlatformPicker({
  value,
  onChange,
  options = DRAFT_PLATFORMS,
  label = 'Platform',
  size = 'md',
}: {
  value: DraftPlatform;
  onChange: (platform: DraftPlatform) => void;
  options?: readonly DraftPlatform[];
  label?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((platform) => {
        const active = platform === value;
        return (
          <button
            key={platform}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(platform)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors',
              size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[12.5px]',
              active ? 'border-white bg-white text-black' : 'border-white/[0.1] text-white/65 hover:border-white/25 hover:text-white',
              focusRing
            )}
          >
            <PlatformGlyph platform={platform} className="h-3.5 w-3.5" />
            {PLATFORM_NAMES[platform]}
          </button>
        );
      })}
    </div>
  );
}

/** A set of platforms, for choosing several at once. */
export function PlatformMultiPicker({
  value,
  onChange,
  options = DRAFT_PLATFORMS,
  label = 'Platforms',
}: {
  value: readonly DraftPlatform[];
  onChange: (platforms: DraftPlatform[]) => void;
  options?: readonly DraftPlatform[];
  label?: string;
}) {
  const toggle = (platform: DraftPlatform) =>
    onChange(value.includes(platform) ? value.filter((p) => p !== platform) : options.filter((p) => p === platform || value.includes(p)));
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((platform) => {
        const active = value.includes(platform);
        return (
          <button
            key={platform}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(platform)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors',
              active ? 'border-forge-ember/50 bg-forge-ember/15 text-forge-gold' : 'border-white/[0.1] text-white/60 hover:border-white/25 hover:text-white',
              focusRing
            )}
          >
            <PlatformGlyph platform={platform} className="h-3.5 w-3.5" />
            {PLATFORM_NAMES[platform]}
          </button>
        );
      })}
    </div>
  );
}
