/**
 * lib/forge/agent/history.ts
 *
 * Turns the stored transcript into what the model reads.
 *
 * Rich content is persisted as fenced marker blocks (```forge-draft {...}```)
 * so the client can render cards from plain message text. The model cannot
 * read a draft from its id, so before each turn the markers are expanded:
 * a draft marker becomes the draft's current text (including any edits the
 * user made since), a questions marker becomes the questions asked, and so on.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatMessage } from '@/lib/ai/anthropic';
import { DRAFT_COLUMNS, draftText } from '../data/drafts';
import { MARKER, PLATFORM_NAMES, type ClarifyingQuestion, type DraftRecord, type Grade, type PlanProposal } from '../types';

export interface ClientMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MARKER_PATTERN = /```(forge-[a-z]+)\n([\s\S]*?)\n```/g;

/** Max messages sent per turn. Older turns are dropped from the front. */
const MAX_HISTORY = 40;

function safeParse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function collectDraftIds(messages: ClientMessage[]): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    MARKER_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = MARKER_PATTERN.exec(message.content)) !== null) {
      if (match[1] !== MARKER.draft) continue;
      const parsed = safeParse<{ id?: string }>(match[2]);
      if (parsed?.id) ids.add(parsed.id);
    }
  }
  return Array.from(ids);
}

export async function loadDrafts(db: SupabaseClient, userId: string, ids: string[]): Promise<Map<string, DraftRecord>> {
  if (ids.length === 0) return new Map();
  const { data } = await db.from('drafts').select(DRAFT_COLUMNS).eq('user_id', userId).in('id', ids.slice(0, 100));
  return new Map(((data ?? []) as DraftRecord[]).map((draft) => [draft.id, draft]));
}

function expandMarker(language: string, json: string, drafts: Map<string, DraftRecord>): string {
  switch (language) {
    case MARKER.draft: {
      const id = safeParse<{ id?: string }>(json)?.id;
      const draft = id ? drafts.get(id) : undefined;
      if (!draft) return '[A draft was shown here; it has since been deleted.]';
      const attributes = [
        `id="${draft.id}"`,
        `platform="${PLATFORM_NAMES[draft.platform]}"`,
        `kind="${draft.kind}"`,
        draft.grade ? `grade="${draft.grade.score}/50"` : null,
        draft.status !== 'draft' ? `status="${draft.status}"` : null,
      ].filter(Boolean);
      return `<draft ${attributes.join(' ')}>\n${draftText(draft)}\n</draft>`;
    }
    case MARKER.questions: {
      const payload = safeParse<{ intro: string | null; questions: ClarifyingQuestion[] }>(json);
      if (!payload) return '';
      return `[I asked the user: ${payload.questions.map((q) => q.question).join(' / ')}]`;
    }
    case MARKER.plan: {
      const plan = safeParse<PlanProposal>(json);
      if (!plan) return '';
      return `[I proposed a plan, "${plan.title}":\n${plan.items.map((item, i) => `${i + 1}. ${item}`).join('\n')}]`;
    }
    case MARKER.memory: {
      const memory = safeParse<{ kind: string; label: string }>(json);
      return memory ? `[Saved ${memory.kind === 'rule' ? 'writing rule' : 'to Story Bank'}: ${memory.label}]` : '';
    }
    case MARKER.grade: {
      const payload = safeParse<{ grade: Grade }>(json);
      return payload ? `[Grade: ${payload.grade.score}/50. Weakest: ${payload.grade.weakest}]` : '';
    }
    default:
      return '';
  }
}

export function expandAssistantContent(content: string, drafts: Map<string, DraftRecord>): string {
  return content
    .replace(MARKER_PATTERN, (_whole, language: string, json: string) => expandMarker(language, json, drafts))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Builds the API message list from the client transcript, minus the final
 * user message (which the route assembles separately with attachments).
 *
 * The API requires strictly alternating roles starting with "user". Stored
 * transcripts can break that (a stopped generation, a failed save), so
 * adjacent same-role messages are merged rather than rejected.
 */
export function toApiHistory(messages: ClientMessage[], drafts: Map<string, DraftRecord>): ChatMessage[] {
  const trimmed = messages.slice(-MAX_HISTORY);
  const result: ChatMessage[] = [];

  for (const message of trimmed) {
    const text = message.role === 'assistant' ? expandAssistantContent(message.content, drafts) : message.content;
    if (!text.trim()) continue;

    const last = result[result.length - 1];
    if (last && last.role === message.role && typeof last.content === 'string') {
      last.content = `${last.content}\n\n${text}`;
    } else {
      result.push({ role: message.role, content: text });
    }
  }

  while (result.length > 0 && result[0].role !== 'user') result.shift();
  return result;
}
