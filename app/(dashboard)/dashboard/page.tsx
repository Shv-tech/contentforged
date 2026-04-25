'use client';

import { useEffect, useState } from 'react';
import { SidebarPane } from './SidePane'; 
import { EditorPane } from './EditorPane';
import { LiveRender } from './LiveRender';
import { WarRoomPane } from './WarRoomPane'; 
import { useAppStore } from '@/lib/store';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
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
  const [isCanceling, setIsCanceling] = useState(false); // NEW: Cancellation loading state

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
  }, []); 

  // Function to save your API keys
  const saveSettings = () => {
    store.setApiKey(localKey);
    store.setLlmProvider(localProvider);
    setShowSettings(false);
    toast.success('API Configuration Saved.');
  };

  // NEW: Function to handle subscription cancellation
  const handleCancel = async () => {
    if (!confirm('Are you sure? You will immediately lose access to all premium tools.')) return;
    
    setIsCanceling(true);
    const toastId = toast.loading('Canceling subscription...');

    try {
      const res = await fetch('/api/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: store.user?.id }),
      });

      if (!res.ok) throw new Error('Failed to cancel.');

      store.setPlan('free'); // Instantly lock the UI globally
      toast.success('Workspace downgraded to Basic.', { id: toastId });
      setShowSettings(false);
    } catch (error) {
      toast.error('Could not process cancellation.', { id: toastId });
    } finally {
      setIsCanceling(false);
    }
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
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-[500px] shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h3 className="text-[16px] font-semibold text-gray-900">Workspace Settings</h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-900 transition bg-gray-50 hover:bg-gray-100 p-1.5 rounded-md">
                <X className="w-4 h-4"/>
              </button>
            </div>
            
            <div className="p-5 space-y-6">
              
              {/* API CONFIGURATION SECTION */}
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
                className="w-full bg-gray-900 text-white font-medium text-[14px] py-3 rounded-lg hover:bg-gray-800 shadow-sm transition"
              >
                Save Configuration
              </button>

              <hr className="border-gray-100" />

              {/* DANGER ZONE / BILLING SECTION */}
              <div>
                <h3 className="text-[12px] font-bold text-red-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5" /> Danger Zone
                </h3>
                
                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[14px] font-medium text-red-900">Current Plan</span>
                    <span className="text-[11px] font-bold bg-white text-red-600 px-2 py-1 rounded shadow-sm uppercase tracking-wider">
                      {store.plan === 'free' ? 'BASIC' : store.plan}
                    </span>
                  </div>
                  
                  {store.plan !== 'free' ? (
                    <button 
                      onClick={handleCancel}
                      disabled={isCanceling}
                      className="w-full bg-red-600 text-white text-[13px] font-medium py-2.5 rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2 disabled:opacity-70 mt-2"
                    >
                      {isCanceling ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cancel Subscription'}
                    </button>
                  ) : (
                    <p className="text-[12px] text-red-700 leading-relaxed mt-1">
                      You are currently on the basic plan. No active subscription found. Upgrade from the sidebar to access premium tools.
                    </p>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}