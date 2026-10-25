'use client';

/**
 * Version history: every saved state of the draft, who made it and how
 * (typed, live-edited, a Forge assist, a restore). Restoring is itself a
 * version, so nothing is lost by trying an older one.
 */

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api } from '@/lib/forge/client';
import type { DraftVersion } from '@/lib/forge/data/collab';
import { diffWords } from '@/lib/forge/learning';
import { joinSegments } from '@/lib/forge/text';
import type { DraftRecord } from '@/lib/forge/types';
import { Button, LoadingRow, cn, relativeTime } from '@/components/forge/ui';

type NamedVersion = DraftVersion & { author: string };

const REASON_LABEL: Record<DraftVersion['reason'], string> = {
  created: 'Written',
  edit: 'Edited',
  collab: 'Edited live',
  assist: 'Forge rewrite',
  restore: 'Restored',
  approval: 'Approved',
  plan: 'Planned',
};

function textOf(version: Pick<DraftVersion, 'body' | 'segments'>): string {
  return version.segments.length > 0 ? joinSegments(version.segments) : version.body;
}

export function VersionsPanel({ draft, canEdit, currentText, onRestored }: { draft: DraftRecord; canEdit: boolean; currentText: string; onRestored: (draft: DraftRecord) => void }) {
  const [versions, setVersions] = useState<NamedVersion[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setVersions((await api<{ versions: NamedVersion[] }>(`/api/drafts/${draft.id}/versions`)).versions);
    } catch {
      setVersions([]);
    }
  }, [draft.id]);

  useEffect(() => {
    void load();
    // Refresh when the draft's saved text changes.
  }, [load, draft.updated_at]);

  async function restore(version: NamedVersion) {
    setBusy(version.id);
    try {
      const { draft: updated } = await api<{ draft: DraftRecord }>(`/api/drafts/${draft.id}/versions`, { method: 'POST', json: { versionId: version.id } });
      onRestored(updated);
      toast.success('Restored. The text before it is kept as a version.');
      setOpen(null);
      void load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not restore it.');
    } finally {
      setBusy(null);
    }
  }

  if (versions === null) return <LoadingRow label="Loading history" />;
  if (versions.length === 0) return <p className="px-1 text-[13px] text-white/40">History starts with the next edit.</p>;

  return (
    <ol className="relative flex flex-col">
      <span aria-hidden className="absolute bottom-3 left-[7px] top-3 w-px bg-white/[0.08]" />
      {versions.map((version, index) => {
        const expanded = open === version.id;
        const text = textOf(version);
        const isCurrent = index === 0 && text === currentText;
        return (
          <li key={version.id} className="relative pl-7">
            <span aria-hidden className={cn('absolute left-0 top-[18px] h-[15px] w-[15px] rounded-full border-2 border-forge-card', isCurrent ? 'bg-forge-ember' : 'bg-white/20')} />
            <button type="button" onClick={() => setOpen(expanded ? null : version.id)} className="w-full rounded-[14px] px-3 py-3 text-left transition-colors hover:bg-white/[0.03]">
              <p className="text-[13px] font-medium text-white/85">
                {REASON_LABEL[version.reason]} by {version.author}
                {isCurrent && <span className="ml-2 text-[11.5px] font-normal text-forge-gold">Current</span>}
              </p>
              <p className="mt-0.5 text-[12px] text-white/35">{relativeTime(version.created_at)}</p>
            </button>
            {expanded && (
              <div className="mb-3 ml-3 flex flex-col gap-3 rounded-[14px] bg-white/[0.025] p-3">
                <DiffView before={text} after={currentText} />
                {canEdit && !isCurrent && draft.status !== 'posted' && (
                  <Button variant="secondary" size="xs" loading={busy === version.id} onClick={() => restore(version)} className="self-start">
                    Restore this version
                  </Button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** What restoring would change: words that would come back, and words that would go. */
function DiffView({ before, after }: { before: string; after: string }) {
  if (before === after) return <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/70">{before}</p>;
  const ops = diffWords(after, before);
  return (
    <p className="custom-scrollbar max-h-[280px] overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-white/70">
      {ops.map((op, i) =>
        op.kind === 'equal' ? (
          <span key={i}>{op.text}</span>
        ) : op.kind === 'insert' ? (
          <span key={i} className="rounded-sm bg-forge-good/15 text-forge-good">
            {op.text}
          </span>
        ) : (
          <span key={i} className="rounded-sm bg-forge-bad/10 text-forge-bad/80 line-through">
            {op.text}
          </span>
        )
      )}
    </p>
  );
}
