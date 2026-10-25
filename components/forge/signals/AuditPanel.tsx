'use client';

/**
 * Your account, audited from its last twenty posts, plus any other account
 * you want to look at.
 */

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError, useProfileStore } from '@/lib/forge/client';
import type { AuditReport } from '@/lib/x/audit';
import { AuditReportView } from '../audit/AuditReportView';
import { Button, Card, EmptyState, Spinner, cn, inputClass, relativeTime } from '../ui';
import { composeInChat } from '../views/ViewShell';

interface AuditSummary {
  id: string;
  handle: string;
  createdAt: string;
  headline: string;
}

export function AuditPanel() {
  const { profile, load } = useProfileStore();
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<{ id: string; report: AuditReport } | null>(null);
  const [history, setHistory] = useState<AuditSummary[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      setHistory((await api<{ audits: AuditSummary[] }>('/api/audits')).audits);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadHistory();
  }, [load, loadHistory]);

  const run = async (target?: string) => {
    setBusy(true);
    try {
      const result = await api<{ id: string; report: AuditReport }>('/api/audits', { method: 'POST', json: { handle: target || undefined } });
      setCurrent(result);
      void loadHistory();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'The audit could not run.');
    } finally {
      setBusy(false);
    }
  };

  const fixInChat = (report: AuditReport) => {
    composeInChat({
      fresh: true,
      send: true,
      tool: null,
      text: `My X audit says: ${report.narrative.headline}\nThe fixes it suggested:\n${report.narrative.fixes.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\nWrite my next three X posts with these fixes built in. Use my Story Bank for anything personal.`,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(handle.trim());
          }}
        >
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder={profile?.x_handle ? `@${profile.x_handle}, or any other account` : '@handle'}
            aria-label="X handle to audit"
            className={cn(inputClass, 'h-11 flex-1 rounded-full py-0')}
          />
          <Button type="submit" variant="primary" size="md" loading={busy} disabled={!handle.trim() && !profile?.x_handle}>
            {handle.trim() ? 'Audit' : 'Audit my account'}
          </Button>
        </form>
      </Card>

      {busy && !current && (
        <div className="flex items-center gap-2 py-10 text-[13.5px] text-white/50">
          <Spinner /> Reading the last twenty posts
        </div>
      )}

      {current ? (
        <AuditReportView
          report={current.report}
          actions={
            <>
              <Button variant="primary" size="sm" onClick={() => fixInChat(current.report)}>
                Write posts with these fixes
              </Button>
              <a
                href={`/audit/${current.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center rounded-full border border-white/[0.12] px-3.5 text-[13px] text-white hover:bg-white/[0.06]"
              >
                Share page
              </a>
            </>
          }
        />
      ) : (
        !busy &&
        (history.length === 0 ? (
          <EmptyState
            plate="quench"
            title="See why an account is quiet"
            body="An audit reads the last twenty original posts and shows what is holding them back, from the account's own numbers, with three fixes for this week."
          />
        ) : (
          <div>
            <h3 className="mb-3 text-[13px] font-semibold text-white/45">Recent audits</h3>
            <ul className="flex flex-col gap-2">
              {history.map((audit) => (
                <li key={audit.id}>
                  <a
                    href={`/audit/${audit.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 rounded-[18px] border border-white/[0.06] bg-forge-card px-4 py-3.5 hover:border-white/[0.12]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-medium text-white">@{audit.handle}</span>
                      <span className="block truncate text-[13px] text-white/50">{audit.headline}</span>
                    </span>
                    <span className="shrink-0 text-[12px] text-white/35">{relativeTime(audit.createdAt)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
