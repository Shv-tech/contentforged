// lib/store.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LLMProvider, Platform, PlatformOutput } from '@/types';
import type { PlanId } from '@/lib/billing/plans';

/**
 * ENTITLEMENT IS NOT CLIENT STATE.
 *
 * `plan` and `quota` below are a display cache, refreshed from
 * /api/billing/status. They are deliberately excluded from `partialize`, so
 * they are never written to localStorage.
 *
 * The previous store persisted `creditsRemaining`, which meant a user could
 * edit their own entitlement in devtools. It was display-only at the time, but
 * a persisted value that looks authoritative eventually gets treated as
 * authoritative by some future code path. Removing it closes that door.
 *
 * Every enforcement decision happens server-side against the database. If this
 * cache disagrees with the server, the server wins and the UI is stale by at
 * most one fetch.
 */

export interface QuotaState {
  windowUsed: number;
  windowBudget: number;
  windowResetsAt: string | null;
  monthlyUsed: number;
  monthlyBudget: number;
  monthlyResetsAt: string | null;
  ebooksUsed: number;
  ebooksAllowed: number;
}

export interface SubscriptionState {
  status: string;
  currency: 'INR' | 'USD';
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  graceUntil: string | null;
}

/**
 * The signed-in user as the client needs it.
 *
 * `fullName` is a first-class field rather than something read out of
 * `user_metadata`. The previous shape was `{ id, email }` only, so every
 * `(user as any).user_metadata?.full_name` in the app resolved to undefined
 * and silently fell back to the email prefix. The name was saved to Supabase
 * correctly and then had nowhere to live on the client.
 */
export interface AppUser {
  id: string;
  email: string;
  fullName: string | null;
}

interface AppState {
  user: AppUser | null;

  /**
   * Canonical plan vocabulary, matching the `plan_id` enum in Postgres and
   * lib/billing/plans.ts. Previously this was 'basic' | 'tier1' | 'tier2' |
   * 'tier3' while the account page compared against 'Pro Plus' and
   * 'enterprise' — three vocabularies for one concept, none of which agreed.
   */
  plan: PlanId;
  quota: QuotaState | null;
  subscription: SubscriptionState | null;

  apiKey: string;
  llmProvider: LLMProvider;

  inputType: 'text' | 'url' | 'youtube';
  inputContent: string;
  tone: string;
  selectedPlatforms: Platform[];
  isGenerating: boolean;
  outputs: PlatformOutput[];
  activeTool: string | null;

  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  sidebarView: 'chat' | 'search' | 'ebooks' | 'calendar';
  setSidebarView: (view: AppState['sidebarView']) => void;

  renderContent: string | null;
  renderPlatform: 'linkedin' | 'twitter' | 'ebook' | 'facebook' | null;
  isLiveRenderOpen: boolean;

  warRoomStatus: 'idle' | 'strategist' | 'writer' | 'redteam' | 'done';

  messages: any[];
  setMessages: (messages: any[]) => void;

  chatHistory: Record<string, any[]>;
  setChatHistory: (sessionId: string, messages: any[]) => void;

  setUser: (user: AppUser | null) => void;
  /** Updates the display name without discarding the rest of the user. */
  setUserFullName: (fullName: string | null) => void;
  setPlan: (plan: PlanId) => void;
  setQuota: (quota: QuotaState | null) => void;
  setSubscription: (subscription: SubscriptionState | null) => void;
  /** Applies the quota snapshot returned by /api/chat after each generation. */
  applyQuotaSnapshot: (snapshot: Partial<QuotaState>) => void;

  setApiKey: (key: string) => void;
  setLlmProvider: (provider: LLMProvider) => void;
  setInputType: (type: 'text' | 'url' | 'youtube') => void;
  setInputContent: (content: string) => void;
  setTone: (tone: string) => void;
  togglePlatform: (platform: Platform) => void;
  setIsGenerating: (isGenerating: boolean) => void;
  setOutputs: (outputs: PlatformOutput[]) => void;
  clearOutputs: () => void;
  setActiveTool: (toolId: string | null) => void;

  setRenderData: (content: string, platform: 'linkedin' | 'twitter' | 'ebook' | 'facebook') => void;
  toggleLiveRender: (isOpen?: boolean) => void;
  setLiveRenderOpen: (isOpen: boolean) => void;

  setWarRoomStatus: (status: AppState['warRoomStatus']) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      plan: 'free',
      quota: null,
      subscription: null,

      apiKey: '',
      llmProvider: 'openai',
      inputType: 'text',
      inputContent: '',
      tone: 'professional',
      selectedPlatforms: ['linkedin', 'twitter'],
      isGenerating: false,
      outputs: [],
      activeTool: null,

      activeSessionId: null,
      setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
      isSidebarOpen: true,
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      sidebarView: 'chat',
      setSidebarView: (sidebarView) => set({ sidebarView }),

      renderContent: null,
      renderPlatform: null,
      isLiveRenderOpen: false,

      warRoomStatus: 'idle',

      messages: [],
      setMessages: (messages) => set({ messages }),

      chatHistory: {},
      setChatHistory: (sessionId, messages) => set((state) => ({
        chatHistory: { ...state.chatHistory, [sessionId]: messages }
      })),

      setUser: (user) => set({ user }),
      setUserFullName: (fullName) => set((state) => ({
        user: state.user ? { ...state.user, fullName } : null,
      })),
      setPlan: (plan) => set({ plan }),
      setQuota: (quota) => set({ quota }),
      setSubscription: (subscription) => set({ subscription }),

      applyQuotaSnapshot: (snapshot) => set((state) => {
        if (!state.quota) return {};
        return {
          quota: {
            ...state.quota,
            ...snapshot,
          },
        };
      }),

      setApiKey: (apiKey) => set({ apiKey }),
      setLlmProvider: (llmProvider) => set({ llmProvider }),
      setInputType: (inputType) => set({ inputType, inputContent: '' }),
      setInputContent: (inputContent) => set({ inputContent }),
      setTone: (tone) => set({ tone }),
      togglePlatform: (platform) =>
        set((state) => ({
          selectedPlatforms: state.selectedPlatforms.includes(platform)
            ? state.selectedPlatforms.filter((p) => p !== platform)
            : [...state.selectedPlatforms, platform],
        })),
      setIsGenerating: (isGenerating) => set({ isGenerating }),
      setOutputs: (outputs) => set({ outputs }),
      clearOutputs: () => set({ outputs: [] }),
      setActiveTool: (activeTool) => set({ activeTool }),

      setRenderData: (content, platform) => set({
        renderContent: content,
        renderPlatform: platform,
        isLiveRenderOpen: true
      }),

      toggleLiveRender: (isOpen) => set((state) => ({
        isLiveRenderOpen: isOpen !== undefined ? isOpen : !state.isLiveRenderOpen
      })),

      setLiveRenderOpen: (isOpen) => set({ isLiveRenderOpen: isOpen }),

      setWarRoomStatus: (status) => set({ warRoomStatus: status }),
    }),
    {
      name: 'forge-production-storage',
      // Only durable UI preferences and chat history are persisted.
      // `plan`, `quota`, and `subscription` are excluded on purpose: they are
      // entitlement state, and entitlement must never be writable by the
      // client. They are refetched from /api/billing/status on load.
      partialize: (state) => ({
        apiKey: state.apiKey,
        llmProvider: state.llmProvider,
        tone: state.tone,
        selectedPlatforms: state.selectedPlatforms,
        activeSessionId: state.activeSessionId,
        renderContent: state.renderContent,
        renderPlatform: state.renderPlatform,
        isLiveRenderOpen: state.isLiveRenderOpen,
        messages: state.messages,
        chatHistory: state.chatHistory,
      }),
    }
  )
);