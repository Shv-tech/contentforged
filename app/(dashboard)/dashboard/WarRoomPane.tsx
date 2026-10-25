'use client';

/**
 * War Room: describe a campaign, watch five roles plan, write, attack and
 * fix it, and get graded drafts back. See lib/forge/war-room.ts.
 */

import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast from 'react-hot-toast';
import { useAppStore } from '@/lib/store';
import { readNdjson, useDraftStore } from '@/lib/forge/client';
import type { DraftRecord } from '@/lib/forge/types';
import { WAR_ROOM_AGENTS as AGENTS, type WarRoomAgent, type WarRoomEvent } from '@/lib/forge/war-room-agents';
import { DraftCard } from '@/components/forge/drafts/DraftCard';
import { Button, Card, Plate, Spinner, cn, inputClass } from '@/components/forge/ui';

type AgentState = { state: 'waiting' | 'active' | 'done' | 'skipped'; note?: string };

const EXAMPLES = [
  'Launch week for our new pricing page. B2B founders on LinkedIn and X.',
  'Three posts that turn my story about firing our first big client into inbound leads.',
  'Announce that we hit 1,000 users, without sounding like a humblebrag.',
];

export function WarRoomPane() {
  const { setActiveTool, setActiveSessionId, setSidebarView } = useAppStore();
  const upsert = useDraftStore((s) => s.upsert);
  const [brief, setBrief] = useState('');
  const [running, setRunning] = useState(false);
  const [agents, setAgents] = useState<Record<WarRoomAgent, AgentState>>(initialAgents);
  const [strategy, setStrategy] = useState<string | null>(null);
  const [critique, setCritique] = useState<string | null>(null);
  const [sources, setSources] = useState<Array<{ title: string; url: string }>>([]);
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = () => {
    setAgents(initialAgents());
    setStrategy(null);
    setCritique(null);
    setSources([]);
    setDrafts([]);
    setSessionId(null);
    setError(null);
  };

  const run = async () => {
    if (!brief.trim() || running) return;
    reset();
    setRunning(true);
    abortRef.current = new AbortController();
    try {
      const response = await fetch('/api/war-room', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brief }),
        signal: abortRef.current.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.error === 'string' ? body.error : `The War Room could not start (${response.status}).`);
      }
      await readNdjson<WarRoomEvent>(response, (event) => {
        switch (event.type) {
          case 'agent':
            setAgents((prev) => ({ ...prev, [event.agent]: { state: event.state, note: event.note } }));
            break;
          case 'notes':
            if (event.agent === 'strategist') setStrategy(event.markdown);
            if (event.agent === 'red_team') setCritique(event.markdown);
            break;
          case 'sources':
            setSources(event.sources.map((s) => ({ title: s.title, url: s.url })));
            break;
          case 'draft':
            upsert(event.draft);
            setDrafts((prev) => [...prev, event.draft]);
            break;
          case 'done':
            setSessionId(event.sessionId);
            window.dispatchEvent(new Event('refresh-sidebar'));
            break;
          case 'error':
            setError(event.message);
            break;
        }
      });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') setError('Stopped.');
      else {
        const message = err instanceof Error ? err.message : 'The War Room stopped unexpectedly.';
        setError(message);
        toast.error(message);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const openInChat = () => {
    if (!sessionId) return;
    setActiveTool(null);
    setActiveSessionId(sessionId);
    setSidebarView('chat');
  };

  const started = running || strategy !== null || drafts.length > 0 || error !== null;

  return (
    <div className="custom-scrollbar h-full w-full min-w-0 overflow-y-auto overflow-x-hidden bg-forge-ink">
      <div className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-white/[0.06] bg-forge-ink/90 px-4 backdrop-blur-xl">
        <button type="button" onClick={() => setActiveTool(null)} className="rounded-full px-3 py-1.5 text-[13px] text-white/55 hover:bg-white/[0.05] hover:text-white">
          Back to chat
        </button>
        <span className="text-[14px] font-semibold text-white">War Room</span>
        <span className="w-[92px]" aria-hidden />
      </div>

      <div className="mx-auto w-full max-w-[880px] px-4 pb-24 pt-8 sm:px-8">
        {!started ? (
          <Plate name="sparks" className="flex min-h-[300px] flex-col justify-end rounded-[28px] p-7 sm:p-10" dim={0.6}>
            <div className="relative max-w-[560px]">
              <h1 className="text-[30px] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-[40px]">One brief. Five minds. Graded posts.</h1>
              <p className="mt-3 text-[15px] leading-relaxed text-white/75">
                A researcher, a strategist, a writer, a red team and an editor work on your campaign in turn, each reading the last one&apos;s work.
              </p>
            </div>
          </Plate>
        ) : (
          <ol className="grid gap-2 sm:grid-cols-5">
            {AGENTS.map((agent) => {
              const state = agents[agent.id];
              return (
                <li
                  key={agent.id}
                  className={cn(
                    'rounded-[18px] border p-3.5 transition-colors',
                    state.state === 'active' ? 'border-forge-ember/40 bg-forge-ember/[0.08]' : state.state === 'done' ? 'border-white/[0.08] bg-forge-card' : 'border-white/[0.05] bg-transparent'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {state.state === 'active' ? (
                      <Spinner className="h-3.5 w-3.5 text-forge-gold" />
                    ) : (
                      <span aria-hidden className={cn('h-2 w-2 rounded-full', state.state === 'done' ? 'bg-forge-good' : state.state === 'skipped' ? 'bg-white/25' : 'bg-white/10')} />
                    )}
                    <span className={cn('text-[13.5px] font-semibold', state.state === 'waiting' ? 'text-white/40' : 'text-white')}>{agent.name}</span>
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-snug text-white/40">{state.note ?? agent.role}</p>
                </li>
              );
            })}
          </ol>
        )}

        <Card className="mt-6 p-5">
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            maxLength={4000}
            disabled={running}
            placeholder="What is the campaign? Who is it for, what should happen, and on which platforms?"
            aria-label="Campaign brief"
            className={cn(inputClass, 'resize-y')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void run();
            }}
          />
          {!started && (
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" onClick={() => setBrief(example)} className="rounded-full border border-white/[0.08] px-3 py-1.5 text-left text-[12.5px] text-white/55 hover:border-white/20 hover:text-white">
                  {example}
                </button>
              ))}
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            {running ? (
              <Button variant="secondary" size="md" onClick={() => abortRef.current?.abort()}>
                Stop
              </Button>
            ) : (
              <Button variant="ember" size="md" disabled={brief.trim().length < 10} onClick={run}>
                {started ? 'Run again' : 'Start the War Room'}
              </Button>
            )}
          </div>
        </Card>

        {error && <p className="mt-6 rounded-2xl bg-forge-bad/10 px-4 py-3 text-[14px] text-forge-bad">{error}</p>}

        {strategy && (
          <Section title="Strategy">
            <Markdown text={strategy} />
            {sources.length > 0 && (
              <div className="mt-5 border-t border-white/[0.06] pt-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/35">Sources</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {sources.map((source) => (
                    <li key={source.url}>
                      <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-forge-gold hover:underline">
                        {source.title || source.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        )}

        {critique && (
          <Section title="What the Red Team found">
            <Markdown text={critique} />
          </Section>
        )}

        {drafts.length > 0 && (
          <section className="mt-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[18px] font-semibold text-white">The posts</h2>
              {sessionId && !running && (
                <Button variant="secondary" size="sm" onClick={openInChat}>
                  Continue in chat
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-4">
              {drafts.map((draft) => (
                <DraftCardFromStore key={draft.id} draft={draft} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function initialAgents(): Record<WarRoomAgent, AgentState> {
  return { researcher: { state: 'waiting' }, strategist: { state: 'waiting' }, writer: { state: 'waiting' }, red_team: { state: 'waiting' }, editor: { state: 'waiting' } };
}

/** Reads the live record so edits, grades and scheduling on the card show here. */
function DraftCardFromStore({ draft }: { draft: DraftRecord }) {
  const live = useDraftStore((s) => s.drafts[draft.id]) ?? draft;
  return <DraftCard draft={live} />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mt-6 p-6">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-white/40">{title}</h2>
      {children}
    </Card>
  );
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none break-words prose-headings:text-[15px] prose-headings:font-semibold prose-p:leading-relaxed prose-a:text-forge-gold prose-table:block prose-table:overflow-x-auto">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
