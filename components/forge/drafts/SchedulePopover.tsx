'use client';

/**
 * Schedule a draft: three suggested slots (from the user's own results when
 * there are enough of them, otherwise labelled defaults) or any time they
 * choose. Creates the calendar event the reminder email is sent from.
 */

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api, useConnectionsStore, useDraftStore } from '@/lib/forge/client';
import type { DraftRecord } from '@/lib/forge/types';
import { Button, Popover, Spinner, Toggle, cn, inputClass } from '../ui';

interface Slot {
  at: string;
  label: string;
  basis: 'your_results' | 'default';
}

function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function SchedulePopover({ draft, trigger }: { draft: DraftRecord; trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode }) {
  const upsert = useDraftStore((s) => s.upsert);
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [custom, setCustom] = useState('');
  const [saving, setSaving] = useState(false);
  const connected = useConnectionsStore((s) => s.connections.some((c) => c.platform === draft.platform));
  const loadConnections = useConnectionsStore((s) => s.load);
  const canAutoPublish = connected && (draft.platform === 'linkedin' || draft.platform === 'threads' || draft.platform === 'bluesky');
  const [autoPublish, setAutoPublish] = useState(draft.auto_publish);

  useEffect(() => {
    if (open) void loadConnections();
  }, [open, loadConnections]);

  useEffect(() => {
    if (!open || slots) return;
    api<{ slots: Slot[] }>(`/api/drafts/${draft.id}/schedule`)
      .then((data) => setSlots(data.slots))
      .catch(() => setSlots([]));
  }, [open, slots, draft.id]);

  useEffect(() => {
    if (open && !custom) {
      const base = draft.scheduled_for ?? new Date(Date.now() + 2 * 3600_000).toISOString();
      setCustom(toLocalInputValue(base));
    }
  }, [open, custom, draft.scheduled_for]);

  const schedule = async (iso: string, close: () => void) => {
    setSaving(true);
    try {
      const { draft: updated } = await api<{ draft: DraftRecord }>(`/api/drafts/${draft.id}/schedule`, {
        method: 'POST',
        json: { at: iso, autoPublish: canAutoPublish && autoPublish },
      });
      upsert(updated);
      toast.success(`Scheduled for ${new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`);
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not schedule that.');
    } finally {
      setSaving(false);
    }
  };

  const unschedule = async (close: () => void) => {
    setSaving(true);
    try {
      const { draft: updated } = await api<{ draft: DraftRecord }>(`/api/drafts/${draft.id}/schedule`, { method: 'DELETE' });
      upsert(updated);
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not unschedule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen} side="top" className="w-[300px] p-3" trigger={({ open: isOpen, toggle }) => trigger({ open: isOpen, toggle })}>
      {(close) => (
        <div className="flex flex-col gap-3">
          <div className="px-1 pt-1">
            <div className="text-[13px] font-semibold text-white">Schedule</div>
            <div className="mt-0.5 text-[12px] text-white/45">
              {canAutoPublish && autoPublish ? 'Forge publishes it at that time.' : 'You get the full post by email at posting time.'}
            </div>
          </div>

          {canAutoPublish && (
            <label className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
              <span className="text-[13px] text-white/80">Publish automatically</span>
              <Toggle checked={autoPublish} onChange={setAutoPublish} label="Publish automatically" />
            </label>
          )}

          {draft.publish_error && (
            <p className="rounded-xl bg-forge-bad/10 px-3 py-2 text-[12.5px] leading-snug text-forge-bad">Last attempt failed: {draft.publish_error}</p>
          )}

          <div className="flex flex-col gap-1">
            {slots === null ? (
              <div className="flex items-center gap-2 px-2 py-3 text-[13px] text-white/50">
                <Spinner className="h-3.5 w-3.5" /> Finding good times
              </div>
            ) : slots.length === 0 ? null : (
              <>
                {slots.map((slot) => (
                  <button
                    key={slot.at}
                    type="button"
                    disabled={saving}
                    onClick={() => schedule(slot.at, close)}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-[14px] text-white transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                  >
                    <span>{slot.label}</span>
                    <span className={cn('text-[11px]', slot.basis === 'your_results' ? 'text-forge-gold' : 'text-white/35')}>
                      {slot.basis === 'your_results' ? 'From your results' : 'Default'}
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-white/[0.06] pt-3">
            <input
              type="datetime-local"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className={cn(inputClass, 'h-9 rounded-full px-3 py-0 text-[13px] [color-scheme:dark]')}
              aria-label="Custom time"
            />
            <Button variant="primary" size="sm" loading={saving} disabled={!custom} onClick={() => custom && schedule(new Date(custom).toISOString(), close)}>
              Set
            </Button>
          </div>

          {draft.status === 'scheduled' && (
            <button type="button" onClick={() => unschedule(close)} className="px-1 text-left text-[12.5px] text-white/50 hover:text-white">
              Remove from schedule
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}
