'use client';

/**
 * lib/forge/client.ts
 *
 * Browser-side helpers: a typed fetch wrapper, the drafts cache, and the
 * NDJSON stream reader for /api/chat.
 */

import { create } from 'zustand';
import { useAppStore } from '@/lib/store';
import type { ChatStreamEvent, DraftRecord, ForgeProfile, WritingLanguage } from './types';
import type { RuleSuggestion } from './learning';
import type { StoredFingerprint } from './data/voice';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: Record<string, unknown> = {}
  ) {
    super(message);
  }

  get isUpsell(): boolean {
    return this.status === 402;
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const response = await fetch(path, {
    ...rest,
    headers: {
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: 'no-store',
  });

  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text };
  }

  if (!response.ok) {
    const message = typeof body.error === 'string' ? body.error : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status, body);
  }
  return body as T;
}

// ============================================================================
// DRAFTS CACHE
// ============================================================================

interface DraftState {
  drafts: Record<string, DraftRecord>;
  /** Draft open in the preview panel. */
  previewId: string | null;
  /**
   * Unsaved text of drafts being edited, so the preview panel follows the
   * card keystroke by keystroke instead of waiting for the save.
   */
  working: Record<string, string>;
  setWorking: (id: string, text: string | null) => void;
  suggestions: RuleSuggestion[];
  upsert: (draft: DraftRecord) => void;
  remove: (id: string) => void;
  setPreview: (id: string | null) => void;
  setSuggestions: (suggestions: RuleSuggestion[]) => void;
  ensure: (ids: string[]) => Promise<void>;
}

const inflight = new Set<string>();

export const useDraftStore = create<DraftState>()((set, get) => ({
  drafts: {},
  previewId: null,
  working: {},
  suggestions: [],
  setWorking: (id, text) =>
    set((state) => {
      const next = { ...state.working };
      if (text === null) delete next[id];
      else next[id] = text;
      return { working: next };
    }),
  upsert: (draft) => set((state) => ({ drafts: { ...state.drafts, [draft.id]: draft } })),
  remove: (id) =>
    set((state) => {
      const next = { ...state.drafts };
      delete next[id];
      return { drafts: next, previewId: state.previewId === id ? null : state.previewId };
    }),
  setPreview: (previewId) => {
    set({ previewId });
    // Opening a preview opens the panel it renders in. Closing one leaves
    // the panel as the user arranged it.
    if (previewId) useAppStore.getState().setLiveRenderOpen(true);
  },
  setSuggestions: (suggestions) => set({ suggestions }),
  ensure: async (ids) => {
    const missing = ids.filter((id) => !get().drafts[id] && !inflight.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => inflight.add(id));
    try {
      const { drafts } = await api<{ drafts: DraftRecord[] }>(`/api/drafts?ids=${missing.join(',')}`);
      set((state) => {
        const next = { ...state.drafts };
        for (const draft of drafts) next[draft.id] = draft;
        return { drafts: next };
      });
    } finally {
      missing.forEach((id) => inflight.delete(id));
    }
  },
}));

// ============================================================================
// CHAT STREAM
// ============================================================================

/**
 * Reads an NDJSON response body and calls `onEvent` for each event.
 * Resolves when the stream ends. Tolerates events split across chunks.
 */
export async function readEventStream(response: Response, onEvent: (event: ChatStreamEvent) => void): Promise<void> {
  return readNdjson<ChatStreamEvent>(response, onEvent);
}

/** Generic NDJSON reader shared by the chat and War Room streams. */
export async function readNdjson<T>(response: Response, onEvent: (event: T) => void): Promise<void> {
  if (!response.body) throw new Error('The response had no body.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        onEvent(JSON.parse(line) as T);
      } catch {
        // A malformed line is skipped rather than aborting the whole turn.
      }
    }
  }

  const tail = buffer.trim();
  if (tail) {
    try {
      onEvent(JSON.parse(tail) as T);
    } catch {
      // Ignore a truncated final line.
    }
  }
}

// ============================================================================
// VOICE
// ============================================================================

interface VoiceState {
  loaded: boolean;
  loading: boolean;
  fingerprint: StoredFingerprint | null;
  bannedPhrases: string[];
  xAvailable: boolean;
  load: (force?: boolean) => Promise<void>;
  set: (fingerprint: StoredFingerprint | null) => void;
}

/**
 * The user's fingerprint, loaded once per session and shared by every draft
 * card so each keystroke can be scored locally without a network call.
 */
export const useVoiceStore = create<VoiceState>()((set, get) => ({
  loaded: false,
  loading: false,
  fingerprint: null,
  bannedPhrases: [],
  xAvailable: false,
  load: async (force = false) => {
    if ((get().loaded || get().loading) && !force) return;
    set({ loading: true });
    try {
      const data = await api<{ fingerprint: StoredFingerprint | null; bannedPhrases: string[]; xAvailable: boolean }>('/api/voice');
      set({ fingerprint: data.fingerprint, bannedPhrases: data.bannedPhrases, xAvailable: data.xAvailable, loaded: true });
    } catch {
      set({ loaded: true });
    } finally {
      set({ loading: false });
    }
  },
  set: (fingerprint) => set({ fingerprint }),
}));

// ============================================================================
// PLATFORM CONNECTIONS
// ============================================================================

export interface ConnectionSummary {
  platform: 'linkedin' | 'threads' | 'bluesky';
  account_handle: string | null;
  account_name: string | null;
  scopes: string[];
  expires_at: string | null;
}

interface ConnectionsState {
  loaded: boolean;
  connections: ConnectionSummary[];
  xHandle: string | null;
  load: (force?: boolean) => Promise<void>;
}

export const useConnectionsStore = create<ConnectionsState>()((set, get) => ({
  loaded: false,
  connections: [],
  xHandle: null,
  load: async (force = false) => {
    if (get().loaded && !force) return;
    try {
      const data = await api<{ connections: ConnectionSummary[]; xHandle: string | null }>('/api/connections');
      set({ connections: data.connections, xHandle: data.xHandle, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));

// ============================================================================
// WORKSPACES
// ============================================================================

export interface WorkspaceSummary {
  id: string;
  owner_id: string;
  name: string;
  kind: 'client' | 'company';
  writing_language: WritingLanguage;
  brand_dna: string | null;
  client_email: string | null;
  role: 'owner' | 'editor' | 'reviewer' | 'client';
  created_at: string;
  updated_at: string;
}

interface WorkspaceState {
  loaded: boolean;
  /** Whether there is any workspace to switch to, or the plan allows creating one. */
  available: boolean;
  /** Whether the user's own plan allows creating workspaces. */
  canCreate: boolean;
  /** Null is the user's personal brand. */
  activeId: string | null;
  workspaces: WorkspaceSummary[];
  load: (force?: boolean) => Promise<void>;
  switchTo: (id: string | null) => Promise<void>;
  create: (name: string, clientEmail?: string | null, kind?: WorkspaceSummary['kind']) => Promise<WorkspaceSummary>;
  update: (id: string, patch: Partial<Pick<WorkspaceSummary, 'name' | 'brand_dna' | 'client_email' | 'kind' | 'writing_language'>>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/** Fired after the active brand changes, so views holding brand data reload. */
export const WORKSPACE_CHANGED_EVENT = 'forge-workspace-changed';

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  loaded: false,
  available: false,
  canCreate: false,
  activeId: null,
  workspaces: [],
  load: async (force = false) => {
    if (get().loaded && !force) return;
    try {
      const data = await api<{ available: boolean; canCreate: boolean; activeId: string | null; workspaces: WorkspaceSummary[] }>('/api/workspaces');
      set({ ...data, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  switchTo: async (id) => {
    if (get().activeId === id) return;
    await api('/api/workspaces/active', { method: 'POST', json: { id } });
    set({ activeId: id });

    // Everything cached on the client belongs to the previous brand.
    useDraftStore.setState({ drafts: {}, previewId: null, working: {}, suggestions: [] });
    useVoiceStore.setState({ loaded: false, fingerprint: null, bannedPhrases: [] });
    void useVoiceStore.getState().load(true);
    useAppStore.getState().setActiveSessionId(null);
    window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT));
    window.dispatchEvent(new Event('refresh-sidebar'));
  },
  create: async (name, clientEmail = null, kind = 'client') => {
    const { workspace } = await api<{ workspace: WorkspaceSummary }>('/api/workspaces', { method: 'POST', json: { name, client_email: clientEmail, kind } });
    set((state) => ({ workspaces: [...state.workspaces, workspace] }));
    return workspace;
  },
  update: async (id, patch) => {
    const { workspace } = await api<{ workspace: WorkspaceSummary }>(`/api/workspaces/${id}`, { method: 'PATCH', json: patch });
    set((state) => ({ workspaces: state.workspaces.map((w) => (w.id === id ? workspace : w)) }));
  },
  remove: async (id) => {
    const wasActive = get().activeId === id;
    await api(`/api/workspaces/${id}`, { method: 'DELETE' });
    set((state) => ({ workspaces: state.workspaces.filter((w) => w.id !== id) }));
    if (wasActive) {
      set({ activeId: null });
      window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT));
      window.dispatchEvent(new Event('refresh-sidebar'));
    }
  },
}));

// ============================================================================
// PROFILE
// ============================================================================

interface ProfileState {
  loaded: boolean;
  profile: ForgeProfile | null;
  load: (force?: boolean) => Promise<void>;
  update: (patch: Partial<Omit<ForgeProfile, 'onboarded_at'>> & { onboarded?: true }) => Promise<ForgeProfile>;
}

export const useProfileStore = create<ProfileState>()((set, get) => ({
  loaded: false,
  profile: null,
  load: async (force = false) => {
    if (get().loaded && !force) return;
    try {
      const data = await api<{ profile: ForgeProfile }>('/api/profile');
      set({ profile: data.profile, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  update: async (patch) => {
    const { profile } = await api<{ profile: ForgeProfile }>('/api/profile', { method: 'PATCH', json: patch });
    set({ profile });
    if ('x_handle' in patch) void useConnectionsStore.getState().load(true);
    return profile;
  },
}));

// ============================================================================
// ACTIVE BRAND
// ============================================================================

export interface ActiveBrand {
  /** Null for the personal brand. */
  workspace: WorkspaceSummary | null;
  /** The personal brand is always the owner's. */
  role: WorkspaceSummary['role'];
  canEdit: boolean;
  name: string;
}

/** The brand the app is acting for, and what the signed-in person may do there. */
export function useActiveBrand(): ActiveBrand {
  const activeId = useWorkspaceStore((s) => s.activeId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const workspace = activeId ? (workspaces.find((w) => w.id === activeId) ?? null) : null;
  const role = workspace?.role ?? 'owner';
  return { workspace, role, canEdit: role === 'owner' || role === 'editor', name: workspace?.name ?? 'Personal' };
}

/**
 * Re-runs `load` when the active brand changes. Views call this instead of
 * wiring the workspace event themselves.
 */
export function onBrandChange(load: () => void): () => void {
  window.addEventListener(WORKSPACE_CHANGED_EVENT, load);
  return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, load);
}
