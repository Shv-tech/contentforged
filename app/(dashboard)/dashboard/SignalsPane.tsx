'use client';

/**
 * Signals: what is happening outside the editor. Comments on your own posts,
 * your account's audit, what your niche is talking about, posts worth
 * replying to, and what worked for the accounts you watch.
 */

import { useState } from 'react';
import { AuditPanel } from '@/components/forge/signals/AuditPanel';
import { CommentsPanel } from '@/components/forge/signals/CommentsPanel';
import { PulsePanel } from '@/components/forge/signals/PulsePanel';
import { RadarPanel } from '@/components/forge/signals/RadarPanel';
import { WatchPanel } from '@/components/forge/signals/WatchPanel';
import { Segmented } from '@/components/forge/ui';
import { ViewShell } from '@/components/forge/views/ViewShell';

type Tab = 'comments' | 'audit' | 'pulse' | 'radar' | 'watch';

export function SignalsPane() {
  const [tab, setTab] = useState<Tab>('comments');
  return (
    <ViewShell title="Signals" subtitle="What people say back to you, and live data from X: why an account is quiet, what your niche is discussing, and where a reply would be seen.">
      <div className="-mx-1 mb-6 overflow-x-auto px-1">
        <Segmented
          label="Signals section"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'comments', label: 'Comments' },
            { value: 'audit', label: 'Audit' },
            { value: 'pulse', label: 'Niche pulse' },
            { value: 'radar', label: 'Reply Radar' },
            { value: 'watch', label: 'Competitors' },
          ]}
        />
      </div>
      {tab === 'comments' && <CommentsPanel />}
      {tab === 'audit' && <AuditPanel />}
      {tab === 'pulse' && <PulsePanel />}
      {tab === 'radar' && <RadarPanel />}
      {tab === 'watch' && <WatchPanel />}
    </ViewShell>
  );
}
