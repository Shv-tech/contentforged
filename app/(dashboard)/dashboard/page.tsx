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

  // The canvas is only ever a side-by-side column on desktop. On a phone there
  // is no room for two panes, so it becomes a full-screen overlay that the user
  // dismisses to get back to the conversation.
  const canvasOpen = store.isLiveRenderOpen && store.sidebarView === 'chat';

  return (
    <main
      className="flex w-full max-w-full overflow-hidden bg-[#000000] text-gray-900 font-sans"
      // 100dvh, not 100vh: on mobile Safari and Chrome the viewport unit
      // includes the collapsing browser chrome, so h-screen puts the composer
      // permanently under the address bar.
      style={{ height: '100dvh' }}
    >

      <SidebarPane />

      {/*
        min-w-0 is what actually fixes the horizontal overflow. A flex child
        defaults to min-width:auto and refuses to shrink below its content, and
        the previous min-w-[500px] made that explicit — on a 390px phone the
        column stayed 500px wide and pushed the page sideways, which is why the
        layout only looked right in desktop mode. The 500px floor is still
        useful on desktop, so it moves behind the md: breakpoint.
      */}
      <section
        className={`flex-1 relative h-full min-w-0 md:min-w-[500px] bg-[#000000] transition-all duration-300 ease-in-out ${
          canvasOpen ? 'md:border-r md:border-[#222]' : ''
        }`}
      >
        {store.sidebarView === 'search' ? <SearchPane /> :
         store.sidebarView === 'ebooks' ? <MyEbooksPane /> :
         store.sidebarView === 'calendar' ? <CalendarPane /> :
         store.activeTool === 'war_room' ? <WarRoomPane /> : <EditorPane />}
      </section>

      {/*
        Desktop: a 45% sibling column that collapses to zero width.
        Mobile: a fixed overlay above the chat. It is unmounted rather than
        hidden when closed so the inner min-w-[400px] can never contribute to
        document width.
      */}
      {canvasOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#F9FAFB] md:hidden flex flex-col"
          style={{ height: '100dvh' }}
        >
          <div className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-gray-200 bg-white">
            <span className="text-[13px] font-semibold text-gray-900">Canvas</span>
            <button
              onClick={() => store.toggleLiveRender()}
              className="p-2 -mr-2 text-gray-500 hover:text-gray-900 transition-colors"
              aria-label="Close canvas"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            {store.activeTool === 'war_room' ? <SwarmCanvas /> : <LiveRender />}
          </div>
        </div>
      )}

      <section
        className={`hidden md:block relative h-full bg-[#F9FAFB] transition-all duration-300 ease-in-out ${
          canvasOpen ? 'w-[45%] opacity-100' : 'w-0 opacity-0 border-none'
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
        // fixed, not absolute: absolute positioned this against the scrolling
        // main element, so on a short viewport the modal could sit off-screen.
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-[500px] shadow-2xl animate-in zoom-in-95 max-h-[85dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-white shrink-0">
              <h3 className="text-[16px] font-semibold text-gray-900">Workspace Settings</h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-900 transition bg-gray-50 hover:bg-gray-100 p-1.5 rounded-md">
                <X className="w-4 h-4"/>
              </button>
            </div>

            <div className="p-5 space-y-6 overflow-y-auto overscroll-contain">

              <div>
                <label className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Provider</label>
                <select
                  value={localProvider}
                  onChange={(e) => setLocalProvider(e.target.value as any)}
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-[16px] md:text-[14px] text-gray-900 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-shadow"
                >
                  <option value="openai">OpenAI (GPT-4o)</option>
                  <option value="anthropic">Anthropic (Claude haiku 4.5)</option>
                </select>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Secret API Key</label>
                {/*
                  16px on mobile. iOS Safari zooms the whole page in when a
                  focused input has a font-size below 16px, and it does not zoom
                  back out — a very common cause of "the layout broke on my
                  phone" once the user has tapped a field.
                */}
                <input
                  type="password"
                  value={localKey}
                  onChange={(e) => setLocalKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-white border border-gray-200 rounded-lg p-3 text-[16px] md:text-[14px] text-gray-900 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-shadow"
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
                  <div className="flex justify-between items-center gap-3 mb-3">
                    <span className="text-[14px] font-medium text-red-900">Live Database Status</span>

                    {isFetchingPlan ? (
                      <Loader2 className="w-4 h-4 text-red-500 animate-spin shrink-0" />
                    ) : (
                      <span className="text-[11px] font-bold bg-white text-red-600 px-2 py-1 rounded shadow-sm uppercase tracking-wider shrink-0">
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