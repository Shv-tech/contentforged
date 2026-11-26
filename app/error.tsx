'use client';

/**
 * app/error.tsx
 *
 * Shown when a page crashes while rendering. Reports the crash to the
 * monitoring dashboard and gives the person a way back, plus a reference
 * they can quote.
 */

import Link from 'next/link';
import { useEffect } from 'react';
import { reportClientError } from '@/components/ops/report';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError({ type: 'boundary', message: error.message || 'Page crashed', stack: error.stack ?? null, digest: error.digest ?? null });
  }, [error]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-black px-6 font-sans text-white">
      <div className="max-w-[460px]">
        <p className="text-[14px] text-white/50">Something broke</p>
        <h1 className="mt-3 text-[32px] font-semibold leading-tight tracking-[-0.03em]">This page hit an error.</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-white/60">It has been reported to us automatically. Try again, and if it keeps happening, send us the reference below.</p>
        {error.digest ? <p className="mt-4 font-mono text-[13px] text-white/45">Reference: {error.digest}</p> : null}
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="rounded-full bg-white px-5 py-2.5 text-[14px] font-medium text-black transition hover:bg-white/85">
            Try again
          </button>
          <Link href="/" className="rounded-full border border-white/20 px-5 py-2.5 text-[14px] font-medium text-white transition hover:bg-white/[0.05]">
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
