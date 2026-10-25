/**
 * app/api/public/audit/route.ts
 *
 * The free X profile audit behind /audit. No login.
 *
 *   POST { handle }  ->  { id, report }
 *
 * Each audit costs real money upstream (one profile lookup and twenty post
 * reads from the X API, plus a short model call), so it is limited per
 * visitor and per day overall, and cached per handle for six hours: a
 * second request for the same account costs nothing. Every audit is stored
 * so its result page can be shared.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hashRequester } from '@/lib/forge/crypto';
import { HttpError, clientIp, parseJson, route } from '@/lib/forge/http';
import { consumeLimit } from '@/lib/forge/limits';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { runProfileAudit } from '@/lib/x/audit';
import { isValidHandle, normaliseHandle, xConfigured, XApiError } from '@/lib/x/client';

const AUDITS_PER_VISITOR_PER_HOUR = 3;
const AUDITS_PER_DAY = Number(process.env.FORGE_PUBLIC_AUDITS_PER_DAY ?? 400);

const BodySchema = z.object({ handle: z.string().trim().min(1).max(80) });

export const POST = route('api/public/audit', async (req: Request) => {
  if (!xConfigured()) throw new HttpError(503, 'Audits are not available right now.');

  const { handle: raw } = await parseJson(req, BodySchema);
  const handle = normaliseHandle(raw);
  if (!isValidHandle(handle)) throw new HttpError(400, 'That does not look like an X handle.');

  const requester = hashRequester(clientIp(req));
  const visitor = await consumeLimit(`audit:${requester}`, AUDITS_PER_VISITOR_PER_HOUR, 3600);
  if (!visitor.allowed) {
    return NextResponse.json(
      { error: 'You have run your free audits for this hour. Sign up to audit any account from inside Forge.', resetSeconds: visitor.resetSeconds },
      { status: 429 }
    );
  }
  const daily = await consumeLimit(`audit:global:${new Date().toISOString().slice(0, 10)}`, AUDITS_PER_DAY, 86_400);
  if (!daily.allowed) throw new HttpError(503, 'Audits are at capacity for today. Try again tomorrow.');

  let report;
  try {
    ({ report } = await runProfileAudit(handle));
  } catch (error) {
    if (error instanceof XApiError) throw new HttpError(error.status === 404 ? 404 : 502, error.message);
    throw error;
  }

  // Signed-in visitors own their audit rows; anonymous ones do not.
  const { data: session } = await createClient().auth.getUser();
  const { data: row, error } = await createServiceClient()
    .from('profile_audits')
    .insert({ user_id: session.user?.id ?? null, platform: 'x', handle: report.user.username, report, requester_hash: requester })
    .select('id')
    .single();
  if (error) console.error('[api/public/audit] storing the audit failed:', error);

  return NextResponse.json({ id: row?.id ?? null, report });
});
