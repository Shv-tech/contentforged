'use client';

/**
 * app/global-error.tsx
 *
 * Last-resort screen when the root layout itself fails. Must render its own
 * <html> and <body>. Reports the crash like app/error.tsx does.
 */

import { useEffect } from 'react';
import { reportClientError } from '@/components/ops/report';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError({ type: 'boundary', message: `Root: ${error.message || 'App crashed'}`, stack: error.stack ?? null, digest: error.digest ?? null });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#000', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 460 }}>
            <h1 style={{ fontSize: 28, margin: 0 }}>Forge hit an error.</h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>It has been reported automatically. Please try again.</p>
            {error.digest ? <p style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', fontSize: 13 }}>Reference: {error.digest}</p> : null}
            <button type="button" onClick={reset} style={{ marginTop: 16, borderRadius: 999, border: 0, padding: '10px 20px', fontSize: 14, cursor: 'pointer' }}>
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
