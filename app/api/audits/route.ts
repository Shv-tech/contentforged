/**
 * app/api/audits/route.ts
 *
 * The in-app profile audit, for signed-in users.
 *
 * GET   recent audits this user ran
 * POST  { handle? }  audit an account; defaults to the user's own handle
 *
 * Shares the six-hour per-handle cache with the public audit, so auditing
 * an account someone else just audited costs nothing upstream.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HttpError, parseJson, requireUser, route } from '@/lib/forge/http';
import { consumeLimit } from '@/lib/forge/limits';
import { requireFeature } from '@/lib/forge/plan';
import { createServiceClient } from '@/lib/supabase/service';
import { runProfileAudit, type AuditReport } from '@/lib/x/audit';
import { isValidHandle, normaliseHandle, xConfigured, XApiError } from '@/lib/x/client';

const AUDITS_PER_DAY = 10;

export const GET = route('api/audits:get', async (req: Request) => {
  const ctx = await requireUser(req);
  const { data, error } = await createServiceClient()
    .from('profile_audits')
    .select('id, handle, report, created_at')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) throw new Error(error.message);
  return NextResponse.json({
    audits: (data ?? []).map((row) => ({
      id: row.id,
      handle: row.handle,
      createdAt: row.created_at,
      headline: (row.report as AuditReport).narrative?.headline ?? '',
      followers: (row.report as AuditReport).user?.followers ?? null,
    })),
  });
});

const BodySchema = z.object({ handle: z.string().trim().max(80).optional() });

export const POST = route('api/audits:post', async (req: Request) => {
  const ctx = await requireUser(req);
  await requireFeature(ctx.userId, 'profile_audit');
  if (!xConfigured()) throw new HttpError(503, 'X data is not available on this server yet.');

  const input = await parseJson(req, BodySchema);
  let handle = input.handle ? normaliseHandle(input.handle) : '';
  if (!handle) {
    const { data } = await ctx.db.from('profiles').select('x_handle').eq('id', ctx.userId).maybeSingle();
    handle = (data?.x_handle as string | null) ?? '';
  }
  if (!isValidHandle(handle)) throw new HttpError(400, 'Add an X handle to audit.');

  const limit = await consumeLimit(`audits:${ctx.userId}`, AUDITS_PER_DAY, 86_400);
  if (!limit.allowed) throw new HttpError(429, `That is ${AUDITS_PER_DAY} audits today. More tomorrow.`);

  try {
    const { report } = await runProfileAudit(handle);
    const { data, error } = await createServiceClient()
      .from('profile_audits')
      .insert({ user_id: ctx.userId, platform: 'x', handle: report.user.username, report })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data.id, report });
  } catch (error) {
    if (error instanceof XApiError) throw new HttpError(error.status === 404 ? 404 : 502, error.message);
    throw error;
  }
});
