import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LLMProvider, Platform, PlatformOutput } from '@/types';

interface AppState {
  user: { id: string; email: string } | null;
  // strictly typed plans for the 25-tool gatekeeping
  plan: 'free' | 'tier1' | 'tier2' | 'tier3'; 
  creditsRemaining: number;
  apiKey: string;
  llmProvider: LLMProvider;
  inputType: 'text' | 'url' | 'youtube';
  inputContent: string;
  tone: string;
  selectedPlatforms: Platform[];
  isGenerating: boolean;
  outputs: PlatformOutput[];
  activeTool: string | null;
  
  // State variables to hold the rendered canvas data
  renderContent: string | null;
  renderPlatform: 'linkedin' | 'twitter' | null;
  isLiveRenderOpen: boolean; // Controls the panel visibility

  // NEW: Multi-Agent War Room State
  warRoomStatus: 'idle' | 'strategist' | 'writer' | 'redteam' | 'done';

  setUser: (user: { id: string; email: string } | null) => void;
  setPlan: (plan: 'free' | 'tier1' | 'tier2' | 'tier3') => void;
  setCredits: (credits: number) => void;
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
  
  // Function signature to update the render data
  setRenderData: (content: string, platform: 'linkedin' | 'twitter') => void;
  toggleLiveRender: (isOpen?: boolean) => void; // Toggle function
  
  // NEW: Update War Room UI
  setWarRoomStatus: (status: AppState['warRoomStatus']) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      plan: 'free', // Production default. Requires auth/payment to upgrade.
      creditsRemaining: 10,
      apiKey: '',
      llmProvider: 'openai',
      inputType: 'text',
      inputContent: '',
      tone: 'professional',
      selectedPlatforms: ['linkedin', 'twitter'],
      isGenerating: false,
      outputs: [],
      activeTool: null,
      
      // Initial values for the render data
      renderContent: null,
      renderPlatform: null,
      isLiveRenderOpen: false, // Default to closed so user has full chat area
      
      // Initial value for war room
      warRoomStatus: 'idle',

      setUser: (user) => set({ user }),
      setPlan: (plan) => set({ plan }),
      setCredits: (credits) => set({ creditsRemaining: credits }),
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
      
      // Function implementation to update the render state
      setRenderData: (content, platform) => set({ 
        renderContent: content, 
        renderPlatform: platform,
        isLiveRenderOpen: true // Auto-opens when data is pushed
      }),
      toggleLiveRender: (isOpen) => set((state) => ({ 
        isLiveRenderOpen: isOpen !== undefined ? isOpen : !state.isLiveRenderOpen 
      })),
      
      // Update war room state
      setWarRoomStatus: (status) => set({ warRoomStatus: status }),
    }),
    {
      name: 'contentforge-production-storage',
      // The partialize function ensures we don't save temporary things to local storage
      partialize: (state) => ({
        apiKey: state.apiKey,
        llmProvider: state.llmProvider,
        tone: state.tone,
        selectedPlatforms: state.selectedPlatforms,
      }),
    }
  )
);