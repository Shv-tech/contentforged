/**
 * app/api/account/export/route.ts
 *
 * GET  a zip of everything Forge holds for the signed-in person, with their
 *      uploaded files. Credentials are never included. Limited to three an
 *      hour: each one reads every table.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { exportAccount } from '@/lib/forge/account';
import { HttpError, requireUser, route } from '@/lib/forge/http';
import { consumeLimit } from '@/lib/forge/limits';

export const GET = route('api/account/export', async (req: Request) => {
  const ctx = await requireUser(req);
  if (ctx.via !== 'session') throw new HttpError(403, 'Download your data from the app.');
  const limit = await consumeLimit(`export:${ctx.userId}`, 3, 3600);
  if (!limit.allowed) throw new HttpError(429, 'You can download your data three times an hour. Try again shortly.');

  const result = await exportAccount({ id: ctx.userId, email: ctx.email });
  return new Response(result.zip as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': String(result.zip.byteLength),
      'Cache-Control': 'no-store',
    },
  });
});
