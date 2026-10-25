'use client';

/**
 * Ebooks written with the Ebook Writer, and guides compiled from the
 * brand's own posts. Open one to read it page by page and download it as a
 * PDF from the reader.
 */

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import { useAppStore } from '@/lib/store';
import dynamic from 'next/dynamic';
import { Button, EmptyState, Plate, Popover, Spinner, relativeTime, type PlateName } from '@/components/forge/ui';
import { ViewShell, composeInChat } from '@/components/forge/views/ViewShell';
import { CompileDialog } from '@/components/forge/longform/CompileDialog';

// The reader pulls in Mermaid and the PDF exporter; it loads only when a
// book is opened, not with the workspace.
const EbookCanvas = dynamic(() => import('@/components/EbookCanvas'), { ssr: false });

interface Ebook {
  id: string;
  title: string;
  content: string;
  word_count: number;
  is_public: boolean;
  share_token: string;
  created_at: string;
}

const COVERS: readonly PlateName[] = ['molten', 'ingot', 'sparks', 'quench', 'steel', 'slag'];

export function MyEbooksPane() {
  const { user } = useAppStore();
  const [ebooks, setEbooks] = useState<Ebook[] | null>(null);
  const [query, setQuery] = useState('');
  const [reading, setReading] = useState<Ebook | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await createClient().from('ebooks').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) toast.error('Could not load your ebooks.');
    setEbooks((data as Ebook[] | null) ?? []);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleShare = async (ebook: Ebook) => {
    const next = !ebook.is_public;
    const { error } = await createClient().from('ebooks').update({ is_public: next }).eq('id', ebook.id);
    if (error) {
      toast.error('Could not update sharing.');
      return;
    }
    setEbooks((prev) => prev?.map((e) => (e.id === ebook.id ? { ...e, is_public: next } : e)) ?? null);
    if (next) {
      await navigator.clipboard.writeText(`${window.location.origin}/share/ebook/${ebook.share_token}`);
      toast.success('Public link copied. Anyone with it can read this ebook.');
    } else {
      toast.success('This ebook is private again.');
    }
  };

  const remove = async (id: string) => {
    const { error } = await createClient().from('ebooks').delete().eq('id', id);
    if (error) {
      toast.error('Could not delete the ebook.');
      return;
    }
    setEbooks((prev) => prev?.filter((e) => e.id !== id) ?? null);
    setConfirming(null);
  };

  if (reading) {
    return (
      <div className="relative h-full w-full min-w-0 overflow-hidden bg-forge-ink">
        <button
          onClick={() => setReading(null)}
          className="absolute left-4 top-4 z-[70] flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-4 py-2.5 text-[13px] font-semibold text-white backdrop-blur-md hover:bg-black"
        >
          <X className="h-4 w-4" /> Close
        </button>
        <EbookCanvas title={reading.title} content={reading.content} />
      </div>
    );
  }

  const filtered = (ebooks ?? []).filter((e) => e.title.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <ViewShell
      title="Ebooks"
      subtitle="Written chapter by chapter from an outline you approved, or compiled from the posts you have already written."
      width="wide"
      actions={
        <>
          <Button variant="secondary" size="md" onClick={() => setCompiling(true)}>
            Compile from my posts
          </Button>
          <Button variant="primary" size="md" onClick={() => composeInChat({ fresh: true, tool: 'ebook_writer', text: 'Write an ebook about ' })}>
            New ebook
          </Button>
        </>
      }
    >
      <CompileDialog
        open={compiling}
        onClose={() => setCompiling(false)}
        onCompiled={async (ebookId) => {
          if (!user) return;
          const { data } = await createClient().from('ebooks').select('*').eq('id', ebookId).maybeSingle();
          await load();
          if (data) {
            setCompiling(false);
            setReading(data as Ebook);
          }
        }}
      />
      {ebooks === null ? (
        <div className="flex items-center gap-2 py-16 text-[13.5px] text-white/45">
          <Spinner /> Loading
        </div>
      ) : ebooks.length === 0 ? (
        <EmptyState
          plate="ingot"
          title="No ebooks yet"
          body="Tell Forge the topic. It proposes an outline for you to edit and approve, then writes every chapter in your voice."
          action={
            <Button variant="primary" size="sm" onClick={() => composeInChat({ fresh: true, tool: 'ebook_writer', text: 'Write an ebook about ' })}>
              Start one
            </Button>
          }
        />
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ebooks"
            aria-label="Search ebooks"
            className="mb-6 h-10 w-full rounded-full border border-white/[0.08] bg-white/[0.03] px-4 text-[16px] text-white outline-none placeholder:text-white/35 focus:border-white/20 sm:w-[300px] sm:text-[14px]"
          />
          {filtered.length === 0 && <p className="py-10 text-center text-[14px] text-white/45">No ebooks match.</p>}
          <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((ebook, index) => (
              <li key={ebook.id} className="min-w-0">
                <button type="button" onClick={() => setReading(ebook)} className="group block w-full text-left">
                  <Plate name={COVERS[index % COVERS.length]} className="flex aspect-[3/4] flex-col justify-end rounded-[18px] p-4 transition-transform group-hover:-translate-y-0.5" dim={0.7}>
                    <span className="relative line-clamp-4 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-white">{ebook.title}</span>
                    <span className="relative mt-2 text-[11px] text-white/60">{Math.round(ebook.word_count / 250)} pages</span>
                  </Plate>
                </button>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-white">{ebook.title}</p>
                    <p className="text-[12px] text-white/40">
                      {relativeTime(ebook.created_at)}
                      {ebook.is_public ? ' · shared' : ''}
                    </p>
                  </div>
                  <Popover
                    align="end"
                    trigger={({ toggle }) => (
                      <button type="button" onClick={toggle} className="rounded-md p-1 text-white/45 hover:text-white" aria-label={`Options for ${ebook.title}`}>
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                          <circle cx="5" cy="12" r="1.7" />
                          <circle cx="12" cy="12" r="1.7" />
                          <circle cx="19" cy="12" r="1.7" />
                        </svg>
                      </button>
                    )}
                  >
                    {(close) => (
                      <div className="flex flex-col">
                        {[
                          { label: 'Read and download', run: () => setReading(ebook) },
                          { label: ebook.is_public ? 'Stop sharing' : 'Copy share link', run: () => toggleShare(ebook) },
                          confirming === ebook.id ? { label: 'Delete for good', run: () => remove(ebook.id), danger: true } : { label: 'Delete', run: () => setConfirming(ebook.id), keepOpen: true },
                        ].map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => {
                              if (!('keepOpen' in item)) close();
                              void item.run();
                            }}
                            className={`rounded-xl px-3 py-2 text-left text-[13.5px] hover:bg-white/[0.06] ${'danger' in item ? 'text-forge-bad' : 'text-white/80 hover:text-white'}`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </Popover>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </ViewShell>
  );
}
