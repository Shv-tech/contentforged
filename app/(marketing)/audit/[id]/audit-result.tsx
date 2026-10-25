'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AuditReportView } from '@/components/forge/audit/AuditReportView';
import type { AuditReport } from '@/lib/x/audit';
import { composeIntent } from '@/lib/x/intent';
import { pillGhost, pillWhite } from '../../components/landing/forge-art';
import { SiteFooter, SiteNav } from '../../components/site-chrome';

export function AuditResult({ report, createdAt }: { report: AuditReport; createdAt: string }) {
  const [copied, setCopied] = useState(false);

  const share = () => {
    const url = window.location.href;
    window.open(composeIntent(`Ran my X account through Forge's free audit. ${report.narrative.headline}\n\n${url}`), '_blank', 'noopener,noreferrer');
  };

  const copy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-black font-sans text-white antialiased">
      <SiteNav links={[{ label: 'Run another', href: '/audit' }, { label: 'Pricing', href: '/#pricing' }]} />

      <section className="mx-auto max-w-[1040px] px-5 pt-28 sm:px-8 sm:pt-32">
        <p className="mb-4 text-[13px] text-white/40">
          Audit from {new Date(createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
        <AuditReportView
          report={report}
          actions={
            <>
              <button type="button" onClick={share} className={`${pillGhost} !px-4 !py-2 !text-[14px]`}>
                Share on X
              </button>
              <button type="button" onClick={copy} className={`${pillGhost} !px-4 !py-2 !text-[14px]`}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </>
          }
        />
      </section>

      <section className="mx-auto mt-16 max-w-[1040px] px-5 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[32px] bg-gradient-to-br from-[#FF8A2B]/20 via-[#0B0B0B] to-[#0B0B0B] p-8 sm:flex-row sm:items-center sm:p-10">
          <div className="max-w-[560px]">
            <h2 className="text-[26px] font-semibold tracking-[-0.03em] text-white sm:text-[32px]">Write the next twenty with the fixes built in.</h2>
            <p className="mt-3 text-[16px] leading-relaxed text-white/60">
              Forge learns the account&apos;s voice from these same posts, grades every draft before it goes out, and tracks what works.
            </p>
          </div>
          <Link href="/signup" className={`${pillWhite} shrink-0 px-7 py-3.5`}>
            Start free
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
