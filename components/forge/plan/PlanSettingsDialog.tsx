'use client';

/**
 * How the weekly plan works for this brand: on or off, how many drafts,
 * which platforms, and when it arrives.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api } from '@/lib/forge/client';
import type { DraftPlatform } from '@/lib/forge/types';
import { PlatformMultiPicker } from '@/components/forge/drafts/PlatformPicker';
import { Button, Dialog, Field, Toggle, cn, focusRing } from '@/components/forge/ui';
import { WEEKDAYS, type PlanSettings } from './planTypes';

export function PlanSettingsDialog({
  open,
  onClose,
  settings,
  maxGoal,
  timezone,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  settings: PlanSettings;
  maxGoal: number;
  timezone: string;
  onSaved: (settings: PlanSettings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const set = <K extends keyof PlanSettings>(key: K, value: PlanSettings[K]) => setDraft((current) => ({ ...current, [key]: value }));

  async function save() {
    setBusy(true);
    try {
      const { settings: saved } = await api<{ settings: PlanSettings }>('/api/plan', { method: 'PATCH', json: draft });
      onSaved(saved);
      onClose();
      toast.success('Saved.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save the plan settings.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Weekly plan"
      footer={
        <>
          <Button variant="quiet" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={draft.platforms.length === 0}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block text-[14px] font-medium text-white">Plan my week</span>
            <span className="mt-1 block text-[13px] leading-relaxed text-white/50">Each week Forge writes drafts from your ideas and stories, slots them into your best times, and asks you to review them.</span>
          </span>
          <Toggle checked={draft.enabled} onChange={(value) => set('enabled', value)} label="Plan my week" />
        </label>

        <div className={cn('flex flex-col gap-6', !draft.enabled && 'pointer-events-none opacity-40')}>
          <Field label="Drafts a week" hint={maxGoal < 14 ? `Your plan includes up to ${maxGoal}.` : undefined}>
            <div className="flex items-center gap-3">
              <Stepper value={draft.weekly_goal} min={1} max={maxGoal} onChange={(value) => set('weekly_goal', value)} />
              <span className="text-[13px] text-white/45">{draft.weekly_goal === 1 ? 'One post' : `${draft.weekly_goal} posts`} across the week</span>
            </div>
          </Field>

          <Field label="Platforms">
            <PlatformMultiPicker value={draft.platforms} onChange={(platforms: DraftPlatform[]) => set('platforms', platforms)} />
          </Field>

          <Field label="Arrives" hint={`In your time zone, ${timezone.replace(/_/g, ' ')}.`}>
            <div className="flex flex-wrap gap-2">
              <select value={draft.delivery_weekday} onChange={(e) => set('delivery_weekday', Number(e.target.value))} className="h-10 rounded-[12px] border border-white/[0.09] bg-white/[0.03] px-3 text-[14px] text-white focus:border-white/25 focus:outline-none" aria-label="Day">
                {WEEKDAYS.map((day, index) => (
                  <option key={day} value={index} className="bg-[#111]">
                    {day}
                  </option>
                ))}
              </select>
              <select value={draft.delivery_hour} onChange={(e) => set('delivery_hour', Number(e.target.value))} className="h-10 rounded-[12px] border border-white/[0.09] bg-white/[0.03] px-3 text-[14px] text-white focus:border-white/25 focus:outline-none" aria-label="Time">
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour} className="bg-[#111]">
                    {new Date(2026, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </option>
                ))}
              </select>
            </div>
          </Field>

          <p className="text-[12.5px] leading-relaxed text-white/40">
            You are told by email and on your phone when it is ready.{' '}
            <Link href="/account?tab=notifications" className="text-white/70 underline decoration-white/25 underline-offset-4 hover:text-white">
              Notification settings
            </Link>
          </p>
        </div>
      </div>
    </Dialog>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (value: number) => void }) {
  const button = cn('flex h-10 w-10 items-center justify-center text-[18px] text-white/70 transition-colors hover:text-white disabled:text-white/20', focusRing);
  return (
    <div className="inline-flex items-center rounded-full border border-white/[0.1]">
      <button type="button" className={cn(button, 'rounded-l-full')} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Fewer">
        −
      </button>
      <span className="w-8 text-center text-[15px] font-semibold tabular-nums text-white" aria-live="polite">
        {value}
      </span>
      <button type="button" className={cn(button, 'rounded-r-full')} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="More">
        +
      </button>
    </div>
  );
}
