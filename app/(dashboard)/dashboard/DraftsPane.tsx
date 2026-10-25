'use client';

/**
 * Every draft Forge has written, in one place.
 *
 * Before this view drafts only existed inside the conversation that produced
 * them, so finding last week's good hook meant scrolling Recents. Drafts now
 * live in their own table and are listed here newest first, filterable by
 * status, and open inline as the same card used in chat.
 *
 * "Worth reposting" lists posted drafts that outperformed the user's own
 * median and are old enough that most of today's audience has not seen
 * them, with a one-click fresh rewrite.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError, useDraftStore, WORKSPACE_CHANGED_EVENT } from '@/lib/forge/client';
import { draftText } from '@/lib/forge/draft-text';
import { firstLine, truncate } from '@/lib/forge/text';
import { PLATFORM_NAMES, type DraftRecord, type DraftStatus, type PostMetrics } from '@/lib/forge/types';
import { DraftCard } from '@/components/forge/drafts/DraftCard';
import { ScoreChip } from '@/components/forge/drafts/GradeStrip';
import { PlatformGlyph } from '@/components/forge/icons';
import { Button, EmptyState, Segmented, Spinner, Tag, cn, compactNumber, focusRing, relativeTime } from '@/components/forge/ui';
import { ViewShell, composeInChat } from '@/components/forge/views/ViewShell';

type Filter = 'all' | DraftStatus;
type Tab = 'library' | 'evergreen';

const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'posted', label: 'Posted' },
];

const STATUS_TONE: Record<DraftStatus, 'neutral' | 'ember' | 'good' | 'steel'> = {
  draft: 'neutral',
  scheduled: 'ember',
  posted: 'good',
  archived: 'steel',
};

const STATUS_LABEL: Record<DraftStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  posted: 'Posted',
  archived: 'Archived',
};

interface EvergreenCandidate {
  draft: DraftRecord;
  metrics: PostMetrics | null;
  percentile: number;
}

export function DraftsPane() {
  const [tab, setTab] = useState<Tab>('library');

  return (
    <ViewShell
      title="Drafts"
      subtitle="Everything Forge has written for you, with its grade, its voice match and where it is in the loop."
      actions={
        <Segmented
          label="Drafts view"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'library', label: 'Library' },
            { value: 'evergreen', label: 'Worth reposting' },
          ]}
        />
      }
    >
      {tab === 'library' ? <Library /> : <Evergreen />}
    </ViewShell>
  );
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

function Library() {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const drafts = useDraftStore((s) => s.drafts);
  const requestRef = useRef(0);

  const load = useCallback(
    async (append: boolean, from: string | null) => {
      const request = ++requestRef.current;
      append ? setLoadingMore(true) : setLoading(true);
      try {
        const params = new URLSearchParams({ view: 'library' });
        if (filter !== 'all') params.set('status', filter);
        if (query.trim()) params.set('q', query.trim());
        if (append && from) params.set('cursor', from);
        const data = await api<{ drafts: DraftRecord[]; nextCursor: string | null }>(`/api/drafts?${params}`);
        if (request !== requestRef.current) return;
        const store = useDraftStore.getState();
        data.drafts.forEach((draft) => store.upsert(draft));
        setIds((prev) => (append ? [...prev, ...data.drafts.map((d) => d.id)] : data.drafts.map((d) => d.id)));
        setCursor(data.nextCursor);
      } catch (error) {
        if (request === requestRef.current) toast.error(error instanceof ApiError ? error.message : 'Could not load drafts.');
      } finally {
        if (request === requestRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [filter, query]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(false, null), query ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  useEffect(() => {
    const reload = () => void load(false, null);
    window.addEventListener(WORKSPACE_CHANGED_EVENT, reload);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, reload);
  }, [load]);

  // Archiving from an open card removes it from the store; drop it here too.
  const visible = ids.filter((id) => drafts[id] && (filter !== 'all' || drafts[id].status !== 'archived'));

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented label="Filter by status" value={filter} onChange={setFilter} options={FILTERS} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search drafts"
          aria-label="Search drafts"
          className="h-10 w-full rounded-full border border-white/[0.08] bg-white/[0.03] px-4 text-[16px] text-white outline-none placeholder:text-white/35 focus:border-white/20 sm:w-[260px] sm:text-[14px]"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-[13.5px] text-white/45">
          <Spinner /> Loading drafts
        </div>
      ) : visible.length === 0 ? (
        query || filter !== 'all' ? (
          <p className="py-16 text-center text-[14px] text-white/45">No drafts match.</p>
        ) : (
          <EmptyState
            plate="steel"
            title="No drafts yet"
            body="Ask Forge for a post in chat. Every draft it writes lands here with its grade and voice match, ready to edit, schedule or post."
            action={
              <Button variant="primary" size="sm" onClick={() => composeInChat({ text: 'Write a LinkedIn post about ', fresh: true })}>
                Write the first one
              </Button>
            }
          />
        )
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((id) => {
            const draft = drafts[id];
            const open = openId === id;
            return (
              <li key={id}>
                {open ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenId(null)}
                      className="mb-2 text-[12.5px] text-white/45 hover:text-white"
                    >
                      Collapse
                    </button>
                    <DraftCard draft={draft} />
                  </div>
                ) : (
                  <DraftRow draft={draft} onOpen={() => setOpenId(id)} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {cursor && !loading && (
        <div className="mt-6 flex justify-center">
          <Button variant="quiet" size="sm" onClick={() => load(true, cursor)} disabled={loadingMore}>
            {loadingMore ? 'Loading' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}

function DraftRow({ draft, onOpen }: { draft: DraftRecord; onOpen: () => void }) {
  const text = draftText(draft);
  const when =
    draft.status === 'scheduled' && draft.scheduled_for
      ? `Posts ${new Date(draft.scheduled_for).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`
      : draft.status === 'posted'
        ? `Posted ${relativeTime(draft.posted_at)}`
        : `Edited ${relativeTime(draft.updated_at)}`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group flex w-full items-center gap-4 rounded-[18px] border border-white/[0.06] bg-forge-card px-4 py-3.5 text-left transition-colors hover:border-white/[0.12] hover:bg-forge-raised',
        focusRing
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-white/[0.04] text-white/70">
        <PlatformGlyph platform={draft.platform} className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-medium text-white">{truncate(firstLine(text) || 'Untitled', 120)}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/40">
          <span>
            {PLATFORM_NAMES[draft.platform]}
            {draft.kind === 'thread' ? `, ${draft.segments.length} posts` : draft.kind === 'carousel' ? ', carousel' : ''}
          </span>
          <span>{when}</span>
          {draft.voice_score !== null && <span>Voice {draft.voice_score}</span>}
          {draft.approval_status === 'pending' && <span className="text-forge-gold">Awaiting client</span>}
          {draft.approval_status === 'changes_requested' && <span className="text-forge-bad">Changes requested</span>}
        </span>
      </span>
      <Tag tone={STATUS_TONE[draft.status]} className="hidden sm:inline-flex">
        {STATUS_LABEL[draft.status]}
      </Tag>
      {draft.grade && <ScoreChip score={draft.grade.score} size="sm" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Evergreen
// ---------------------------------------------------------------------------

function Evergreen() {
  const [candidates, setCandidates] = useState<EvergreenCandidate[] | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ candidates: EvergreenCandidate[] }>('/api/drafts?view=evergreen');
      setCandidates(data.candidates);
    } catch (error) {
      setCandidates([]);
      toast.error(error instanceof ApiError ? error.message : 'Could not load your best posts.');
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(WORKSPACE_CHANGED_EVENT, load);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, load);
  }, [load]);

  if (candidates === null) {
    return (
      <div className="flex items-center gap-2 py-16 text-[13.5px] text-white/45">
        <Spinner /> Reading your results
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <EmptyState
        plate="quench"
        title="Nothing to bring back yet"
        body="Posts appear here once they are at least 60 days old and did better than most of what you post on that platform. Mark drafts as posted and add their numbers so Forge can tell."
      />
    );
  }

  const refresh = (candidate: EvergreenCandidate) => {
    const text = draftText(candidate.draft);
    composeInChat({
      fresh: true,
      send: true,
      tool: null,
      text: `This ${PLATFORM_NAMES[candidate.draft.platform]} post did better than most of mine. Write a fresh version for the same platform: keep the core idea and every true detail, but give it a new hook and a new structure so it does not read as a repost.\n\n${text}`,
    });
  };

  return (
    <ul className="flex flex-col gap-3">
      {candidates.map((candidate) => {
        const text = draftText(candidate.draft);
        const metrics = candidate.metrics;
        return (
          <li key={candidate.draft.id} className="rounded-[20px] border border-white/[0.06] bg-forge-card p-5">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-white/45">
              <PlatformGlyph platform={candidate.draft.platform} className="h-3.5 w-3.5" />
              <span>Posted {relativeTime(candidate.draft.posted_at)}</span>
              <Tag tone="good">Better than {Math.round(candidate.percentile * 100)}% of your posts</Tag>
            </div>
            <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-[14.5px] leading-relaxed text-white/85">{text}</p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              {metrics ? (
                <span className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-white/50 tabular-nums">
                  {metrics.impressions !== null && <span>{compactNumber(metrics.impressions)} views</span>}
                  {metrics.likes !== null && <span>{compactNumber(metrics.likes)} likes</span>}
                  {metrics.replies !== null && <span>{compactNumber(metrics.replies)} replies</span>}
                  {metrics.reposts !== null && <span>{compactNumber(metrics.reposts)} reposts</span>}
                </span>
              ) : (
                <span />
              )}
              <Button variant="primary" size="sm" onClick={() => refresh(candidate)}>
                Write a fresh version
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
