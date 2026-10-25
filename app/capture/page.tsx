'use client';

/**
 * /capture: the screen the installed app opens to. Record a voice note in
 * one tap (the home-screen shortcut starts recording straight away), and
 * keep or discard what Forge found without opening the full workspace.
 * Things shared to Forge from other apps land here too.
 */

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, api, useActiveBrand } from '@/lib/forge/client';
import type { ProposalRecord } from '@/lib/forge/capture-client';
import { hasFeature } from '@/lib/forge/entitlements';
import { useAppStore } from '@/lib/store';
import { StandaloneShell } from '@/components/forge/StandaloneShell';
import { RecorderPanel } from '@/components/forge/capture/RecorderPanel';
import { NoteDialog } from '@/components/forge/inbox/CaptureDialogs';
import { ProposalCard } from '@/components/forge/inbox/ProposalCard';
import { Button, LoadingRow } from '@/components/forge/ui';

export default function CapturePage() {
  const plan = useAppStore((s) => s.plan);
  const brand = useActiveBrand();
  const [proposals, setProposals] = useState<ProposalRecord[] | null>(null);
  const [autoStart, setAutoStart] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setProposals((await api<{ proposals: ProposalRecord[] }>('/api/capture')).proposals);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not load what is waiting.');
      setProposals([]);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('record') === '1') setAutoStart(true);
    const shared = params.get('shared');
    if (shared === '1') toast.success('Saved to Forge.');
    if (shared === 'empty') toast.error('Nothing was shared. Try sharing a link or some text.');
    if (shared === 'failed') toast.error('Could not save what you shared. Try again.');
    if (params.toString()) window.history.replaceState(null, '', '/capture');
    void load();
  }, [load]);

  const onCaptured = () => {
    void load();
  };

  return (
    <StandaloneShell
      title="Capture"
      surface="capture"
      actions={
        brand.canEdit && (
          <Button variant="quiet" size="sm" onClick={() => setNoteOpen(true)}>
            Write instead
          </Button>
        )
      }
    >
      {brand.canEdit ? (
        <section className="rounded-[28px] border border-white/[0.07] bg-gradient-to-b from-forge-ember/[0.07] to-transparent px-5 py-6 sm:px-8">
          <RecorderPanel onCaptured={onCaptured} interviewsAllowed={hasFeature(plan, 'interviews') || Boolean(brand.workspace)} autoStart={autoStart} />
        </section>
      ) : (
        <p className="rounded-[20px] bg-white/[0.04] p-5 text-[14px] text-white/60">Your role in {brand.name} is read-only, so you cannot capture for it. Switch brands in the workspace.</p>
      )}

      <section className="mt-10 flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-white/35">Waiting for you</h2>
        {proposals === null ? (
          <LoadingRow label="Loading" />
        ) : proposals.length === 0 ? (
          <p className="text-[14px] leading-relaxed text-white/45">Nothing to review. What you record shows up here in a moment.</p>
        ) : (
          proposals.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} readOnly={!brand.canEdit} onDecided={(id) => setProposals((current) => (current ?? []).filter((p) => p.id !== id))} />
          ))
        )}
      </section>

      <NoteDialog open={noteOpen} onClose={() => setNoteOpen(false)} onCaptured={onCaptured} />
    </StandaloneShell>
  );
}
