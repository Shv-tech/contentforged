'use client';

/**
 * Brand: everything Forge knows about how this brand writes, and the only
 * place it is kept. Voice, Story Bank, rules and settings are all visible and
 * editable here, so nothing Forge has learned is hidden from the writer.
 */

import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '@/lib/forge/client';
import { BrandSettingsPanel } from '@/components/forge/brand/BrandSettingsPanel';
import { RulesPanel } from '@/components/forge/brand/RulesPanel';
import { StoryBankPanel } from '@/components/forge/brand/StoryBankPanel';
import { VoicePanel } from '@/components/forge/brand/VoicePanel';
import { VisualKitPanel } from '@/components/forge/brand/VisualKitPanel';
import { Segmented } from '@/components/forge/ui';
import { ViewShell } from '@/components/forge/views/ViewShell';

type Tab = 'voice' | 'stories' | 'rules' | 'visuals' | 'settings';

const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: 'voice', label: 'Voice' },
  { value: 'stories', label: 'Story Bank' },
  { value: 'rules', label: 'Rules' },
  { value: 'visuals', label: 'Visuals' },
  { value: 'settings', label: 'Settings' },
];

function isTab(value: string | null): value is Tab {
  return TABS.some((tab) => tab.value === value);
}

export function BrandPane() {
  const [tab, setTab] = useState<Tab>('voice');
  const workspace = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === s.activeId) ?? null);

  // ?tab= deep links, used when a platform's OAuth flow returns here.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (isTab(requested)) setTab(requested);
  }, []);

  return (
    <ViewShell
      title={workspace ? workspace.name : 'Your brand'}
      subtitle={
        workspace
          ? workspace.kind === 'company'
            ? 'The company’s stories, rules and look. Each person’s voice stays their own; nothing here is shared with other workspaces.'
            : 'This client’s voice, stories and rules. Nothing here is shared with your own brand or other clients.'
          : 'How you write, the true things Forge can write about, and the rules it follows. All of it is yours to edit.'
      }
    >
      <div className="-mx-1 mb-6 overflow-x-auto px-1">
        <Segmented label="Brand section" value={tab} onChange={setTab} options={TABS} />
      </div>
      {tab === 'voice' && <VoicePanel />}
      {tab === 'stories' && <StoryBankPanel />}
      {tab === 'rules' && <RulesPanel />}
      {tab === 'visuals' && <VisualKitPanel />}
      {tab === 'settings' && <BrandSettingsPanel />}
    </ViewShell>
  );
}
