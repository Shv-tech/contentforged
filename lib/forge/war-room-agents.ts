/**
 * lib/forge/war-room-agents.ts
 *
 * The War Room's roles and stream events. Client-safe: the pane imports this
 * without pulling in the server-side run.
 */

import type { ResearchResult } from './research';
import type { DraftRecord } from './types';

export type WarRoomAgent = 'researcher' | 'strategist' | 'writer' | 'red_team' | 'editor';

export const WAR_ROOM_AGENTS: ReadonlyArray<{ id: WarRoomAgent; name: string; role: string }> = [
  { id: 'researcher', name: 'Researcher', role: 'Reads what is being said about this right now' },
  { id: 'strategist', name: 'Strategist', role: 'Picks the audience and the one angle worth betting on' },
  { id: 'writer', name: 'Writer', role: 'Writes the posts in your voice' },
  { id: 'red_team', name: 'Red Team', role: 'Attacks every post for weak, generic or unsupported lines' },
  { id: 'editor', name: 'Editor', role: 'Fixes what the Red Team found and grades the result' },
];

export type WarRoomEvent =
  | { type: 'agent'; agent: WarRoomAgent; state: 'active' | 'done' | 'skipped'; note?: string }
  | { type: 'notes'; agent: WarRoomAgent; markdown: string }
  | { type: 'sources'; sources: ResearchResult['sources'] }
  | { type: 'draft'; draft: DraftRecord }
  | { type: 'done'; sessionId: string | null; brief: string }
  | { type: 'error'; message: string; status?: number };
