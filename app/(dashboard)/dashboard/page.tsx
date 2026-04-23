'use client';

import { useEffect, useState } from 'react';
import { SidebarPane } from './SidePane'; // Adjust to './SidebarPane' if that is your filename
import { EditorPane } from './EditorPane';
import { LiveRender } from './LiveRender';
import { WarRoomPane } from './WarRoomPane'; // NEW Multi-Agent Component
import { useAppStore } from '@/lib/store';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DashboardController() {
  const store = useAppStore();
  const [mounted, setMounted] = useState(false);

  // ==========================================
  // SETTINGS MODAL STATE
  // ==========================================
  const [showSettings, setShowSettings] = useState(false); 
  const [localKey, setLocalKey] = useState('');
  const [localProvider, setLocalProvider] = useState<'openai' | 'anthropic'>('openai');

  useEffect(() => {
    setMounted(true);
    
    // Hydrate the settings from your store on load
    setLocalKey(store.apiKey);
    setLocalProvider(store.llmProvider);
    
    // ========================================================
    // PRODUCTION MODE
    // In production, user and plan data will come from your 
    // Supabase/Auth database fetch here.
    // e.g., store.setUser(data.user); store.setPlan(data.plan);
    // ========================================================
  }, []); // <--- Empty array prevents the infinite loop!

  // Function to save your API keys
  const saveSettings = () => {
    store.setApiKey(localKey);
    store.setLlmProvider(localProvider);
    setShowSettings(false);
    toast.success('API Configuration Saved.');
  };

  if (!mounted) return null;

  return (
    <div className="flex h-screen w-full bg-[#FAFAFA] text-gray-900 font-sans relative overflow-hidden">
      
      {/* Sidebar */}
      <SidebarPane onOpenSettings={() => setShowSettings(true)} />

      {/* ========================================================
          DYNAMIC LEFT SIDE: Editor vs. Enterprise War Room
          Takes full width if Render is closed
          ======================================================== */}
      <div 
        className={`flex-1 min-w-[500px] flex flex-col transition-all duration-300 ease-in-out ${
          store.isLiveRenderOpen ? 'border-r border-gray-200' : ''
        }`}
      >
        {store.activeTool === 'war_room' ? <WarRoomPane /> : <EditorPane />}
      </div>

      {/* ========================================================
          RIGHT SIDE: Live Mockup Engine
          Collapsible based on store state
          ======================================================== */}
      <div 
        className={`transition-all duration-300 ease-in-out overflow-hidden bg-[#F9FAFB] flex flex-col ${
          store.isLiveRenderOpen ? 'w-[45%] opacity-100' : 'w-0 opacity-0 border-none'
        }`}
      >
        <div className="w-full h-full min-w-[400px]">
          <LiveRender />
        </div>
      </div>

      {/* ========================================================
          THE SETTINGS MODAL UI (Light Mode)
          ======================================================== */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900/20 backdrop-blur-sm p-4">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-[500px] shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-[16px] font-semibold text-gray-900">API Configuration</h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-900 transition bg-gray-50 hover:bg-gray-100 p-1.5 rounded-md">
                <X className="w-4 h-4"/>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Provider</label>
                <select 
                  value={localProvider} 
                  onChange={(e) => setLocalProvider(e.target.value as any)} 
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-[14px] text-gray-900 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-shadow"
                >
                  <option value="openai">OpenAI (GPT-4o)</option>
                  <option value="anthropic">Anthropic (Claude 3.5)</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Secret API Key</label>
                <input 
                  type="password" 
                  value={localKey} 
                  onChange={(e) => setLocalKey(e.target.value)} 
                  placeholder="sk-..." 
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-[14px] text-gray-900 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-shadow" 
                />
                <p className="text-[11px] text-gray-400 mt-2">Stored securely in your local browser storage. Never sent to our servers.</p>
              </div>
              <button 
                onClick={saveSettings} 
                className="w-full bg-gray-900 text-white font-medium text-[14px] py-3 rounded-lg mt-4 hover:bg-gray-800 shadow-sm transition"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}