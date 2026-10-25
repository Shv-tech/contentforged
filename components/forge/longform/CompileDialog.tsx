'use client';

/**
 * Long form from existing material: a guide, playbook or short book built
 * from the brand's own posts, stories and sources.
 *
 * Three steps, each visible: say what it is about (or pick the material),
 * review and edit the chapter plan, then watch it being written. Nothing
 * is invented to fill a chapter; gaps are left as [brackets].
 */

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api, readNdjson } from '@/lib/forge/client';
import type { BookKind, BookPlan, CompileEvent } from '@/lib/forge/longform';
import { UpsellCard } from '@/components/forge/views/UpsellCard';
import { Button, Dialog, Field, LoadingRow, Segmented, Spinner, Tag, cn, inputClass } from '@/components/forge/ui';

interface MaterialItem {
  ref: string;
  kind: 'post' | 'story' | 'source';
  title: string;
  preview: string;
  relative: number | null;
}

type Step = 'topic' | 'plan' | 'writing' | 'done';

const KIND_OPTIONS: ReadonlyArray<{ value: BookKind; label: string }> = [
  { value: 'guide', label: 'Guide' },
  { value: 'playbook', label: 'Playbook' },
  { value: 'book', label: 'Short book' },
];

const MATERIAL_LABEL: Record<MaterialItem['kind'], string> = { post: 'Post', story: 'Story', source: 'Source' };

export function CompileDialog({ open, onClose, onCompiled }: { open: boolean; onClose: () => void; onCompiled: (ebookId: string) => void }) {
  const [step, setStep] = useState<Step>('topic');
  const [topic, setTopic] = useState('');
  const [kind, setKind] = useState<BookKind>('guide');
  const [material, setMaterial] = useState<MaterialItem[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState(false);
  const [plan, setPlan] = useState<BookPlan | null>(null);
  const [planMaterial, setPlanMaterial] = useState<MaterialItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [chapters, setChapters] = useState<Array<{ title: string; words: number } | null>>([]);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('topic');
    setPlan(null);
    setChapters([]);
    setFailure(null);
  }, [open]);

  async function loadMaterial() {
    setPicking(true);
    setMaterial(null);
    try {
      const data = await api<{ material: MaterialItem[] }>(`/api/longform/material?topic=${encodeURIComponent(topic.trim())}`);
      setMaterial(data.material);
      setPicked(new Set(data.material.map((m) => m.ref)));
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) setLocked(true);
      else toast.error(error instanceof ApiError ? error.message : 'Could not gather your material.');
      setPicking(false);
    }
  }

  async function makePlan() {
    setBusy(true);
    try {
      const refs = picking && material ? Array.from(picked) : undefined;
      const data = await api<{ plan: BookPlan; material: MaterialItem[] }>('/api/longform/plan', { method: 'POST', json: { topic: topic.trim(), kind, refs } });
      setPlan(data.plan);
      setPlanMaterial(data.material);
      setStep('plan');
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) setLocked(true);
      else toast.error(error instanceof ApiError ? error.message : 'Could not plan it.');
    } finally {
      setBusy(false);
    }
  }

  async function write() {
    if (!plan) return;
    setStep('writing');
    setChapters(plan.chapters.map(() => null));
    setFailure(null);
    try {
      const response = await fetch('/api/longform/compile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan }) });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new ApiError(body.error ?? 'Could not start writing.', response.status, body as Record<string, unknown>);
      }
      let finished: string | null = null;
      await readNdjson<CompileEvent>(response, (event) => {
        if (event.type === 'chapter') setChapters((current) => current.map((c, i) => (i === event.index ? { title: event.title, words: event.words } : c)));
        if (event.type === 'error') setFailure(event.message);
        if (event.type === 'done') finished = event.ebookId;
      });
      if (finished) {
        setStep('done');
        onCompiled(finished);
      }
    } catch (error) {
      setFailure(error instanceof ApiError ? error.message : 'Writing stopped. Try again.');
    }
  }

  const byRef = useMemo(() => new Map(planMaterial.map((m) => [m.ref, m])), [planMaterial]);
  const written = chapters.filter(Boolean).length;

  const footer =
    step === 'topic' ? (
      <>
        <Button variant="quiet" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="ember" onClick={makePlan} loading={busy} disabled={picking && picked.size < 3}>
          Plan the chapters
        </Button>
      </>
    ) : step === 'plan' ? (
      <>
        <Button variant="quiet" onClick={() => setStep('topic')}>
          Back
        </Button>
        <Button variant="ember" onClick={write} disabled={!plan || plan.chapters.length === 0 || plan.chapters.some((c) => !c.title.trim())}>
          Write it
        </Button>
      </>
    ) : step === 'done' ? (
      <Button variant="primary" onClick={onClose}>
        Done
      </Button>
    ) : failure ? (
      <Button variant="secondary" onClick={write}>
        Try again
      </Button>
    ) : undefined;

  return (
    <Dialog
      open={open}
      onClose={step === 'writing' && !failure ? () => undefined : onClose}
      title={step === 'topic' ? 'Compile from your posts' : step === 'plan' ? 'The plan' : step === 'writing' ? (plan?.title ?? 'Writing') : 'Saved to your ebooks'}
      className="max-w-[680px]"
      footer={footer}
    >
      {locked ? (
        <UpsellCard feature="longform" body="Turn your best posts, stories and notes into a guide or short book, in your voice, with every chapter traced to the posts it came from." />
      ) : step === 'topic' ? (
        <div className="flex flex-col gap-5">
          <p className="text-[13.5px] leading-relaxed text-white/55">Your best posts on a subject already make the argument. Forge orders them into chapters, connects them and gives the reasoning the posts had no room for, using only what you have written and recorded.</p>
          <Field label="What is it about?" htmlFor="compile-topic" hint="Leave empty and Forge finds the strongest thread in your posts.">
            <input id="compile-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className={inputClass} placeholder="Pricing a service business" maxLength={200} autoFocus />
          </Field>
          <Field label="Shape">
            <Segmented<BookKind> label="Shape" value={kind} onChange={setKind} options={KIND_OPTIONS} className="self-start" />
          </Field>
          {!picking ? (
            <button type="button" onClick={loadMaterial} className="self-start text-[13px] text-white/55 underline decoration-white/25 underline-offset-4 hover:text-white">
              Choose the material yourself
            </button>
          ) : material === null ? (
            <LoadingRow label="Gathering your posts and stories" />
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[12.5px] text-white/45">
                {picked.size} of {material.length} selected. Best posts first.
              </p>
              <ul className="custom-scrollbar flex max-h-[300px] flex-col gap-1 overflow-y-auto">
                {material.map((item) => {
                  const on = picked.has(item.ref);
                  return (
                    <li key={item.ref}>
                      <label className={cn('flex cursor-pointer items-start gap-3 rounded-[12px] px-3 py-2.5 transition-colors hover:bg-white/[0.04]', !on && 'opacity-50')}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setPicked((current) => {
                              const next = new Set(current);
                              if (next.has(item.ref)) next.delete(item.ref);
                              else next.add(item.ref);
                              return next;
                            })
                          }
                          className="mt-1 accent-[#FF8A2B]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <Tag className="px-2 py-0.5 text-[10.5px]">{MATERIAL_LABEL[item.kind]}</Tag>
                            {item.relative !== null && item.relative >= 1.3 && <span className="text-[11px] text-forge-good">{item.relative.toFixed(1)}x usual</span>}
                          </span>
                          <span className="mt-1 line-clamp-2 block text-[13px] leading-relaxed text-white/75">{item.preview}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      ) : step === 'plan' && plan ? (
        <div className="flex flex-col gap-4">
          <Field label="Title" htmlFor="plan-title">
            <input id="plan-title" value={plan.title} onChange={(e) => setPlan({ ...plan, title: e.target.value })} className={inputClass} maxLength={140} />
          </Field>
          <Field label="Subtitle" htmlFor="plan-subtitle">
            <input id="plan-subtitle" value={plan.subtitle} onChange={(e) => setPlan({ ...plan, subtitle: e.target.value })} className={inputClass} maxLength={240} />
          </Field>
          <ol className="flex flex-col gap-2">
            {plan.chapters.map((chapter, index) => (
              <li key={index} className="rounded-[16px] border border-white/[0.07] bg-white/[0.02] p-3.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 text-[12px] font-semibold tabular-nums text-forge-gold">{index + 1}</span>
                  <input
                    value={chapter.title}
                    onChange={(e) => setPlan({ ...plan, chapters: plan.chapters.map((c, i) => (i === index ? { ...c, title: e.target.value } : c)) })}
                    className="min-w-0 flex-1 bg-transparent text-[14.5px] font-medium text-white outline-none"
                    maxLength={120}
                    aria-label={`Chapter ${index + 1} title`}
                  />
                  <button
                    type="button"
                    onClick={() => setPlan({ ...plan, chapters: plan.chapters.filter((_, i) => i !== index) })}
                    disabled={plan.chapters.length <= 1}
                    className="text-[12px] text-white/35 hover:text-forge-bad disabled:opacity-30"
                    aria-label={`Remove chapter ${index + 1}`}
                  >
                    Remove
                  </button>
                </div>
                {chapter.purpose && <p className="mt-1 pl-7 text-[12.5px] leading-relaxed text-white/45">{chapter.purpose}</p>}
                <p className="mt-2 pl-7 text-[11.5px] text-white/35">
                  From{' '}
                  {chapter.refs
                    .map((ref) => byRef.get(ref))
                    .filter(Boolean)
                    .slice(0, 3)
                    .map((m) => (m ? `${MATERIAL_LABEL[m.kind].toLowerCase()} "${m.title.slice(0, 40)}"` : ''))
                    .join(', ')}
                  {chapter.refs.length > 3 ? ` and ${chapter.refs.length - 3} more` : ''}
                </p>
              </li>
            ))}
          </ol>
          <p className="text-[12px] text-white/35">Writing uses one ebook from your plan&rsquo;s monthly allowance.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3" aria-live="polite">
          <p className="text-[13.5px] text-white/55">
            {step === 'done' ? 'It is in your ebooks, ready to read, share or download as a PDF.' : `Writing chapter ${Math.min(written + 1, plan?.chapters.length ?? 1)} of ${plan?.chapters.length ?? 0}. A few chapters are written at once.`}
          </p>
          <ol className="flex flex-col gap-1.5">
            {(plan?.chapters ?? []).map((chapter, index) => {
              const done = chapters[index];
              return (
                <li key={index} className="flex items-center gap-3 rounded-[12px] bg-white/[0.025] px-4 py-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {done ? (
                      <svg viewBox="0 0 24 24" className="h-4 w-4 text-forge-good" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    ) : failure ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
                    ) : (
                      <Spinner className="h-3.5 w-3.5 text-white/40" />
                    )}
                  </span>
                  <span className={cn('min-w-0 flex-1 truncate text-[13.5px]', done ? 'text-white/85' : 'text-white/45')}>{chapter.title}</span>
                  {done && <span className="text-[12px] tabular-nums text-white/35">{done.words.toLocaleString()} words</span>}
                </li>
              );
            })}
          </ol>
          {failure && <p className="rounded-[12px] bg-forge-bad/10 px-3 py-2 text-[13px] text-forge-bad">{failure}</p>}
        </div>
      )}
    </Dialog>
  );
}
