'use client';

/**
 * Where this draft came from, and what came from it. Every draft Forge
 * writes keeps its origin: the voice note, the newsletter passage, the
 * idea, the format, the experiment arm or the weekly plan.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/forge/client';
import { CAPTURE_SOURCE_LABELS, IDEA_SOURCE_LABELS, type CaptureSource, type IdeaSource } from '@/lib/forge/labels';
import { PLATFORM_NAMES, type DraftPlatform } from '@/lib/forge/types';
import { PlatformGlyph } from '@/components/forge/icons';
import { LoadingRow, relativeTime } from '@/components/forge/ui';

interface DraftLink {
  id: string;
  title: string | null;
  platform: DraftPlatform;
  status: string;
}

interface Lineage {
  capture: { id: string; source: CaptureSource; title: string | null; created_at: string } | null;
  source: { id: string; kind: string; title: string; url: string | null; created_at: string } | null;
  idea: { id: string; source: IdeaSource; angle: string; rationale: string | null } | null;
  format: { id: string; title: string; summary: string | null } | null;
  experiment: { id: string; hypothesis: string | null; arm: string | null; armKey: 'a' | 'b' | null; status: string } | null;
  plan: { id: string; week_start: string } | null;
  parent: DraftLink | null;
  children: DraftLink[];
  siblings: DraftLink[];
}

export function LineagePanel({ draftId }: { draftId: string }) {
  const [lineage, setLineage] = useState<Lineage | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<Lineage>(`/api/drafts/${draftId}/lineage`)
      .then((data) => !cancelled && setLineage(data))
      .catch(() => !cancelled && setLineage({ capture: null, source: null, idea: null, format: null, experiment: null, plan: null, parent: null, children: [], siblings: [] }));
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  if (!lineage) return <LoadingRow label="Tracing it back" />;

  const origins = [
    lineage.capture && {
      label: CAPTURE_SOURCE_LABELS[lineage.capture.source],
      title: lineage.capture.title || 'Untitled capture',
      detail: relativeTime(lineage.capture.created_at),
      href: '/dashboard?view=inbox',
    },
    lineage.source && {
      label: 'Repurposed from',
      title: lineage.source.title,
      detail: lineage.source.url ? hostOf(lineage.source.url) : relativeTime(lineage.source.created_at),
      href: lineage.source.url ?? undefined,
    },
    lineage.idea && { label: IDEA_SOURCE_LABELS[lineage.idea.source], title: lineage.idea.angle, detail: lineage.idea.rationale ?? undefined },
    lineage.format && { label: 'Format', title: lineage.format.title, detail: lineage.format.summary ?? undefined, href: '/dashboard?view=formats' },
    lineage.experiment && {
      label: `Experiment, arm ${lineage.experiment.armKey?.toUpperCase() ?? ''}`,
      title: lineage.experiment.arm ?? 'Experiment',
      detail: lineage.experiment.hypothesis ?? undefined,
      href: '/dashboard?view=playbook&tab=experiments',
    },
    lineage.plan && { label: 'Weekly plan', title: `Week of ${new Date(`${lineage.plan.week_start}T00:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`, href: '/dashboard?view=plan' },
  ].filter(Boolean) as Array<{ label: string; title: string; detail?: string; href?: string }>;

  const related = [...(lineage.parent ? [{ ...lineage.parent, relation: 'Variant of' }] : []), ...lineage.children.map((d) => ({ ...d, relation: 'Variant' })), ...lineage.siblings.map((d) => ({ ...d, relation: 'Same source' }))];

  if (origins.length === 0 && related.length === 0) {
    return <p className="px-1 text-[13px] leading-relaxed text-white/40">Written directly, in chat or by hand. Drafts from captures, ideas, formats and plans show their origin here.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {origins.length > 0 && (
        <ol className="relative flex flex-col gap-3">
          {origins.map((origin, index) => {
            const body = (
              <>
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-forge-gold/80">{origin.label}</p>
                <p className="mt-1 text-[14px] font-medium leading-snug text-white">{origin.title}</p>
                {origin.detail && <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-white/45">{origin.detail}</p>}
              </>
            );
            return (
              <li key={index}>
                {origin.href ? (
                  <Link href={origin.href} target={origin.href.startsWith('http') ? '_blank' : undefined} className="block rounded-[16px] border border-white/[0.07] bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.04]">
                    {body}
                  </Link>
                ) : (
                  <div className="rounded-[16px] border border-white/[0.07] bg-white/[0.02] p-4">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {related.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/35">Related drafts</h3>
          <ul className="flex flex-col gap-1">
            {related.map((d) => (
              <li key={`${d.relation}-${d.id}`}>
                <Link href={`/drafts/${d.id}`} className="flex items-center gap-3 rounded-[12px] px-3 py-2 transition-colors hover:bg-white/[0.04]">
                  <PlatformGlyph platform={d.platform} className="h-3.5 w-3.5 shrink-0 text-white/55" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-white/80">{d.title || PLATFORM_NAMES[d.platform]}</span>
                  <span className="shrink-0 text-[11.5px] text-white/35">{d.relation}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
