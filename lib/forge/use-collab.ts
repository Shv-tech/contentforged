'use client';

/**
 * lib/forge/use-collab.ts
 *
 * Live co-editing of one draft.
 *
 * The draft's text is a Yjs document. Everyone with the draft open joins a
 * private Supabase Realtime channel (draft:<id>, gated by the same access
 * rules as the draft) and exchanges Yjs updates as broadcasts; presence says
 * who is there and where their cursor is. Separately, the merged document is
 * saved to the server a moment after each pause in typing, so the draft is
 * never only in someone's browser.
 *
 * Realtime is an accelerator, not a dependency: when the channel cannot
 * connect, edits still save and merge on the server, and a reload shows
 * everyone's work.
 *
 * The textarea is bound directly (uncontrolled) so remote edits can be
 * applied without moving the local caret: the selection is captured as Yjs
 * relative positions before a remote update and restored after it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-browser';
import { ApiError, api } from './client';
import { fromBase64, TEXT_KEY, toBase64 } from './collab-doc';
import type { DraftKind, DraftRecord } from './types';

export type CollabStatus = 'loading' | 'connecting' | 'live' | 'solo' | 'saving' | 'saved' | 'error';

export interface CollabPeer {
  key: string;
  userId: string;
  name: string;
  color: string;
  canEdit: boolean;
  /** Line the peer's cursor is on, 1-based, while they are in the text. */
  line: number | null;
}

interface PresencePayload {
  userId: string;
  name: string;
  color: string;
  canEdit: boolean;
  cursor: unknown | null;
}

const SAVE_DELAY_MS = 1200;
const COLORS = ['#FFB067', '#8EE3B0', '#9AA8B8', '#E9A3C9', '#B9A4F5', '#7FD1E8'];

export function colorFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

/** Replaces the text's content with `next` as one minimal edit, so concurrent edits elsewhere survive. */
function applyDiff(ytext: Y.Text, next: string) {
  const current = ytext.toString();
  if (current === next) return;
  let start = 0;
  const max = Math.min(current.length, next.length);
  while (start < max && current[start] === next[start]) start += 1;
  let end = 0;
  while (end < max - start && current[current.length - 1 - end] === next[next.length - 1 - end]) end += 1;
  const removed = current.length - start - end;
  if (removed > 0) ytext.delete(start, removed);
  const inserted = next.slice(start, next.length - end);
  if (inserted) ytext.insert(start, inserted);
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < Math.min(index, text.length); i += 1) if (text[i] === '\n') line += 1;
  return line;
}

export function useCollabDraft(input: { draftId: string; me: { id: string; name: string } | null; canEdit: boolean; onSaved?: (draft: DraftRecord) => void }) {
  const { draftId, me } = input;
  const [status, setStatus] = useState<CollabStatus>('loading');
  const [text, setText] = useState('');
  const [kind, setKind] = useState<DraftKind>('post');
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Bumped to throw the document away and open it again (after a reset). */
  const [generation, setGeneration] = useState(0);

  const doc = useRef<Y.Doc | null>(null);
  const channel = useRef<RealtimeChannel | null>(null);
  const element = useRef<HTMLTextAreaElement | null>(null);
  const saveTimer = useRef<number | null>(null);
  const dirty = useRef(false);
  const saving = useRef(false);
  const live = useRef(false);
  const epoch = useRef<string | null>(null);

  // Values the long-lived channel handlers read at call time, not at join time.
  const latest = useRef(input);
  latest.current = input;

  const save = useCallback(async (): Promise<void> => {
    const ydoc = doc.current;
    if (!ydoc || !dirty.current || saving.current) return;
    saving.current = true;
    dirty.current = false;
    setStatus('saving');
    try {
      const response = await api<{ state: string; draft: DraftRecord }>(`/api/drafts/${draftId}/collab`, {
        method: 'PUT',
        json: { state: toBase64(Y.encodeStateAsUpdate(ydoc)), epoch: epoch.current },
      });
      if (doc.current === ydoc) Y.applyUpdate(ydoc, fromBase64(response.state), 'server');
      latest.current.onSaved?.(response.draft);
      setStatus(live.current ? 'live' : 'saved');
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409 && cause.body.reset) {
        // Someone restored a version or edited outside the studio. Open the
        // new text rather than merging the old document into it.
        dirty.current = false;
        setError('This draft was changed elsewhere, so it was reopened with the latest text.');
        setGeneration((g) => g + 1);
        return;
      }
      dirty.current = true;
      setStatus('error');
      setError(cause instanceof Error ? cause.message : 'Could not save. Your edits are kept here and will retry.');
    } finally {
      saving.current = false;
      if (dirty.current) {
        if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => void save(), SAVE_DELAY_MS * 3);
      }
    }
  }, [draftId]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void save(), SAVE_DELAY_MS);
  }, [save]);

  const publishCursor = useCallback(() => {
    const el = element.current;
    const ydoc = doc.current;
    const person = latest.current.me;
    if (!channel.current || !live.current || !person || !el || !ydoc) return;
    const cursor = document.activeElement === el ? Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(ydoc.getText(TEXT_KEY), el.selectionStart)) : null;
    const payload: PresencePayload = { userId: person.id, name: person.name, color: colorFor(person.id), canEdit: latest.current.canEdit, cursor };
    void channel.current.track(payload);
  }, []);

  useEffect(() => {
    let disposed = false;
    const supabase = createClient();
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText(TEXT_KEY);
    doc.current = ydoc;

    const render = (fromElsewhere: boolean) => {
      const value = ytext.toString();
      setText(value);
      const el = element.current;
      if (el && fromElsewhere && el.value !== value) el.value = value;
    };

    ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== 'local') return;
      dirty.current = true;
      scheduleSave();
      if (live.current) void channel.current?.send({ type: 'broadcast', event: 'update', payload: { u: toBase64(update) } });
    });

    /** Applies someone else's update, keeping the local selection in place. */
    const applyElsewhere = (update: Uint8Array, origin: 'remote' | 'server') => {
      const el = element.current;
      const focused = el !== null && document.activeElement === el;
      const anchors = focused && el ? [Y.createRelativePositionFromTypeIndex(ytext, el.selectionStart), Y.createRelativePositionFromTypeIndex(ytext, el.selectionEnd)] : null;
      Y.applyUpdate(ydoc, update, origin);
      render(true);
      if (el && anchors) {
        const [start, end] = anchors.map((rel) => Y.createAbsolutePositionFromRelativePosition(rel, ydoc)?.index ?? 0);
        el.setSelectionRange(start, end);
      }
    };

    const readPeers = (room: RealtimeChannel) => {
      const state = room.presenceState<PresencePayload>();
      const value = ytext.toString();
      const self = latest.current.me?.id;
      const list: CollabPeer[] = [];
      for (const [key, entries] of Object.entries(state)) {
        const entry = entries[0];
        if (!entry || entry.userId === self) continue;
        let line: number | null = null;
        if (entry.cursor) {
          try {
            const index = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(entry.cursor), ydoc)?.index;
            if (typeof index === 'number') line = lineOf(value, index);
          } catch {
            line = null;
          }
        }
        list.push({ key, userId: entry.userId, name: entry.name, color: entry.color, canEdit: entry.canEdit, line });
      }
      setPeers(list);
    };

    void (async () => {
      try {
        const initial = await api<{ state: string; epoch: string; kind: DraftKind }>(`/api/drafts/${draftId}/collab`);
        if (disposed) return;
        epoch.current = initial.epoch;
        setKind(initial.kind);
        applyElsewhere(fromBase64(initial.state), 'server');
        setStatus('connecting');
      } catch (cause) {
        if (disposed) return;
        setStatus('error');
        setError(cause instanceof Error ? cause.message : 'Could not open the draft for editing.');
        return;
      }

      // Private channels authorise with the signed-in session.
      await supabase.realtime.setAuth().catch(() => undefined);
      if (disposed) return;

      const presenceKey = `${latest.current.me?.id ?? 'guest'}:${Math.random().toString(36).slice(2, 8)}`;
      const room = supabase.channel(`draft:${draftId}`, { config: { private: true, broadcast: { self: false }, presence: { key: presenceKey } } });
      channel.current = room;

      room.on('broadcast', { event: 'update' }, ({ payload }) => {
        if (typeof payload?.u === 'string') applyElsewhere(fromBase64(payload.u), 'remote');
      });
      // A newcomer sends its state vector; editors answer with what it lacks,
      // which covers edits made in the last second that are not saved yet.
      room.on('broadcast', { event: 'hello' }, ({ payload }) => {
        if (!latest.current.canEdit || typeof payload?.sv !== 'string') return;
        const missing = Y.encodeStateAsUpdate(ydoc, fromBase64(payload.sv));
        if (missing.byteLength > 2) void room.send({ type: 'broadcast', event: 'update', payload: { u: toBase64(missing) } });
      });
      room.on('presence', { event: 'sync' }, () => readPeers(room));
      room.on('broadcast', { event: 'reset' }, () => {
        dirty.current = false;
        setGeneration((g) => g + 1);
      });

      room.subscribe((state) => {
        if (disposed) return;
        if (state === 'SUBSCRIBED') {
          live.current = true;
          setStatus((current) => (current === 'saving' ? current : 'live'));
          void room.send({ type: 'broadcast', event: 'hello', payload: { sv: toBase64(Y.encodeStateVector(ydoc)) } });
          publishCursor();
        } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
          live.current = false;
          setPeers([]);
          setStatus((current) => (current === 'saving' || current === 'error' ? current : 'solo'));
        }
      });
    })();

    // Save on the way out, without waiting for the pause.
    const flush = () => {
      if (!dirty.current) return;
      dirty.current = false;
      void fetch(`/api/drafts/${draftId}/collab`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: toBase64(Y.encodeStateAsUpdate(ydoc)), epoch: epoch.current }),
        keepalive: true,
      }).catch(() => undefined);
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onHide);
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      flush();
      live.current = false;
      if (channel.current) void supabase.removeChannel(channel.current);
      channel.current = null;
      ydoc.destroy();
      doc.current = null;
    };
  }, [draftId, me?.id, scheduleSave, publishCursor, generation]);

  /** Attach to the textarea. It is uncontrolled: remote edits are written straight into it. */
  const bind = useCallback((el: HTMLTextAreaElement | null) => {
    element.current = el;
    if (el && doc.current) el.value = doc.current.getText(TEXT_KEY).toString();
  }, []);

  const onInput = useCallback(() => {
    const el = element.current;
    const ydoc = doc.current;
    if (!el || !ydoc || !latest.current.canEdit) return;
    ydoc.transact(() => applyDiff(ydoc.getText(TEXT_KEY), el.value), 'local');
    setText(el.value);
    publishCursor();
  }, [publishCursor]);

  /** Replace the whole text as one edit: assists, restores, slide edits. */
  const replaceText = useCallback((next: string) => {
    const ydoc = doc.current;
    if (!ydoc || !latest.current.canEdit) return;
    ydoc.transact(() => applyDiff(ydoc.getText(TEXT_KEY), next), 'local');
    if (element.current) element.current.value = next;
    setText(next);
  }, []);

  /** Select a span in the editor, e.g. the words a comment is about. */
  const select = useCallback((start: number, end: number) => {
    const el = element.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(start, end);
  }, []);

  /**
   * After the text was reset on the server (a version restore): reopen here,
   * and tell everyone else in the room to do the same.
   */
  const reload = useCallback(() => {
    dirty.current = false;
    if (live.current) void channel.current?.send({ type: 'broadcast', event: 'reset', payload: {} });
    setGeneration((g) => g + 1);
  }, []);

  return { status, text, kind, peers, error, bind, onInput, onCursor: publishCursor, replaceText, select, saveNow: save, reload, element };
}
