'use client';

/**
 * Weekly experiments: one variable at a time (openings, length, endings,
 * time of day, format), alternated across the weekly plan's drafts until
 * each arm has enough posts, then judged with a permutation test on the
 * author's own results. A result says "too early" until it is not.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api, onBrandChange, useActiveBrand } from '@/lib/forge/client';
import type { ExperimentRecord, ExperimentTemplate } from '@/lib/forge/experiments';
import { PLATFORM_NAMES, type DraftRecord } from '@/lib/forge/types';
import { draftText } from '@/lib/forge/draft-text';
import { UpsellCard } from '@/components/forge/views/UpsellCard';
import { Button, Card, Dialog, Field, LoadingRow, Tag, cn, relativeTime } from '@/components/forge/ui';

interface ExperimentsResponse {
  running: ExperimentRecord | null;
  drafts: DraftRecord[];
  past: ExperimentRecord[];
  suggestion: ExperimentTemplate;
  templates: ExperimentTemplate[];
}

const VERDICT: Record<NonNullable<ExperimentRecord['result']>['verdict'], { label: string; tone: 'good' | 'neutral' | 'warn' | 'steel' }> = {
  too_early: { label: 'Too early to tell', tone: 'steel' },
  a_better: { label: 'A did better', tone: 'good' },
  b_better: { label: 'B did better', tone: 'good' },
  no_difference: { label: 'No real difference', tone: 'neutral' },
};

export function ExperimentsPanel() {
  const brand = useActiveBrand();
  const [data, setData] = useState<ExperimentsResponse | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<ExperimentsResponse>('/api/experiments'));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not load experiments.');
    }
  }, []);

  useEffect(() => {
    void load();
    return onBrandChange(load);
  }, [load]);

  async function start(template: ExperimentTemplate, target: number) {
    setBusy('start');
    try {
      await api('/api/experiments', { method: 'POST', json: { variable: template.variable, targetPerArm: target } });
      toast.success('Started. The next weekly plans alternate the two versions.');
      setChoosing(false);
      void load();
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) {
        setChoosing(false);
        setLocked(true);
      } else toast.error(error instanceof ApiError ? error.message : 'Could not start it.');
    } finally {
      setBusy(null);
    }
  }

  async function act(experiment: ExperimentRecord, action: 'stop' | 'evaluate') {
    setBusy(action);
    try {
      if (action === 'stop') await api(`/api/experiments/${experiment.id}`, { method: 'PATCH', json: { status: 'stopped' } });
      else await api(`/api/experiments/${experiment.id}`, { method: 'POST' });
      void load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not do that.');
    } finally {
      setBusy(null);
    }
  }

  if (locked) return <UpsellCard feature="experiments" body="Test one thing at a time, such as question openings or shorter posts, across your weekly plan, and get an honest answer from your own results." />;
  if (!data) return <LoadingRow label="Loading experiments" />;

  const running = data.running;

  return (
    <div className="flex flex-col gap-6">
      {running ? (
        <Card className="overflow-hidden">
          <div className="border-b border-white/[0.06] bg-gradient-to-r from-forge-ember/[0.09] to-transparent p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone="ember" dot>
                Running
              </Tag>
              <span className="text-[12.5px] text-white/40">started {relativeTime(running.started_at)}</span>
            </div>
            <h3 className="mt-3 text-[19px] font-semibold tracking-[-0.02em] text-white">
              {running.arm_a} <span className="text-white/35">or</span> {running.arm_b}
            </h3>
            {running.hypothesis && <p className="mt-1.5 max-w-[640px] text-[13.5px] leading-relaxed text-white/55">{running.hypothesis}</p>}
          </div>

          <div className="grid gap-px bg-white/[0.06] md:grid-cols-2">
            {(['a', 'b'] as const).map((arm) => {
              const label = arm === 'a' ? running.arm_a : running.arm_b;
              const drafts = data.drafts.filter((d) => d.experiment_arm === arm);
              const posted = drafts.filter((d) => d.status === 'posted').length;
              const stats = arm === 'a' ? running.result?.armA : running.result?.armB;
              return (
                <div key={arm} className="bg-forge-card p-6">
                  <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-white/35">Version {arm.toUpperCase()}</p>
                  <p className="mt-1 text-[15px] font-medium text-white">{label}</p>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-[28px] font-semibold tabular-nums tracking-[-0.03em] text-white">{posted}</span>
                    <span className="text-[13px] text-white/40">of {running.target_per_arm} posted</span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                    <div className="h-full rounded-full bg-gradient-to-r from-forge-ember2 to-forge-gold" style={{ width: `${Math.min(100, (posted / running.target_per_arm) * 100)}%` }} />
                  </div>
                  {stats && stats.n > 0 && <p className="mt-3 text-[12.5px] text-white/50">Median {stats.median.toFixed(2)}x your usual</p>}
                  {drafts.length > 0 && (
                    <ul className="mt-4 flex flex-col gap-1">
                      {drafts.slice(0, 4).map((draft) => (
                        <li key={draft.id}>
                          <Link href={`/drafts/${draft.id}`} className="flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-[12.5px] text-white/60 hover:bg-white/[0.04] hover:text-white">
                            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', draft.status === 'posted' ? 'bg-forge-good' : 'bg-white/25')} />
                            <span className="truncate">{draftText(draft).split('\n')[0]}</span>
                            <span className="ml-auto shrink-0 text-white/30">{PLATFORM_NAMES[draft.platform]}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 p-5">
            {running.result && (
              <>
                <Tag tone={VERDICT[running.result.verdict].tone}>{VERDICT[running.result.verdict].label}</Tag>
                <p className="text-[13px] text-white/55">{running.result.summary}</p>
              </>
            )}
            {brand.canEdit && (
              <div className="ml-auto flex gap-2">
                <Button variant="quiet" size="sm" loading={busy === 'evaluate'} onClick={() => act(running, 'evaluate')}>
                  Check now
                </Button>
                <Button variant="quiet" size="sm" loading={busy === 'stop'} onClick={() => act(running, 'stop')}>
                  Stop
                </Button>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-[560px]">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-forge-gold/80">Worth testing next</p>
            <h3 className="mt-1.5 text-[18px] font-semibold tracking-[-0.02em] text-white">{data.suggestion.title}</h3>
            <p className="mt-1 text-[13.5px] leading-relaxed text-white/55">{data.suggestion.hypothesis}</p>
          </div>
          {brand.canEdit && (
            <div className="flex shrink-0 gap-2">
              <Button variant="ember" loading={busy === 'start'} onClick={() => start(data.suggestion, 4)}>
                Start this
              </Button>
              <Button variant="quiet" onClick={() => setChoosing(true)}>
                Choose another
              </Button>
            </div>
          )}
        </Card>
      )}

      {data.past.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-white/35">Finished</h3>
          <ul className="flex flex-col divide-y divide-white/[0.05] overflow-hidden rounded-[20px] border border-white/[0.07] bg-forge-card">
            {data.past.map((experiment) => (
              <li key={experiment.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-white">
                    {experiment.arm_a} or {experiment.arm_b}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-white/45">{experiment.result?.summary ?? (experiment.status === 'stopped' ? 'Stopped before a result.' : 'No result recorded.')}</p>
                </div>
                {experiment.result && <Tag tone={VERDICT[experiment.result.verdict].tone}>{VERDICT[experiment.result.verdict].label}</Tag>}
                <span className="shrink-0 text-[12px] text-white/30">{relativeTime(experiment.completed_at ?? experiment.started_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[12.5px] leading-relaxed text-white/35">
        Each version needs at least three posted results before Forge will call it, and a difference counts only when a permutation test on your own numbers says it is unlikely to be chance.
      </p>

      <ChooseDialog open={choosing} templates={data.templates} busy={busy === 'start'} onClose={() => setChoosing(false)} onStart={start} />
    </div>
  );
}

function ChooseDialog({ open, templates, busy, onClose, onStart }: { open: boolean; templates: ExperimentTemplate[]; busy: boolean; onClose: () => void; onStart: (template: ExperimentTemplate, target: number) => void }) {
  const [chosen, setChosen] = useState<ExperimentTemplate | null>(null);
  const [target, setTarget] = useState(4);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Choose an experiment"
      className="max-w-[620px]"
      footer={
        <>
          <Button variant="quiet" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="ember" disabled={!chosen} loading={busy} onClick={() => chosen && onStart(chosen, target)}>
            Start
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col gap-2">
          {templates.map((template) => (
            <li key={template.variable}>
              <button
                type="button"
                onClick={() => setChosen(template)}
                aria-pressed={chosen?.variable === template.variable}
                className={cn('w-full rounded-[16px] border p-4 text-left transition-colors', chosen?.variable === template.variable ? 'border-white/30 bg-white/[0.05]' : 'border-white/[0.07] hover:border-white/15')}
              >
                <p className="text-[14.5px] font-medium text-white">{template.title}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-white/50">{template.hypothesis}</p>
                <p className="mt-2 text-[12px] text-white/40">
                  A: {template.a.label} · B: {template.b.label}
                </p>
              </button>
            </li>
          ))}
        </ul>
        <Field label={`Posts for each version: ${target}`} htmlFor="experiment-target" hint="More posts take longer and give a firmer answer.">
          <input id="experiment-target" type="range" min={3} max={10} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="w-full accent-[#FF8A2B]" />
        </Field>
      </div>
    </Dialog>
  );
}
