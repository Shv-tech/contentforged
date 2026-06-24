'use client';

import { useEffect, useState } from 'react';
import { SidebarPane } from './SidePane'; 
import { EditorPane } from './EditorPane';
import { LiveRender } from './LiveRender';
import { WarRoomPane } from './WarRoomPane'; 
import { SearchPane } from './SearchPane';
import { MyEbooksPane } from './MyEbooksPane';
import { CalendarPane } from './CalendarPane';
import { useAppStore } from '@/lib/store';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import SwarmCanvas from './SwarmCanvas';
import { createClient } from '@/lib/supabase/client';

export default function DashboardController() {
  const store = useAppStore();
  const [mounted, setMounted] = useState(false);

  const [showSettings, setShowSettings] = useState(false); 
  const [localKey, setLocalKey] = useState('');
  const [localProvider, setLocalProvider] = useState<'openai' | 'anthropic'>('openai');
  const [isCanceling, setIsCanceling] = useState(false);
  
  const [livePlanName, setLivePlanName] = useState<string>('Loading...');
  const [isFetchingPlan, setIsFetchingPlan] = useState(false);

  useEffect(() => {
    setMounted(true);
    setLocalKey(store.apiKey);
    setLocalProvider(store.llmProvider);
  }, [store.apiKey, store.llmProvider]); 

  useEffect(() => {
    if (showSettings) {
      const fetchLiveSubscription = async () => {
        setIsFetchingPlan(true);
        const supabase = createClient();
        
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('plan_type')
              .eq('id', user.id)
              .single();
              
            const currentPlan = profile?.plan_type || 'free';
            setLivePlanName(currentPlan);
            store.setPlan(currentPlan);
          }
        } catch (error) {
          console.error("Failed to fetch live plan:", error);
          setLivePlanName('error');
        } finally {
          setIsFetchingPlan(false);
        }
      };
      
      fetchLiveSubscription();
    }
  }, [showSettings, store]);

  const saveSettings = () => {
    store.setApiKey(localKey);
    store.setLlmProvider(localProvider);
    setShowSettings(false);
    toast.success('API Configuration Saved.');
  };

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

      setLivePlanName('free');
      store.setPlan('free'); 
      toast.success('Workspace downgraded successfully.', { id: toastId });
    } catch (error) {
      toast.error('Could not process cancellation.', { id: toastId });
    } finally {
      setIsCanceling(false);
    }
  };

  if (!mounted) return null;

  return (
    <main className="flex h-screen w-screen bg-[#000000] text-gray-900 font-sans overflow-hidden">
      
      <SidebarPane />

      <section 
        className={`flex-1 relative h-full min-w-[500px] bg-[#000000] transition-all duration-300 ease-in-out ${
          store.isLiveRenderOpen && store.sidebarView === 'chat' ? 'border-r border-[#222]' : ''
        }`}
      >
        {store.sidebarView === 'search' ? <SearchPane /> :
         store.sidebarView === 'ebooks' ? <MyEbooksPane /> :
         store.sidebarView === 'calendar' ? <CalendarPane /> :
         store.activeTool === 'war_room' ? <WarRoomPane /> : <EditorPane />}
      </section>

      <section 
        className={`relative h-full bg-[#F9FAFB] transition-all duration-300 ease-in-out ${
          store.isLiveRenderOpen && store.sidebarView === 'chat' ? 'w-[45%] opacity-100' : 'w-0 opacity-0 border-none'
        }`}
      >
        <div className="absolute inset-0 min-w-[400px]">
          {store.activeTool === 'war_room' ? (
            <SwarmCanvas />
          ) : (
            <LiveRender />
          )}
        </div>
      </section>

      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-[500px] shadow-2xl animate-in zoom-in-95 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-white shrink-0">
              <h3 className="text-[16px] font-semibold text-gray-900">Workspace Settings</h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-900 transition bg-gray-50 hover:bg-gray-100 p-1.5 rounded-md">
                <X className="w-4 h-4"/>
              </button>
            </div>
            
            <div className="p-5 space-y-6 overflow-y-auto">
              
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Provider</label>
                <select 
                  value={localProvider} 
                  onChange={(e) => setLocalProvider(e.target.value as any)} 
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-[14px] text-gray-900 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-shadow"
                >
                  <option value="openai">OpenAI (GPT-4o)</option>
                  <option value="anthropic">Anthropic (Claude haiku 4.5)</option>
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

              <div>
                <h3 className="text-[12px] font-bold text-red-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5" /> Danger Zone
                </h3>
                
                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[14px] font-medium text-red-900">Live Database Status</span>
                    
                    {isFetchingPlan ? (
                      <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
                    ) : (
                      <span className="text-[11px] font-bold bg-white text-red-600 px-2 py-1 rounded shadow-sm uppercase tracking-wider">
                        {livePlanName}
                      </span>
                    )}
                  </div>
                  
                  {livePlanName !== 'free' && livePlanName !== 'Loading...' && livePlanName !== 'error' && (
                    <button 
                      onClick={handleCancel}
                      disabled={isCanceling}
                      className="w-full bg-red-600 text-white text-[13px] font-medium py-2.5 rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2 disabled:opacity-70 mt-2"
                    >
                      {isCanceling ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cancel Active Subscription'}
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </main>
  );
}