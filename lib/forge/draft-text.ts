/**
 * lib/forge/draft-text.ts
 *
 * The readable text of a draft. Shared by server and client, so it lives
 * apart from the data layer (which imports server-only modules).
 */

import { joinSegments } from './text';
import type { DraftRecord } from './types';

/** The text of a draft as it would be read: segments joined for threads. */
export function draftText(draft: Pick<DraftRecord, 'kind' | 'body' | 'segments'>): string {
  return draft.kind === 'thread' && draft.segments.length > 0 ? joinSegments(draft.segments) : draft.body;
}
