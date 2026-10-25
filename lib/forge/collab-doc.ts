/**
 * lib/forge/collab-doc.ts
 *
 * The live-editing document behind a draft: a Yjs CRDT holding the draft's
 * text, shared by everyone editing it at once. Peers exchange updates over a
 * Supabase Realtime channel; the server keeps the merged state, so a person
 * who opens the draft later starts from everyone's edits, and two people
 * typing at once never overwrite each other.
 *
 * Shared by browser and server: the encoding helpers work on Uint8Array and
 * base64 without Node's Buffer.
 *
 * Threads are edited as one text with "---" on its own line between posts,
 * which survives blank lines inside a post.
 */

import * as Y from 'yjs';
import { joinSegments } from './text';
import type { DraftKind, DraftRecord } from './types';

export const TEXT_KEY = 'draft';
export const THREAD_BREAK = '\n\n---\n\n';
/** A stored document larger than this is rebuilt from its text, dropping old history. */
export const MAX_STATE_BYTES = 1_000_000;

export function collabTextOf(draft: Pick<DraftRecord, 'kind' | 'body' | 'segments'>): string {
  return draft.kind === 'thread' && draft.segments.length > 0 ? draft.segments.join(THREAD_BREAK) : draft.body;
}

export function fromCollabText(kind: DraftKind, text: string): { body: string; segments: string[] } {
  if (kind !== 'thread') return { body: text, segments: [] };
  const segments = text
    .split(/\n[ \t]*---[ \t]*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { body: joinSegments(segments), segments };
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A fresh document holding `text`, as an encoded state. */
export function initialState(text: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getText(TEXT_KEY).insert(0, text);
  const state = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return state;
}

/**
 * Merges an incoming state into the stored one. CRDT merging is commutative
 * and idempotent, so the order states arrive in never matters.
 */
export function mergeStates(stored: Uint8Array | null, incoming: Uint8Array): { state: Uint8Array; text: string } {
  const doc = new Y.Doc();
  try {
    if (stored) Y.applyUpdate(doc, stored);
    Y.applyUpdate(doc, incoming);
    let text = doc.getText(TEXT_KEY).toString();
    let state = Y.encodeStateAsUpdate(doc);
    if (state.byteLength > MAX_STATE_BYTES) {
      state = initialState(text);
      text = doc.getText(TEXT_KEY).toString();
    }
    return { state, text };
  } finally {
    doc.destroy();
  }
}
