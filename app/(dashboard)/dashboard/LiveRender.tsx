'use client';

/**
 * The right-hand panel beside the conversation.
 *
 * It shows one of two things: the draft opened with "Preview" on a draft
 * card, rendered the way its platform shows it, or the ebook most recently
 * written. A draft preview takes precedence, because it is the thing the
 * user just asked to see; closing it returns to the ebook if there is one.
 */

import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { useConnectionsStore, useDraftStore } from '@/lib/forge/client';
import { displayName, userInitial } from '@/lib/user-display';
import dynamic from 'next/dynamic';
import { PostPreview } from '@/components/forge/preview/PostPreview';
import { IconButton, Plate } from '@/components/forge/ui';

// The reader pulls in Mermaid and the PDF exporter; it loads only when a
// book is opened, not with the workspace.
const EbookCanvas = dynamic(() => import('@/components/EbookCanvas'), { ssr: false });

export function LiveRender() {
  const { renderContent, renderPlatform, user } = useAppStore();
  const previewId = useDraftStore((s) => s.previewId);
  const draft = useDraftStore((s) => (s.previewId ? s.drafts[s.previewId] : undefined));
  const working = useDraftStore((s) => (s.previewId ? s.working[s.previewId] : undefined));
  const setPreview = useDraftStore((s) => s.setPreview);
  const ensure = useDraftStore((s) => s.ensure);
  const { xHandle, load: loadConnections } = useConnectionsStore();

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    if (previewId && !draft) void ensure([previewId]);
  }, [previewId, draft, ensure]);

  const identity = useMemo(
    () => ({ name: displayName(user), handle: xHandle, initial: userInitial(user) }),
    [user, xHandle]
  );

  const ebook = useMemo(() => (renderPlatform === 'ebook' && renderContent ? splitEbook(renderContent) : null), [renderContent, renderPlatform]);

  if (previewId) {
    return (
      <div className="relative flex h-full min-w-0 flex-col bg-forge-ink">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] px-5">
          <h2 className="text-[14px] font-semibold text-white">Preview</h2>
          <IconButton label="Close preview" onClick={() => setPreview(null)}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1">
          {draft ? (
            <PostPreview draft={draft} workingText={working ?? null} identity={identity} />
          ) : (
            <p className="px-6 py-10 text-[13px] text-white/45">Loading the draft.</p>
          )}
        </div>
      </div>
    );
  }

  if (ebook) {
    return (
      <div className="relative flex h-full min-w-0 flex-col overflow-hidden bg-forge-ink">
        <div className="flex h-14 shrink-0 items-center border-b border-white/[0.06] px-5">
          <h2 className="truncate text-[14px] font-semibold text-white">{ebook.title}</h2>
        </div>
        <div className="custom-scrollbar flex min-w-0 flex-1 items-start justify-center overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-8">
          <div className="w-full min-w-0">
            <EbookCanvas title={ebook.title} content={ebook.content} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-center bg-forge-ink p-6">
      <Plate name="steel" className="flex min-h-[300px] flex-col justify-end rounded-[26px] p-7" dim={0.6}>
        <div className="relative max-w-[340px]">
          <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-white">Nothing to preview yet</h3>
          <p className="mt-2 text-[14px] leading-relaxed text-white/70">
            Choose Preview on any draft to see it the way X, LinkedIn, Threads or Bluesky will show it, fold and all. Ebooks open here when they finish.
          </p>
        </div>
      </Plate>
    </div>
  );
}

/**
 * Takes the book's first heading as the cover title and removes headings the
 * chapter writer repeated directly under the chapter heading the pipeline
 * already added ("## Chapter 2" followed by "## Chapter 2: Pricing").
 */
function splitEbook(markdown: string): { title: string; content: string } {
  let title = 'Untitled ebook';
  let content = markdown;

  const first = content.match(/^(?:#|##)\s+(.*)/m);
  if (first) {
    title = first[1].trim();
    content = content.replace(first[0], '').trim();
  }

  content = content.replace(/^(#{1,3})\s+([^\n]+)\n+#{1,3}\s+([^\n]+)/gm, (match, level: string, outer: string, inner: string) => {
    const a = outer.toLowerCase().trim();
    const b = inner.toLowerCase().trim();
    if (a !== b && !b.includes(a) && !a.includes(b)) return match;
    // Keep the more descriptive of the two at the outer heading's level.
    return `${level} ${inner.length > outer.length ? inner : outer}`;
  });

  return { title, content };
}
