'use client';

/**
 * The workspace shell: sidebar, the active view, and the preview panel
 * beside the chat.
 *
 * Also handles arrival concerns in one place: sending new users through
 * onboarding, opening the view named in ?view=, and reporting the result of
 * a platform connection flow (?connected= / ?connect_error=).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { useAppStore, type SidebarView } from '@/lib/store';
import { useProfileStore } from '@/lib/forge/client';
import { CommandMenu } from '@/components/forge/CommandMenu';
import { SidebarPane } from './SidePane';
import { EditorPane } from './EditorPane';
import { LiveRender } from './LiveRender';
import { WarRoomPane } from './WarRoomPane';
import { SearchPane } from './SearchPane';
import { MyEbooksPane } from './MyEbooksPane';
import { CalendarPane } from './CalendarPane';
import { DraftsPane } from './DraftsPane';
import { BrandPane } from './BrandPane';
import { SignalsPane } from './SignalsPane';
import { PlaybookPane } from './PlaybookPane';
import { InboxView } from '@/components/forge/inbox/InboxView';
import { PlanView } from '@/components/forge/plan/PlanView';
import { FormatsView } from '@/components/forge/formats/FormatsView';
import { TeamView } from '@/components/forge/team/TeamView';
import { trackFeatureOpened, trackSessionStart } from '@/lib/forge/telemetry';
import { registerServiceWorker } from '@/lib/forge/push-client';

const VIEWS: readonly SidebarView[] = ['chat', 'search', 'inbox', 'plan', 'drafts', 'brand', 'signals', 'playbook', 'formats', 'team', 'calendar', 'ebooks'];

const PLATFORM_LABEL: Record<string, string> = { linkedin: 'LinkedIn', threads: 'Threads', bluesky: 'Bluesky' };

function MainView({ view, warRoom }: { view: SidebarView; warRoom: boolean }) {
  switch (view) {
    case 'search':
      return <SearchPane />;
    case 'inbox':
      return <InboxView />;
    case 'plan':
      return <PlanView />;
    case 'formats':
      return <FormatsView />;
    case 'team':
      return <TeamView />;
    case 'drafts':
      return <DraftsPane />;
    case 'brand':
      return <BrandPane />;
    case 'signals':
      return <SignalsPane />;
    case 'playbook':
      return <PlaybookPane />;
    case 'calendar':
      return <CalendarPane />;
    case 'ebooks':
      return <MyEbooksPane />;
    default:
      return warRoom ? <WarRoomPane /> : <EditorPane />;
  }
}

export default function DashboardController() {
  const router = useRouter();
  const store = useAppStore();
  const { profile, load: loadProfile } = useProfileStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    void loadProfile();
    trackSessionStart('dashboard');
    void registerServiceWorker();
  }, [loadProfile]);

  useEffect(() => {
    trackFeatureOpened(store.sidebarView);
  }, [store.sidebarView]);

  useEffect(() => {
    if (profile && !profile.onboarded_at) router.replace('/onboarding');
  }, [profile, router]);

  // Arrival parameters are read once and then removed from the address bar,
  // so a refresh does not repeat the toast or force the view again.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    if (view && (VIEWS as readonly string[]).includes(view)) store.setSidebarView(view as SidebarView);

    const connected = params.get('connected');
    const connectError = params.get('connect_error');
    if (connected) toast.success(`${PLATFORM_LABEL[connected] ?? 'Account'} connected. Drafts for it can now publish from Forge.`);
    if (connectError) toast.error(connectError);

    if (view || connected || connectError) {
      const tab = params.get('tab');
      window.history.replaceState(null, '', tab ? `/dashboard?tab=${encodeURIComponent(tab)}` : '/dashboard');
    }
    // Runs once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) return null;

  const warRoom = store.activeTool === 'war_room';
  // The panel belongs to the chat and the War Room. On a phone there is no room for two
  // columns, so it becomes a full-screen overlay dismissed back to the chat.
  const canvasOpen = store.isLiveRenderOpen && store.sidebarView === 'chat';
  const panel = <LiveRender />;

  return (
    <main className="flex w-full max-w-full overflow-hidden bg-forge-ink font-sans text-white" style={{ height: '100dvh' }}>
      <SidebarPane />

      {/*
        min-w-0 lets the column shrink below its content on a phone; the
        500px floor only applies from md up, where there is room for it.
      */}
      <section className={`relative h-full min-w-0 flex-1 bg-forge-ink transition-all duration-300 ease-in-out md:min-w-[500px] ${canvasOpen ? 'md:border-r md:border-white/[0.06]' : ''}`}>
        <MainView view={store.sidebarView} warRoom={warRoom} />
      </section>

      {canvasOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-forge-ink md:hidden" style={{ height: '100dvh' }}>
          <div className="flex h-12 shrink-0 items-center justify-end border-b border-white/[0.06] px-3">
            <button onClick={() => store.toggleLiveRender()} className="rounded-full p-2 text-white/50 transition-colors hover:text-white" aria-label="Close panel">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{panel}</div>
        </div>
      )}

      <section className={`relative hidden h-full bg-forge-ink transition-all duration-300 ease-in-out md:block ${canvasOpen ? 'w-[45%] opacity-100' : 'w-0 opacity-0'}`}>
        {canvasOpen && <div className="absolute inset-0 min-w-[400px]">{panel}</div>}
      </section>

      <CommandMenu />
    </main>
  );
}
