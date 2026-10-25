'use client';

/**
 * /drafts/[id]: the draft studio. One draft, everything about it: the text
 * (edited live with anyone else who has it open), comments on lines, the
 * version history, rendered visuals, its likely result and tracked links,
 * and where it came from. This is where a team works on a post together
 * and where a notification about a draft lands.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api, useConnectionsStore, useDraftStore } from '@/lib/forge/client';
import { draftText } from '@/lib/forge/draft-text';
import type { WorkspaceRole } from '@/lib/forge/data/workspace';
import { PLATFORM_NAMES, type DraftRecord } from '@/lib/forge/types';
import { useCollabDraft } from '@/lib/forge/use-collab';
import { useAppStore } from '@/lib/store';
import { displayName } from '@/lib/user-display';
import { PlatformLabel } from '@/components/forge/icons';
import { StandaloneShell } from '@/components/forge/StandaloneShell';
import { draftStatusTag } from '@/components/forge/drafts/DraftCard';
import { PublishPanel } from '@/components/forge/drafts/PublishPanel';
import { SchedulePopover } from '@/components/forge/drafts/SchedulePopover';
import { CommentsPanel } from '@/components/forge/studio/CommentsPanel';
import { LineagePanel } from '@/components/forge/studio/LineagePanel';
import { ResultsPanel } from '@/components/forge/studio/ResultsPanel';
import { StudioEditor, type Selection } from '@/components/forge/studio/StudioEditor';
import { VersionsPanel } from '@/components/forge/studio/VersionsPanel';
import { VisualPanel } from '@/components/forge/studio/VisualPanel';
import { Button, LoadingRow, Segmented, copyText } from '@/components/forge/ui';

type Rail = 'comments' | 'results' | 'visual' | 'history' | 'origin';

const EDITING_ROLES: ReadonlySet<WorkspaceRole> = new Set(['owner', 'editor']);

export default function DraftStudioPage({ params }: { params: { id: string } }) {
  const user = useAppStore((s) => s.user);
  const upsert = useDraftStore((s) => s.upsert);
  const loadConnections = useConnectionsStore((s) => s.load);
  const [loaded, setDraft] = useState<DraftRecord | null>(null);
  // Publishing, scheduling and approvals update the shared draft cache; follow it.
  const cached = useDraftStore((s) => s.drafts[params.id]);
  const draft = cached && loaded && cached.updated_at >= loaded.updated_at ? cached : loaded;
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [rail, setRail] = useState<Rail>('comments');
  const [anchor, setAnchor] = useState<Selection | null>(null);
  const [openComments, setOpenComments] = useState(0);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ draft: DraftRecord; role: WorkspaceRole }>(`/api/drafts/${params.id}`)
      .then((data) => {
        if (cancelled) return;
        setDraft(data.draft);
        setRole(data.role);
        upsert(data.draft);
      })
      .catch((error) => !cancelled && setFailed(error instanceof ApiError ? error.message : 'Could not open this draft.'));
    void loadConnections();
    return () => {
      cancelled = true;
    };
  }, [params.id, upsert, loadConnections]);

  const canEdit = role !== null && EDITING_ROLES.has(role);
  const me = useMemo(() => (user ? { id: user.id, name: displayName(user) } : null), [user]);

  const onSaved = useCallback(
    (next: DraftRecord) => {
      setDraft(next);
      upsert(next);
    },
    [upsert]
  );

  const collab = useCollabDraft({ draftId: params.id, me, canEdit: canEdit && draft?.status !== 'posted', onSaved });

  const selectAnchor = useCallback(
    (comment: { anchor_text: string | null; anchor_start: number | null }) => {
      if (!comment.anchor_text) return;
      const text = collab.text;
      // The words may have moved since the comment: take the occurrence nearest where they were.
      let best = -1;
      let from = 0;
      while (true) {
        const found = text.indexOf(comment.anchor_text, from);
        if (found === -1) break;
        if (best === -1 || Math.abs(found - (comment.anchor_start ?? 0)) < Math.abs(best - (comment.anchor_start ?? 0))) best = found;
        from = found + 1;
      }
      if (best === -1) {
        toast('Those words are no longer in the draft.');
        return;
      }
      collab.select(best, best + comment.anchor_text.length);
    },
    [collab]
  );

  async function requestApproval() {
    if (!draft) return;
    try {
      const { url } = await api<{ url: string }>(`/api/drafts/${draft.id}/approval`, { method: 'POST' });
      const refreshed = await api<{ draft: DraftRecord }>(`/api/drafts/${draft.id}`);
      onSaved(refreshed.draft);
      toast.success((await copyText(url)) ? 'Approval link copied. Send it to your client.' : `Approval link: ${url}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not create the approval link.');
    }
  }

  if (failed) {
    return (
      <StandaloneShell title="Draft" surface="studio">
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <p className="text-[18px] font-semibold">{failed}</p>
          <Link href="/dashboard?view=drafts" className="text-[14px] text-white/60 underline underline-offset-4 hover:text-white">
            Back to drafts
          </Link>
        </div>
      </StandaloneShell>
    );
  }

  if (!draft) {
    return (
      <StandaloneShell title="Draft" surface="studio" width="wide">
        <LoadingRow label="Opening the draft" />
      </StandaloneShell>
    );
  }

  const title = draft.title || `${PLATFORM_NAMES[draft.platform]} ${draft.kind}`;

  const railTabs: ReadonlyArray<{ value: Rail; label: string }> = [
    { value: 'comments', label: openComments > 0 ? `Comments ${openComments}` : 'Comments' },
    { value: 'results', label: 'Results' },
    { value: 'visual', label: 'Visual' },
    { value: 'history', label: 'History' },
    { value: 'origin', label: 'Origin' },
  ];

  return (
    <StandaloneShell
      title={title}
      surface="studio"
      width="wide"
      actions={
        <div className="hidden items-center gap-1.5 sm:flex">
          <Button
            variant="quiet"
            size="sm"
            onClick={async () => {
              if (await copyText(collab.text || draftText(draft))) toast.success('Copied.');
            }}
          >
            Copy
          </Button>
          {canEdit && draft.status !== 'posted' && (
            <SchedulePopover
              draft={draft}
              trigger={({ toggle }) => (
                <Button variant="quiet" size="sm" onClick={toggle}>
                  {draft.status === 'scheduled' ? 'Reschedule' : 'Schedule'}
                </Button>
              )}
            />
          )}
          {canEdit && draft.workspace_id && draft.status !== 'posted' && (
            <Button variant="quiet" size="sm" onClick={requestApproval}>
              Ask for approval
            </Button>
          )}
          {canEdit &&
            (draft.status === 'posted' && draft.post_url ? (
              <a href={draft.post_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium text-white/70 hover:bg-white/[0.06] hover:text-white">
                View post
              </a>
            ) : (
              <Button variant="primary" size="sm" onClick={() => setPublishing(true)}>
                {draft.status === 'posted' ? 'Link post' : 'Post'}
              </Button>
            ))}
        </div>
      }
    >
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1.5 text-[12.5px] font-medium text-white/85">
          <PlatformLabel platform={draft.platform} glyphClassName="h-3.5 w-3.5" />
          {draft.kind !== 'post' && <span className="text-white/45">{draft.kind}</span>}
        </span>
        {draftStatusTag(draft)}
        {role && role !== 'owner' && <span className="text-[12px] text-white/40">You are {role === 'editor' ? 'an editor' : `a ${role}`} here</span>}
        {canEdit && draft.status !== 'posted' && (
          <Button variant="primary" size="xs" className="ml-auto sm:hidden" onClick={() => setPublishing(true)}>
            Post
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <StudioEditor
            draft={draft}
            collab={collab}
            canEdit={canEdit}
            onComment={(selection) => {
              setAnchor(selection);
              setRail('comments');
            }}
          />
          {draft.notes && <p className="rounded-[18px] bg-white/[0.03] px-5 py-4 text-[13.5px] leading-relaxed text-white/55">{draft.notes}</p>}
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)]">
          <div className="custom-scrollbar overflow-x-auto pb-1">
            <Segmented<Rail> label="Draft panel" value={rail} onChange={setRail} options={railTabs} />
          </div>
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto rounded-[22px] border border-white/[0.07] bg-forge-panel p-4 sm:p-5">
            {rail === 'comments' && (
              <CommentsPanel draftId={draft.id} canEdit={canEdit} pendingAnchor={anchor} onClearAnchor={() => setAnchor(null)} onSelectAnchor={selectAnchor} onCount={setOpenComments} />
            )}
            {rail === 'results' && <ResultsPanel draft={draft} canEdit={canEdit} onUpdated={onSaved} />}
            {rail === 'visual' && <VisualPanel draft={draft} canEdit={canEdit} onUpdated={onSaved} />}
            {rail === 'history' && (
              <VersionsPanel
                draft={draft}
                canEdit={canEdit}
                currentText={collab.text}
                onRestored={(restored) => {
                  onSaved(restored);
                  collab.reload();
                }}
              />
            )}
            {rail === 'origin' && <LineagePanel draftId={draft.id} />}
          </div>
        </aside>
      </div>

      <PublishPanel draft={draft} open={publishing} onClose={() => setPublishing(false)} />
    </StandaloneShell>
  );
}
