'use client';

/**
 * The free X profile audit: paste a handle, read why the account is quiet.
 *
 * The result is stored and gets its own URL (/audit/{id}) so it can be
 * shared, which is how the audit spreads: people post their own.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuditReportView } from '@/components/forge/audit/AuditReportView';
import type { AuditReport } from '@/lib/x/audit';
import { Plate, pillWhite } from '../components/landing/forge-art';
import { SiteFooter, SiteNav } from '../components/site-chrome';

const STEPS = ['Looking up the account', 'Reading the last twenty posts', 'Measuring what worked', 'Writing the fixes'];

export function AuditClient() {
  const router = useRouter();
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AuditReport | null>(null);

  const run = async () => {
    if (!handle.trim() || busy) return;
    setBusy(true);
    setError(null);
    setReport(null);
    setStep(0);
    const timer = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 4500);
    try {
      const response = await fetch('/api/public/audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handle }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'The audit could not run. Try again in a minute.');
      if (body.id) {
        router.push(`/audit/${body.id}`);
        return;
      }
      setReport(body.report as AuditReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The audit could not run.');
    } finally {
      window.clearInterval(timer);
      setBusy(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-black font-sans text-white antialiased">
      <SiteNav links={[{ label: 'Grader', href: '/#try' }, { label: 'Pricing', href: '/#pricing' }]} />

      <section className="mx-auto max-w-[1240px] px-5 pt-28 sm:px-8 sm:pt-32">
        <Plate name="steel" className="flex min-h-[520px] flex-col justify-end rounded-[40px] px-6 py-12 sm:px-14 sm:py-16" sizes="100vw" position="50% 40%">
          <div className="relative max-w-[760px]">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/70">Free X audit</p>
            <h1 className="mt-4 text-[44px] font-semibold leading-[0.98] tracking-[-0.045em] text-white sm:text-[76px]">Why is your account quiet?</h1>
            <p className="mt-6 max-w-[560px] text-[18px] leading-[1.55] text-white/75">
              Forge reads your last twenty posts and shows what is holding them back, from your own numbers. Thirty seconds, no sign-up.
            </p>
            <form
              className="mt-9 flex max-w-[560px] flex-col gap-3 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                void run();
              }}
            >
              <label htmlFor="audit-handle" className="sr-only">
                X handle
              </label>
              <input
                id="audit-handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@handle or x.com link"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="h-14 flex-1 rounded-full border border-white/15 bg-black/50 px-6 text-[17px] text-white outline-none backdrop-blur placeholder:text-white/40 focus:border-white/40"
              />
              <button type="submit" disabled={busy || !handle.trim()} className={`${pillWhite} h-14 px-8 text-[16px]`}>
                {busy ? 'Auditing' : 'Audit it'}
              </button>
            </form>
            {busy && (
              <p className="mt-4 text-[14px] text-white/70" aria-live="polite">
                {STEPS[step]}
              </p>
            )}
            {error && (
              <p className="mt-4 text-[14px] text-[#FFB4A0]" role="alert">
                {error}
              </p>
            )}
          </div>
        </Plate>
      </section>

      {report && (
        <section className="mx-auto mt-12 max-w-[1040px] px-5 sm:px-8">
          <AuditReportView report={report} />
        </section>
      )}

      <section className="mx-auto mt-24 grid max-w-[1040px] gap-4 px-5 sm:px-8 md:grid-cols-3">
        {[
          ['Your numbers only', 'Medians from the account’s own posts. No industry averages, no invented benchmarks.'],
          ['Specific fixes', 'Three things to change this week, written for this account, not a checklist for everyone.'],
          ['Then fix it', 'Forge learns the account’s voice and writes the next posts with the fixes built in.'],
        ].map(([title, body]) => (
          <div key={title} className="rounded-[26px] border border-white/[0.07] bg-[#0B0B0B] p-6">
            <h2 className="text-[17px] font-semibold text-white">{title}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-white/55">{body}</p>
          </div>
        ))}
      </section>

      <div className="mx-auto mt-16 flex max-w-[1040px] justify-center px-5">
        <Link href="/signup" className={`${pillWhite} px-8 py-4 text-[16px]`}>
          Start free
        </Link>
      </div>

      <SiteFooter />
    </main>
  );
}
