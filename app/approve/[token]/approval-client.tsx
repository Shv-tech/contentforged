'use client';

/**
 * The page a client opens from an approval email. No account, no app chrome:
 * the post as it will read, and two buttons.
 */

import { useState } from 'react';
import type { ApprovalView } from '@/lib/forge/approvals';
import { PLATFORM_NAMES } from '@/lib/forge/types';
import { PlatformGlyph } from '@/components/forge/icons';
import { Button, cn, inputClass } from '@/components/forge/ui';

export function ApprovalClient({ approval }: { approval: ApprovalView }) {
  const [status, setStatus] = useState(approval.status);
  const [mode, setMode] = useState<'choose' | 'changes'>('choose');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = async (decision: 'approve' | 'changes') => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/approval/${approval.token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, comment: decision === 'changes' ? comment : undefined }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'That did not go through.');
      setStatus(body.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  };

  const parts = approval.kind === 'thread' && approval.segments.length > 0 ? approval.segments : [approval.body];

  return (
    <main className="min-h-screen bg-black px-5 py-12 font-sans text-white sm:py-20">
      <div className="mx-auto max-w-[620px]">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white/40">For {approval.clientName}</p>
        <h1 className="mt-3 text-[30px] font-semibold leading-tight tracking-[-0.03em] sm:text-[38px]">
          {status === 'pending' ? 'Ready for your approval' : status === 'approved' ? 'Approved. Thank you.' : 'Changes requested'}
        </h1>
        <p className="mt-3 flex items-center gap-2 text-[14px] text-white/55">
          <PlatformGlyph platform={approval.platform} className="h-3.5 w-3.5" />
          {PLATFORM_NAMES[approval.platform]} {approval.kind === 'thread' ? `thread, ${parts.length} posts` : 'post'}
        </p>

        <div className="mt-8 flex flex-col gap-3">
          {parts.map((part, index) => (
            <div key={index} className="rounded-[22px] border border-white/[0.08] bg-[#0E0E0E] p-5">
              {parts.length > 1 && (
                <p className="mb-2 text-[11.5px] text-white/35">
                  {index + 1}/{parts.length}
                </p>
              )}
              <p className="whitespace-pre-wrap text-[15.5px] leading-relaxed text-white/90">{part}</p>
            </div>
          ))}
        </div>

        {approval.expired && status === 'pending' ? (
          <p className="mt-8 text-[14px] text-white/55">This link has expired. Ask for a new one.</p>
        ) : status === 'pending' ? (
          mode === 'choose' ? (
            <div className="mt-8 flex flex-wrap gap-3">
              <Button variant="primary" size="lg" loading={busy} onClick={() => answer('approve')}>
                Approve
              </Button>
              <Button variant="secondary" size="lg" disabled={busy} onClick={() => setMode('changes')}>
                Ask for changes
              </Button>
            </div>
          ) : (
            <div className="mt-8 flex flex-col gap-3">
              <label htmlFor="approval-comment" className="text-[14px] font-medium text-white/80">
                What should change?
              </label>
              <textarea
                id="approval-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                maxLength={2000}
                className={cn(inputClass, 'resize-y')}
              />
              <div className="flex gap-3">
                <Button variant="primary" size="lg" loading={busy} disabled={!comment.trim()} onClick={() => answer('changes')}>
                  Send
                </Button>
                <Button variant="quiet" size="lg" onClick={() => setMode('choose')}>
                  Back
                </Button>
              </div>
            </div>
          )
        ) : (
          <p className="mt-8 text-[14px] leading-relaxed text-white/55">
            {status === 'approved' ? 'The writer has been told and can publish it.' : 'The writer has your note and will send a new version.'}
          </p>
        )}
        {error && <p className="mt-4 text-[14px] text-[#FFB4A0]">{error}</p>}

        <p className="mt-16 text-[12px] text-white/30">Sent with Forge</p>
      </div>
    </main>
  );
}
