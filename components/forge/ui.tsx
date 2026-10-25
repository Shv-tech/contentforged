'use client';

/**
 * components/forge/ui.tsx
 *
 * The app's primitives. Same visual language as the landing page: pure black,
 * Instrument Sans, pill buttons, small tags, forged-metal plates. Every
 * product surface is assembled from these, so a change to how a button looks
 * happens once.
 */

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black';

// ============================================================================
// BUTTONS
// ============================================================================

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'ember' | 'danger';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-white text-black hover:bg-white/85 disabled:bg-white/40',
  secondary: 'border border-white/[0.12] text-white hover:bg-white/[0.06] hover:border-white/20 disabled:text-white/40',
  quiet: 'text-white/65 hover:text-white hover:bg-white/[0.05] disabled:text-white/30',
  ember: 'bg-gradient-to-b from-forge-gold to-forge-ember2 text-black hover:brightness-110 disabled:opacity-50',
  danger: 'border border-forge-bad/30 text-forge-bad hover:bg-forge-bad/10 disabled:opacity-50',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-[12px] gap-1.5',
  sm: 'h-8 px-3.5 text-[13px] gap-1.5',
  md: 'h-10 px-5 text-[14px] gap-2',
  lg: 'h-12 px-7 text-[16px] gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'sm', loading = false, icon, className, children, disabled, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-medium transition-colors disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        focusRing,
        className
      )}
      {...rest}
    >
      {loading ? <Spinner className="h-3.5 w-3.5" /> : icon}
      {children}
    </button>
  );
});

export const IconButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md' }>(
  function IconButton({ label, size = 'sm', className, children, type = 'button', ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/[0.07] hover:text-white disabled:opacity-40',
          size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
          focusRing,
          className
        )}
        {...rest}
      >
        {children}
      </button>
    );
  }
);

// ============================================================================
// SMALL PIECES
// ============================================================================

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Tag({
  children,
  tone = 'neutral',
  dot = false,
  className,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'ember' | 'good' | 'warn' | 'bad' | 'steel';
  dot?: boolean;
  className?: string;
}) {
  const tones = {
    neutral: 'bg-white/[0.06] text-white/70',
    ember: 'bg-forge-ember/15 text-forge-gold',
    good: 'bg-forge-good/12 text-forge-good',
    warn: 'bg-forge-warn/12 text-forge-warn',
    bad: 'bg-forge-bad/12 text-forge-bad',
    steel: 'bg-forge-steel/12 text-forge-steel',
  } as const;
  const dots = {
    neutral: 'bg-white/50',
    ember: 'bg-forge-ember',
    good: 'bg-forge-good',
    warn: 'bg-forge-warn',
    bad: 'bg-forge-bad',
    steel: 'bg-forge-steel',
  } as const;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium leading-none', tones[tone], className)}>
      {dot && <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', dots[tone])} />}
      {children}
    </span>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-white/15 bg-white/[0.04] px-1.5 font-sans text-[11px] text-white/60',
        className
      )}
    >
      {children}
    </kbd>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-white/[0.07]', className)} />;
}

// ============================================================================
// ART
// ============================================================================

export type PlateName = 'molten' | 'steel' | 'quench' | 'sparks' | 'ingot' | 'slag';

/**
 * A forged-material image plate. Hot plates (molten, sparks, ingot) mark
 * things that are ready; cold plates (steel, quench, slag) mark things that
 * are not yet, or are empty.
 */
export function Plate({
  name,
  className,
  children,
  position = '50% 50%',
  priority = false,
  dim = 0.35,
}: {
  name: PlateName;
  className?: string;
  children?: React.ReactNode;
  position?: string;
  priority?: boolean;
  /** 0 to 1: how much the bottom fades to black so text over it stays legible. */
  dim?: number;
}) {
  return (
    <div className={cn('relative overflow-hidden bg-[#0A0605]', className)}>
      <Image
        src={`/assets/art/${name}.jpg`}
        alt=""
        fill
        sizes="(max-width: 768px) 100vw, 50vw"
        priority={priority}
        className="object-cover"
        style={{ objectPosition: position }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: `linear-gradient(to top, rgba(0,0,0,${dim + 0.2}), rgba(0,0,0,0) 60%, rgba(0,0,0,${dim * 0.3}))` }}
      />
      {children}
    </div>
  );
}

// ============================================================================
// METERS
// ============================================================================

export function Meter({
  value,
  max = 100,
  tone = 'ember',
  className,
  label,
}: {
  value: number;
  max?: number;
  tone?: 'ember' | 'good' | 'warn' | 'bad' | 'neutral';
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fills = {
    ember: 'bg-gradient-to-r from-forge-ember2 to-forge-gold',
    good: 'bg-forge-good',
    warn: 'bg-forge-warn',
    bad: 'bg-forge-bad',
    neutral: 'bg-white/60',
  } as const;
  return (
    <div
      className={cn('h-1 w-full overflow-hidden rounded-full bg-white/[0.08]', className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', fills[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ============================================================================
// LAYOUT
// ============================================================================

export function PaneHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-[620px] text-[15px] leading-relaxed text-white/55">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className, as: Tag = 'div' }: { children: React.ReactNode; className?: string; as?: 'div' | 'section' | 'article' | 'li' }) {
  return <Tag className={cn('rounded-[22px] border border-white/[0.07] bg-forge-card', className)}>{children}</Tag>;
}

export function EmptyState({
  plate = 'slag',
  title,
  body,
  action,
  className,
}: {
  plate?: PlateName;
  title: string;
  body: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Plate name={plate} className={cn('flex min-h-[260px] flex-col justify-end rounded-[26px] p-7 sm:p-9', className)} dim={0.55}>
      <div className="relative max-w-[460px]">
        <h3 className="text-[22px] font-semibold tracking-[-0.02em] text-white">{title}</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-white/75">{body}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </Plate>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  className?: string;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex shrink-0 rounded-full border border-white/[0.08] bg-white/[0.03] p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-7 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium transition-colors',
            value === option.value ? 'bg-white text-black' : 'text-white/60 hover:text-white',
            focusRing
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-10 shrink-0 rounded-full transition-colors', checked ? 'bg-forge-ember' : 'bg-white/15', focusRing)}
    >
      <span className={cn('absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-white/80">
        {label}
      </label>
      {children}
      {hint && <p className="text-[12.5px] leading-relaxed text-white/45">{hint}</p>}
    </div>
  );
}

export const inputClass =
  'w-full rounded-[14px] border border-white/[0.09] bg-white/[0.03] px-4 py-3 text-[16px] text-white placeholder:text-white/30 transition-colors focus:border-white/25 focus:bg-white/[0.05] focus:outline-none md:text-[14px]';

// ============================================================================
// OVERLAYS
// ============================================================================

/** Closes on outside pointer-down and on Escape. */
export function useDismiss(open: boolean, onClose: () => void, refs: Array<React.RefObject<HTMLElement>>) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (refs.some((ref) => ref.current?.contains(event.target as Node))) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, refs]);
}

export function Popover({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  className,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger: (props: { open: boolean; toggle: () => void; id: string }) => React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  align?: 'start' | 'end';
  side?: 'top' | 'bottom';
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = useCallback(
    (next: boolean) => {
      if (onOpenChange) onOpenChange(next);
      else setUncontrolled(next);
    },
    [onOpenChange]
  );
  const wrapper = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), [setOpen]);
  useDismiss(open, close, [wrapper]);

  return (
    <div ref={wrapper} className="relative inline-flex">
      {trigger({ open, toggle: () => setOpen(!open), id })}
      {open && (
        <div
          id={id}
          role="dialog"
          className={cn(
            'absolute z-50 min-w-[220px] rounded-[18px] border border-white/[0.09] bg-[#121212] p-2 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.95)]',
            side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2',
            align === 'start' ? 'left-0' : 'right-0',
            className
          )}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'flex max-h-[90dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[26px] border border-white/[0.09] bg-[#0F0F0F] outline-none sm:rounded-[26px]',
          className
        )}
      >
        <div className="flex items-center justify-between gap-4 px-6 pb-2 pt-5">
          <h2 id={titleId} className="text-[18px] font-semibold tracking-[-0.01em] text-white">
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-2">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// FORMATTING
// ============================================================================

export function compactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (Math.abs(minutes) < 1) return 'just now';
  if (Math.abs(minutes) < 60) return minutes > 0 ? `${minutes}m ago` : `in ${-minutes}m`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return hours > 0 ? `${hours}h ago` : `in ${-hours}h`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return days > 0 ? `${days}d ago` : `in ${-days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ============================================================================
// MORE LAYOUT
// ============================================================================

/** A titled block inside a view: heading, one line of context, optional actions. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-white">{title}</h2>
          {description && <p className="mt-1 max-w-[640px] text-[13.5px] leading-relaxed text-white/50">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** One number with what it means. Used in rows of two to four. */
export function StatTile({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="rounded-[18px] border border-white/[0.07] bg-forge-card p-4 sm:p-5">
      <p className="text-[12px] font-medium text-white/45">{label}</p>
      <p
        className={cn(
          'mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums',
          tone === 'good' ? 'text-forge-good' : tone === 'warn' ? 'text-forge-warn' : tone === 'bad' ? 'text-forge-bad' : 'text-white'
        )}
      >
        {value}
      </p>
      {note && <p className="mt-2 text-[12px] leading-snug text-white/40">{note}</p>}
    </div>
  );
}

/** Placeholder bars while something loads, so the layout does not jump. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-[14px] bg-white/[0.05]', className)} />;
}

export function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-12 text-[13.5px] text-white/45" role="status">
      <Spinner /> {label}
    </div>
  );
}

/** Initials in a warm disc. Deterministic tint per name so people are told apart at a glance. */
export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md'; className?: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?';
  const tints = ['from-forge-gold to-forge-ember2', 'from-forge-steel to-[#5D6B7A]', 'from-forge-good to-[#3E9C6A]', 'from-[#E9A3C9] to-[#A35C86]', 'from-[#B9A4F5] to-[#6D5BB8]'];
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-black',
        tints[hash % tints.length],
        size === 'sm' ? 'h-6 w-6 text-[10.5px]' : 'h-8 w-8 text-[12.5px]',
        className
      )}
    >
      {initials}
    </span>
  );
}

export const textareaClass =
  'w-full resize-none rounded-[14px] border border-white/[0.09] bg-white/[0.03] px-4 py-3 text-[16px] leading-relaxed text-white placeholder:text-white/30 transition-colors focus:border-white/25 focus:bg-white/[0.05] focus:outline-none md:text-[14px]';

/** Copies text and reports the result; returns whether it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return '0:00';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
