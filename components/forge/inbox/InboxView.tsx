'use client';

/**
 * Inbox: where material comes in and becomes a Story Bank you can post from.
 *
 * Review is the default tab because it is the decision only the person can
 * make: which of the stories Forge found are true, worth keeping, and
 * theirs. Everything else (the idea queue, connected sources, repurposing,
 * the history of captures) supports that.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api, onBrandChange, useActiveBrand } from '@/lib/forge/client';
import type { CaptureRecord, CaptureSummary, ProposalRecord } from '@/lib/forge/capture-client';
import { CAPTURE_SOURCE_LABELS } from '@/lib/forge/labels';
import { hasFeature } from '@/lib/forge/entitlements';
import { useAppStore } from '@/lib/store';
import { RecorderPanel } from '@/components/forge/capture/RecorderPanel';
import { ViewShell } from '@/components/forge/views/ViewShell';
import { UpsellCard } from '@/components/forge/views/UpsellCard';
import { Button, Card, EmptyState, LoadingRow, Section, Segmented, Tag, formatDuration, relativeTime } from '@/components/forge/ui';
import { CaptureDetailDialog, NoteDialog } from './CaptureDialogs';
import { IdeasPanel, type QueuedIdea } from './IdeasPanel';
import { ProposalCard } from './ProposalCard';
import { RepurposePanel } from './RepurposePanel';
import { SourcesPanel, type ProviderInfo, type SourceSummary } from './SourcesPanel';
import { WaysIn } from './WaysIn';

type Tab = 'review' | 'ideas' | 'sources' | 'repurpose' | 'history';

interface InboxData {
  proposals: ProposalRecord[];
  captures: CaptureSummary[];
}

export function InboxView() {
  const brand = useActiveBrand();
  const plan = useAppStore((s) => s.plan);
  const [tab, setTab] = useState<Tab>('review');
  const [inbox, setInbox] = useState<InboxData | null>(null);
  const [ideas, setIdeas] = useState<QueuedIdea[] | null>(null);
  const [sources, setSources] = useState<{ sources: SourceSummary[]; providers: ProviderInfo | null } | null>(null);
  const [sourcesLocked, setSourcesLocked] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [openCapture, setOpenCapture] = useState<string | null>(null);
  const closeCapture = useCallback(() => setOpenCapture(null), []);

  const loadInbox = useCallback(async () => {
    try {
      setInbox(await api<InboxData>('/api/capture'));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not load the inbox.');
      setInbox({ proposals: [], captures: [] });
    }
  }, []);

  const loadIdeas = useCallback(async () => {
    try {
      setIdeas((await api<{ ideas: QueuedIdea[] }>('/api/ideas')).ideas);
    } catch {
      setIdeas([]);
    }
  }, []);

  const loadSources = useCallback(async () => {
    try {
      setSources(await api<{ sources: SourceSummary[]; providers: ProviderInfo }>('/api/sources'));
      setSourcesLocked(false);
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) setSourcesLocked(true);
      setSources({ sources: [], providers: null });
    }
  }, []);

  const loadAll = useCallback(() => {
    setInbox(null);
    setIdeas(null);
    setSources(null);
    void loadInbox();
    void loadIdeas();
    void loadSources();
  }, [loadInbox, loadIdeas, loadSources]);

  useEffect(() => {
    loadAll();
    return onBrandChange(loadAll);
  }, [loadAll]);

  // Captures still being read refresh until they settle.
  const processing = inbox?.captures.some((c) => c.status === 'processing') ?? false;
  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(() => void loadInbox(), 5000);
    return () => window.clearInterval(timer);
  }, [processing, loadInbox]);

  const captureById = useMemo(() => new Map((inbox?.captures ?? []).map((c) => [c.id, c])), [inbox]);
  const grouped = useMemo(() => {
    const groups = new Map<string, ProposalRecord[]>();
    for (const proposal of inbox?.proposals ?? []) groups.set(proposal.capture_id, [...(groups.get(proposal.capture_id) ?? []), proposal]);
    return Array.from(groups.entries());
  }, [inbox]);

  const onCaptured = (capture: CaptureRecord) => {
    void loadInbox();
    if (capture.proposal_count > 0) void loadIdeas();
    setTab('review');
  };

  const onDecided = (id: string) => {
    setInbox((current) => (current ? { ...current, proposals: current.proposals.filter((p) => p.id !== id) } : current));
  };

  async function decideAll(captureId: string, action: 'keep' | 'discard') {
    const proposals = inbox?.proposals.filter((p) => p.capture_id === captureId) ?? [];
    const results = await Promise.allSettled(proposals.map((p) => api(`/api/capture/proposals/${p.id}`, { method: 'POST', json: { action } })));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) toast.error(`${failed} could not be saved. Try those again.`);
    else toast.success(action === 'keep' ? `Kept ${proposals.length}.` : `Discarded ${proposals.length}.`);
    void loadInbox();
  }

  const pending = inbox?.proposals.length ?? 0;
  const readOnly = !brand.canEdit;

  return (
    <ViewShell
      title="Inbox"
      subtitle="Everything you capture comes here first. Forge pulls out the stories, numbers and opinions worth posting, and you decide what is true and worth keeping."
      width="wide"
      actions={
        !readOnly && (
          <Button variant="secondary" onClick={() => setNoteOpen(true)}>
            Write a note
          </Button>
        )
      }
    >
      <div className="mb-6 overflow-x-auto pb-1">
        <Segmented<Tab>
          label="Inbox section"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'review', label: pending > 0 ? `To review · ${pending}` : 'To review' },
            { value: 'ideas', label: ideas && ideas.length > 0 ? `Ideas · ${ideas.length}` : 'Ideas' },
            { value: 'sources', label: 'Sources' },
            { value: 'repurpose', label: 'Repurpose' },
            { value: 'history', label: 'History' },
          ]}
        />
      </div>

      {tab === 'review' && (
        <div className="flex flex-col gap-10">
          {!readOnly && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <Card className="relative overflow-hidden p-6 sm:p-7">
                <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-forge-ember/10 blur-3xl" />
                <h2 className="relative text-[17px] font-semibold text-white">Talk through your week</h2>
                <p className="relative mt-1 text-[13.5px] leading-relaxed text-white/50">A two minute voice note is enough. What happened, what surprised you, what it cost.</p>
                <div className="relative mt-6">
                  <RecorderPanel onCaptured={onCaptured} interviewsAllowed={hasFeature(plan, 'interviews') || Boolean(brand.workspace)} compact />
                </div>
              </Card>
              <div className="flex min-w-0 flex-col gap-3">
                <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-white/35">Other ways in</h2>
                <WaysIn readOnly={readOnly} />
              </div>
            </div>
          )}

          <Section
            title="To review"
            description={pending > 0 ? 'Keep what is true and yours. Edit anything that is close. Discard the rest.' : undefined}
          >
            {inbox === null ? (
              <LoadingRow label="Loading the inbox" />
            ) : grouped.length === 0 ? (
              <EmptyState
                plate="quench"
                title="Nothing to review"
                body={
                  processing
                    ? 'Forge is reading what you sent. Stories appear here in a moment.'
                    : 'Record a voice note, forward an email or connect a source. Forge reads it and brings the stories here for you to keep or discard.'
                }
              />
            ) : (
              <div className="flex flex-col gap-8">
                {grouped.map(([captureId, proposals]) => {
                  const capture = captureById.get(captureId);
                  return (
                    <div key={captureId} className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button type="button" onClick={() => setOpenCapture(captureId)} className="flex min-w-0 items-center gap-2 text-left">
                          <Tag>{capture ? CAPTURE_SOURCE_LABELS[capture.source] : 'Capture'}</Tag>
                          <span className="truncate text-[13.5px] font-medium text-white/75 hover:text-white">{capture?.title || 'Untitled'}</span>
                          {capture && <span className="shrink-0 text-[12px] text-white/30">{relativeTime(capture.created_at)}</span>}
                        </button>
                        {!readOnly && proposals.length > 1 && (
                          <div className="flex gap-1">
                            <Button variant="quiet" size="xs" onClick={() => decideAll(captureId, 'keep')}>
                              Keep all {proposals.length}
                            </Button>
                            <Button variant="quiet" size="xs" onClick={() => decideAll(captureId, 'discard')}>
                              Discard all
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {proposals.map((proposal) => (
                          <ProposalCard key={proposal.id} proposal={proposal} onDecided={onDecided} readOnly={readOnly} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>
      )}

      {tab === 'ideas' &&
        (ideas === null ? <LoadingRow label="Loading ideas" /> : <IdeasPanel ideas={ideas} onChange={setIdeas} readOnly={readOnly} />)}

      {tab === 'sources' &&
        (sourcesLocked ? (
          <UpsellCard feature="sources" body="Connect GitHub, Linear, Notion and your calendar. Forge reads what you shipped and who you met, and turns it into stories and questions worth answering." />
        ) : sources === null ? (
          <LoadingRow label="Loading sources" />
        ) : (
          <Section title="Connected sources" description="Read every six hours. New material lands in To review.">
            <SourcesPanel sources={sources.sources} providers={sources.providers} onChange={() => void loadSources().then(loadInbox)} readOnly={readOnly} />
          </Section>
        ))}

      {tab === 'repurpose' && <RepurposePanel readOnly={readOnly} />}

      {tab === 'history' &&
        (inbox === null ? (
          <LoadingRow label="Loading" />
        ) : inbox.captures.length === 0 ? (
          <EmptyState plate="slag" title="Nothing captured yet" body="Voice notes, emails, shares, saves and synced items all appear here, with what Forge found in each." />
        ) : (
          <ul className="flex flex-col divide-y divide-white/[0.05] overflow-hidden rounded-[20px] border border-white/[0.07] bg-forge-card">
            {inbox.captures.map((capture) => (
              <li key={capture.id}>
                <button type="button" onClick={() => setOpenCapture(capture.id)} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.03]">
                  <Tag tone={capture.status === 'failed' ? 'bad' : capture.status === 'processing' ? 'warn' : 'neutral'}>{CAPTURE_SOURCE_LABELS[capture.source]}</Tag>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-white/85">{capture.title || 'Untitled'}</span>
                  <span className="hidden shrink-0 text-[12.5px] text-white/40 sm:inline">
                    {capture.status === 'processing'
                      ? 'Reading'
                      : capture.status === 'failed'
                        ? 'Could not read'
                        : `${capture.proposal_count} ${capture.proposal_count === 1 ? 'story' : 'stories'}`}
                    {capture.duration_seconds ? ` · ${formatDuration(capture.duration_seconds)}` : ''}
                  </span>
                  <span className="shrink-0 text-[12px] text-white/30">{relativeTime(capture.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        ))}

      <NoteDialog open={noteOpen} onClose={() => setNoteOpen(false)} onCaptured={onCaptured} />
      <CaptureDetailDialog id={openCapture} onClose={closeCapture} onChanged={loadInbox} />
    </ViewShell>
  );
}
