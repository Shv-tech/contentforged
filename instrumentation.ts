/**
 * instrumentation.ts
 *
 * Runs once when a server instance starts. Installs the outbound-call
 * recorder for the monitoring dashboard (lib/ops/fetch-patch.ts). Node.js
 * runtime only; middleware (edge) is left alone.
 *
 * The import must stay inside this exact `if` so the edge build drops it.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.OPS_DISABLED === '1') return;
    const { installFetchPatch } = await import('./lib/ops/fetch-patch');
    installFetchPatch();
  }
}
