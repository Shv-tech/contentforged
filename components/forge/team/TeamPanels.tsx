'use client';

/**
 * The rest of the team view: results by person, the activity log, and
 * monthly client reports.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api, type WorkspaceSummary } from '@/lib/forge/client';
import { ROLE_LABELS, type WorkspaceRole } from '@/lib/forge/labels';
import { UpsellCard } from '@/components/forge/views/UpsellCard';
import { Avatar, Button, Dialog, EmptyState, Field, LoadingRow, StatTile, Tag, Toggle, compactNumber, copyText, relativeTime, textareaClass } from '@/components/forge/ui';

// ============================================================================
// RESULTS BY PERSON
// ============================================================================

interface Rollup {
  kind: 'client' | 'company';
  windowDays: number;
  totals: { posted: number; engagement: number; impressions: number; awaitingReview: number };
  members: Array<{ userId: string; name: string; role: WorkspaceRole; posted: number; engagement: number; impressions: number; medianRelative: number | null; voiceSamples: number | null }>;
}

export function RollupPanel({ workspace }: { workspace: WorkspaceSummary }) {
  const [data, setData] = useState<Rollup | null>(null);
  const [denied, setDenied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<Rollup>(`/api/workspaces/${workspace.id}/rollup`)
      .then((value) => !cancelled && setData(value))
      .catch((error) => !cancelled && setDenied(error instanceof ApiError ? error.message : 'Could not load results.'));
    return () => {
      cancelled = true;
    };
  }, [workspace.id]);

  if (denied) return <p className="text-[13.5px] text-white/50">{denied}</p>;
  if (!data) return <LoadingRow label="Adding up the last 90 days" />;

  const best = Math.max(1, ...data.members.map((m) => m.posted));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Posts" value={data.totals.posted} note={`Last ${data.windowDays} days`} />
        <StatTile label="Views" value={compactNumber(data.totals.impressions)} note="Where platforms report them" />
        <StatTile label="Engagement" value={compactNumber(data.totals.engagement)} note="Replies weigh most" />
        <StatTile label="Waiting for review" value={data.totals.awaitingReview} tone={data.totals.awaitingReview > 0 ? 'warn' : undefined} note="Planned drafts" />
      </div>

      <div className="overflow-hidden rounded-[20px] border border-white/[0.07] bg-forge-card">
        <table className="w-full text-left text-[13.5px]">
          <thead className="border-b border-white/[0.06] text-[11.5px] font-semibold uppercase tracking-[0.08em] text-white/35">
            <tr>
              <th className="px-5 py-3 font-semibold">Person</th>
              <th className="px-3 py-3 font-semibold">Posts</th>
              <th className="hidden px-3 py-3 font-semibold sm:table-cell">Views</th>
              <th className="px-3 py-3 font-semibold">Against usual</th>
              {data.kind === 'company' && <th className="hidden px-5 py-3 font-semibold md:table-cell">Voice</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {data.members.map((member) => (
              <tr key={member.userId}>
                <td className="px-5 py-3.5">
                  <span className="flex items-center gap-3">
                    <Avatar name={member.name} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-white">{member.name}</span>
                      <span className="text-[11.5px] text-white/35">{ROLE_LABELS[member.role]}</span>
                    </span>
                  </span>
                </td>
                <td className="px-3 py-3.5">
                  <span className="flex items-center gap-2 tabular-nums text-white/80">
                    {member.posted}
                    <span className="hidden h-1 w-16 overflow-hidden rounded-full bg-white/[0.06] sm:block" aria-hidden>
                      <span className="block h-full rounded-full bg-forge-ember" style={{ width: `${(member.posted / best) * 100}%` }} />
                    </span>
                  </span>
                </td>
                <td className="hidden px-3 py-3.5 tabular-nums text-white/60 sm:table-cell">{compactNumber(member.impressions)}</td>
                <td className="px-3 py-3.5 tabular-nums">
                  {member.medianRelative === null ? (
                    <span className="text-white/30">Not enough yet</span>
                  ) : (
                    <span className={member.medianRelative >= 1.1 ? 'text-forge-good' : member.medianRelative <= 0.9 ? 'text-forge-warn' : 'text-white/75'}>{member.medianRelative.toFixed(1)}x</span>
                  )}
                </td>
                {data.kind === 'company' && (
                  <td className="hidden px-5 py-3.5 md:table-cell">
                    {member.voiceSamples && member.voiceSamples >= 5 ? <Tag tone="good">Measured</Tag> : <Tag tone="warn">{member.voiceSamples ?? 0} samples</Tag>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-white/35">&ldquo;Against usual&rdquo; is each person&rsquo;s median post compared with the workspace&rsquo;s usual result on the same platform.</p>
    </div>
  );
}

// ============================================================================
// ACTIVITY
// ============================================================================

interface AuditEvent {
  id: number;
  user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

const ACTION_COPY: Record<string, string> = {
  'draft.created': 'wrote a draft',
  'draft.edited': 'edited a draft',
  'draft.restored': 'restored an earlier version',
  'draft.scheduled': 'scheduled a draft',
  'draft.published': 'published a post',
  'draft.approved_in_review': 'approved a planned draft',
  'draft.sent_for_approval': 'sent a draft to the client',
  'draft.client_decision': 'gave a client decision',
  'draft.archived': 'archived a draft',
  'comment.added': 'commented on a draft',
  'comment.resolved': 'resolved a comment',
  'member.invited': 'invited someone',
  'member.joined': 'joined',
  'member.role_changed': 'changed a role',
  'member.removed': 'removed someone',
  'connection.added': 'connected an account',
  'connection.removed': 'disconnected an account',
  'rule.added': 'added a writing rule',
  'report.generated': 'built a monthly report',
  'workspace.updated': 'changed workspace settings',
};

export function ActivityPanel({ workspace }: { workspace: WorkspaceSummary }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [next, setNext] = useState<number | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (before?: number) => {
      try {
        const data = await api<{ events: AuditEvent[]; people: Record<string, string>; nextBefore: number | null }>(`/api/workspaces/${workspace.id}/audit${before ? `?before=${before}` : ''}`);
        setEvents((current) => (before ? [...(current ?? []), ...data.events] : data.events));
        setPeople((current) => ({ ...current, ...data.people }));
        setNext(data.nextBefore);
      } catch (error) {
        setDenied(error instanceof ApiError ? error.message : 'Could not load activity.');
      }
    },
    [workspace.id]
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (denied) return <p className="text-[13.5px] text-white/50">{denied}</p>;
  if (!events) return <LoadingRow label="Loading activity" />;
  if (events.length === 0) return <p className="text-[13.5px] text-white/45">Nothing yet. Drafts, edits, approvals and publishing appear here as they happen.</p>;

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col">
        {events.map((event) => {
          const name = event.user_id ? (people[event.user_id] ?? 'Someone') : 'Forge';
          const isDraft = event.target_type === 'draft' && event.target_id;
          return (
            <li key={event.id} className="flex items-start gap-3 border-b border-white/[0.04] py-3 last:border-0">
              <Avatar name={name} size="sm" />
              <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-white/70">
                <span className="font-medium text-white">{name}</span> {ACTION_COPY[event.action] ?? event.action.replace(/[._]/g, ' ')}
                {typeof event.detail?.role === 'string' && <span className="text-white/45"> ({String(event.detail.role)})</span>}
                {isDraft && (
                  <>
                    {' · '}
                    <Link href={`/drafts/${event.target_id}`} className="text-white/55 underline-offset-4 hover:text-white hover:underline">
                      open
                    </Link>
                  </>
                )}
              </p>
              <span className="shrink-0 text-[12px] text-white/30">{relativeTime(event.created_at)}</span>
            </li>
          );
        })}
      </ol>
      {next && (
        <Button
          variant="quiet"
          size="sm"
          loading={loadingMore}
          className="self-start"
          onClick={async () => {
            setLoadingMore(true);
            await load(next);
            setLoadingMore(false);
          }}
        >
          Older activity
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// REPORTS
// ============================================================================

interface ReportRow {
  id: string;
  token: string;
  period_start: string;
  period_end: string;
  data: { periodLabel: string; headline: string; posted: number };
  note: string | null;
  created_at: string;
  expires_at: string | null;
  url: string;
}

function lastMonth(): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function ReportsPanel({ workspace }: { workspace: WorkspaceSummary }) {
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(lastMonth());
  const [note, setNote] = useState('');
  const [send, setSend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const canEdit = workspace.role === 'owner' || workspace.role === 'editor';

  const load = useCallback(async () => {
    try {
      setReports((await api<{ reports: ReportRow[] }>('/api/reports')).reports);
    } catch {
      setReports([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function build() {
    setBusy(true);
    try {
      const { report, emailed } = await api<{ report: ReportRow; emailed: boolean }>('/api/reports', { method: 'POST', json: { month, note: note.trim() || null, send } });
      setOpen(false);
      setNote('');
      void load();
      if (send) toast.success(emailed ? 'Report built and emailed to the client.' : 'Report built. The email did not send; copy the link instead.');
      else toast.success((await copyText(report.url)) ? 'Report built. Link copied.' : 'Report built.');
    } catch (error) {
      if (error instanceof ApiError && error.isUpsell) {
        setOpen(false);
        setLocked(true);
      } else toast.error(error instanceof ApiError ? error.message : 'Could not build the report.');
    } finally {
      setBusy(false);
    }
  }

  if (locked) return <UpsellCard feature="client_reports" body="A monthly report for each client at a link they open without logging in: what went out, how it did, what drove bookings, and what is planned." />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[560px] text-[13.5px] leading-relaxed text-white/50">A report for the client at a private link, no login needed. Built on the 1st of each month automatically, or whenever you want.</p>
        {canEdit && (
          <Button variant="primary" onClick={() => setOpen(true)}>
            Build a report
          </Button>
        )}
      </div>

      {reports === null ? (
        <LoadingRow label="Loading reports" />
      ) : reports.length === 0 ? (
        <EmptyState plate="steel" title="No reports yet" body="The first one is built on the 1st of next month. Build one now to see what your client will see." />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {reports.map((report) => (
            <li key={report.id} className="flex flex-col gap-3 rounded-[20px] border border-white/[0.07] bg-forge-card p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[15px] font-semibold text-white">{report.data.periodLabel}</p>
                <span className="text-[12px] text-white/35">{report.data.posted} posts</span>
              </div>
              <p className="line-clamp-2 text-[13.5px] leading-relaxed text-white/60">{report.data.headline}</p>
              <div className="mt-auto flex gap-2">
                <a href={report.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-full border border-white/[0.12] px-3.5 text-[13px] font-medium text-white hover:bg-white/[0.06]">
                  Open
                </a>
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={async () => {
                    if (await copyText(report.url)) toast.success('Link copied.');
                  }}
                >
                  Copy link
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Build a report"
        footer={
          <>
            <Button variant="quiet" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={build} loading={busy}>
              {send ? 'Build and email' : 'Build'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <Field label="Month" htmlFor="report-month">
            <input id="report-month" type="month" value={month} max={new Date().toISOString().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} className="h-11 rounded-[14px] border border-white/[0.09] bg-white/[0.03] px-4 text-[14px] text-white [color-scheme:dark]" />
          </Field>
          <Field label="A note for the client" htmlFor="report-note" hint="Optional. Shown at the top of the report.">
            <textarea id="report-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={2000} className={textareaClass} />
          </Field>
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-[14px] font-medium text-white">Email it to the client</span>
              <span className="mt-0.5 block text-[12.5px] text-white/45">{workspace.client_email ? `To ${workspace.client_email}` : 'Add the client’s email in Brand settings first.'}</span>
            </span>
            <Toggle checked={send && Boolean(workspace.client_email)} onChange={(value) => setSend(value && Boolean(workspace.client_email))} label="Email it to the client" />
          </label>
        </div>
      </Dialog>
    </div>
  );
}
