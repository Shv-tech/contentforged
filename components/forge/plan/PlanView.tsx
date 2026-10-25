'use client';

/**
 * This week: the drafts Forge planned, each slotted into one of the
 * brand's best times, with how it is likely to do. The person approves or
 * skips each one; nothing is scheduled without that.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api, onBrandChange, useActiveBrand, useConnectionsStore } from '@/lib/forge/client';
import { draftText } from '@/lib/forge/draft-text';
import { describeHitRate } from '@/lib/forge/prediction-format';
import type { DraftRecord } from '@/lib/forge/types';
import { PlatformLabel } from '@/components/forge/icons';
import { PredictionChip } from '@/components/forge/drafts/PredictionChip';
import { UpsellCard } from '@/components/forge/views/UpsellCard';
import { ViewShell } from '@/components/forge/views/ViewShell';
import { Button, Card, EmptyState, LoadingRow, Segmented, Tag, cn } from '@/components/forge/ui';
import { PlanSettingsDialog } from './PlanSettingsDialog';
import { SwipeDeck } from './SwipeDeck';
import { WEEKDAYS, slotLabel, type PlanResponse } from './planTypes';
import { useReview } from './useReview';

type Mode = 'swipe' | 'list';

export function PlanView() {
  const brand = useActiveBrand();
  const [data, setData] = useState<PlanResponse | null>(null);
  const [locked, setLocked] = useState(false);
  const [mode, setMode] = useState<Mode>('list');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [planning, setPlanning] = useState(false);
  const { connections, load: loadConnections } = useConnectionsStore();

  const load = useCallback(async () => {
    try {
      const response = await api<PlanResponse>('/api/plan');
      setData(response);
      setLocked(false);
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) setLocked(true);
      else toast.error(error instanceof ApiError ? error.message : 'Could not load this week.');
    }
  }, []);

  useEffect(() => {
    void load();
    void loadConnections();
    if (window.matchMedia('(max-width: 767px)').matches) setMode('swipe');
    return onBrandChange(() => {
      setData(null);
      void load();
    });
  }, [load, loadConnections]);

  const setDrafts = useCallback((update: (drafts: DraftRecord[]) => DraftRecord[]) => setData((current) => (current ? { ...current, drafts: update(current.drafts) } : current)), []);
  const review = useReview(setDrafts);
  const connected = useMemo(() => new Set<string>(connections.map((c) => c.platform)), [connections]);

  async function planNow() {
    setPlanning(true);
    try {
      const result = await api<{ created: number; note: string | null }>('/api/plan', { method: 'POST' });
      if (result.created > 0) toast.success(`${result.created} ${result.created === 1 ? 'draft' : 'drafts'} planned.`);
      else toast(result.note ?? 'Nothing new to plan this week.');
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not plan the week.');
    } finally {
      setPlanning(false);
    }
  }

  if (locked) {
    return (
      <ViewShell title="This week">
        <UpsellCard feature="weekly_plan" body="Every Monday, Forge writes your week from your own stories and ideas, slots each post into your best times, and asks you to approve or skip." />
      </ViewShell>
    );
  }

  const drafts = data?.drafts ?? [];
  const pending = drafts.filter((d) => !d.review_status || d.review_status === 'pending');
  const hit = data ? describeHitRate(data.hitRate) : null;
  const nextLabel = data
    ? new Date(data.nextPlanAt).toLocaleString(undefined, { timeZone: data.timezone, weekday: 'long', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <ViewShell
      title="This week"
      subtitle={
        data?.settings.enabled
          ? `Forge plans ${data.settings.weekly_goal} ${data.settings.weekly_goal === 1 ? 'post' : 'posts'} every ${WEEKDAYS[data.settings.delivery_weekday]}. Approve what you want posted; skip the rest.`
          : 'Approve what you want posted; skip the rest.'
      }
      width="wide"
      actions={
        data && (
          <>
            <Button variant="quiet" onClick={() => setSettingsOpen(true)}>
              Settings
            </Button>
            {brand.canEdit && (
              <Button variant="secondary" onClick={planNow} loading={planning}>
                {drafts.length > 0 ? 'Top up the week' : 'Plan my week now'}
              </Button>
            )}
          </>
        )
      }
    >
      {!data ? (
        <LoadingRow label="Loading this week" />
      ) : (
        <div className="flex flex-col gap-6">
          {data.paused && (
            <Card className="flex flex-col gap-2 border-forge-warn/25 bg-forge-warn/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[14px] leading-relaxed text-white/80">Plans are paused because the last two went unreviewed. Plan this week by hand and they start again.</p>
            </Card>
          )}

          {drafts.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone={pending.length === 0 ? 'good' : 'ember'} dot>
                  {pending.length === 0 ? 'All reviewed' : `${pending.length} to review`}
                </Tag>
                {hit && <span className="text-[12.5px] text-white/40">{hit}.</span>}
              </div>
              <Segmented<Mode>
                label="View"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'swipe', label: 'Review one by one' },
                  { value: 'list', label: 'All at once' },
                ]}
              />
            </div>
          )}

          {drafts.length === 0 ? (
            <EmptyState
              plate="ingot"
              title={data.plan?.status === 'generating' ? 'Writing your week' : 'Nothing planned yet'}
              body={
                data.plan?.status === 'generating'
                  ? 'Forge is drafting from your ideas and stories. This takes a minute.'
                  : data.settings.enabled
                    ? `Your next plan arrives ${nextLabel}. Capture a few stories before then and it will be better for it.`
                    : 'Turn the weekly plan on in Settings, or plan this week now.'
              }
              action={
                brand.canEdit && (
                  <Button variant="primary" onClick={planNow} loading={planning}>
                    Plan my week now
                  </Button>
                )
              }
            />
          ) : mode === 'swipe' && brand.canEdit ? (
            <SwipeDeck drafts={drafts} predictions={data.predictions} timezone={data.timezone} connected={connected} onReview={review} />
          ) : (
            <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {drafts.map((draft) => (
                <PlanCard key={draft.id} draft={draft} data={data} canEdit={brand.canEdit} connected={connected.has(draft.platform)} onReview={review} />
              ))}
            </ul>
          )}
        </div>
      )}

      {data && (
        <PlanSettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={data.settings}
          maxGoal={data.maxGoal}
          timezone={data.timezone}
          onSaved={(settings) => setData((current) => (current ? { ...current, settings } : current))}
        />
      )}
    </ViewShell>
  );
}

function PlanCard({
  draft,
  data,
  canEdit,
  connected,
  onReview,
}: {
  draft: DraftRecord;
  data: PlanResponse;
  canEdit: boolean;
  connected: boolean;
  onReview: ReturnType<typeof useReview>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const status = draft.review_status ?? 'pending';
  const slot = slotLabel(status === 'approved' ? (draft.scheduled_for ?? draft.suggested_for) : draft.suggested_for, data.timezone);
  const text = draftText(draft);

  const act = async (action: 'approve' | 'skip' | 'undo') => {
    setBusy(action);
    await onReview(draft, action, action === 'approve' ? { autoPublish: connected && draft.platform !== 'x' } : {});
    setBusy(null);
  };

  return (
    <li
      className={cn(
        'flex flex-col rounded-[22px] border bg-forge-card transition-colors',
        status === 'approved' ? 'border-forge-good/25' : status === 'skipped' ? 'border-white/[0.04] opacity-55' : 'border-white/[0.08]'
      )}
    >
      <header className="flex flex-wrap items-center gap-2 px-5 pt-5">
        <span className="flex items-center gap-2 text-[13.5px] font-semibold text-white">
          <PlatformLabel platform={draft.platform} />
        </span>
        {slot && <span className="text-[12.5px] text-white/45">{slot}</span>}
        <span className="ml-auto flex flex-wrap gap-1.5">
          {draft.experiment_arm && <Tag tone="steel">Experiment {draft.experiment_arm.toUpperCase()}</Tag>}
          <PredictionChip prediction={data.predictions[draft.id]} />
        </span>
      </header>
      <p className="line-clamp-[7] whitespace-pre-wrap px-5 pt-4 text-[14.5px] leading-relaxed text-white/80">{text}</p>
      <footer className="mt-auto flex flex-wrap items-center gap-2 px-5 pb-5 pt-5">
        {status === 'pending' ? (
          canEdit && (
            <>
              <Button variant="primary" size="sm" loading={busy === 'approve'} disabled={busy !== null} onClick={() => act('approve')}>
                Approve
              </Button>
              <Button variant="quiet" size="sm" loading={busy === 'skip'} disabled={busy !== null} onClick={() => act('skip')}>
                Skip
              </Button>
            </>
          )
        ) : (
          <>
            <Tag tone={status === 'approved' ? 'good' : 'neutral'} dot>
              {status === 'approved' ? (draft.auto_publish ? 'Publishes itself' : 'Scheduled with a reminder') : 'Skipped'}
            </Tag>
            {canEdit && (
              <Button variant="quiet" size="xs" loading={busy === 'undo'} onClick={() => act('undo')}>
                Undo
              </Button>
            )}
          </>
        )}
        <Link href={`/drafts/${draft.id}`} className="ml-auto text-[13px] font-medium text-white/55 underline-offset-4 hover:text-white hover:underline">
          Open in studio
        </Link>
      </footer>
    </li>
  );
}
