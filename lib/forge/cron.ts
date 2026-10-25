/**
 * lib/forge/cron.ts
 *
 * Authentication for scheduled jobs. Jobs are called by Supabase pg_cron
 * through pg_net with "Authorization: Bearer <CRON_SECRET>".
 *
 * Fails closed: without CRON_SECRET configured, every job refuses to run.
 * An open job endpoint that spends X API credit or publishes posts is not an
 * acceptable default.
 */

import { HttpError, safeEqualHeader } from './http';

export function requireCron(req: Request): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new HttpError(503, 'CRON_SECRET is not configured.');
  if (!safeEqualHeader(req.headers.get('authorization'), `Bearer ${secret}`)) throw new HttpError(401, 'Unauthorized.');
}
