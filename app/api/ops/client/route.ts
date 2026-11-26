/**
 * app/api/ops/client/route.ts
 *
 * POST: errors that happened in someone's browser, sent by
 * components/OpsReporter.tsx and the error pages. No login needed, because
 * errors happen on public pages too (free tools, audit, sign-up).
 *
 * Bounded on every side: 30 reports per visitor per 10 minutes, short
 * fields, no page content. The IP is only used for the limit and is never
 * stored.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { clientIp } from '@/lib/forge/http';
import { hashRequester } from '@/lib/forge/crypto';
import { consumeLimit } from '@/lib/forge/limits';
import { featureFor, pageFeatureFor } from '@/lib/ops/features';
import { clip, recordNow } from '@/lib/ops/recorder';

const Schema = z.object({
  type: z.enum(['error', 'unhandledrejection', 'fetch', 'boundary']),
  message: z.string().max(1000),
  stack: z.string().max(6000).nullish(),
  page: z.string().max(500),
  api: z.string().max(500).nullish(),
  status: z.number().int().min(0).max(999).nullish(),
  reference: z.string().max(40).nullish(),
  digest: z.string().max(100).nullish(),
});

function pathOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value, 'https://forge.local').pathname.slice(0, 300);
  } catch {
    return value.split('?')[0].slice(0, 300);
  }
}

function browserOf(ua: string): string {
  const name = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Other';
  const device = /Mobile|Android|iPhone|iPad/.test(ua) ? 'mobile' : 'desktop';
  return `${name}, ${device}`;
}

export async function POST(req: Request) {
  const limit = await consumeLimit(`ops-client:${hashRequester(clientIp(req))}`, 30, 600).catch(() => ({ allowed: true }));
  if (!limit.allowed) return new NextResponse(null, { status: 204 });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid report.' }, { status: 400 });
  const report = parsed.data;

  let userId: string | null = null;
  try {
    const { data } = await createClient().auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }

  const page = pathOnly(report.page) ?? '/';
  const api = pathOnly(report.api);
  const feature = api ? featureFor(api) : pageFeatureFor(page);

  recordNow({
    kind: 'client',
    level: 'error',
    request_id: report.reference ?? null,
    feature,
    name: report.type === 'fetch' ? `Browser: ${api ?? 'request'} failed` : `Browser: ${report.type}`,
    method: null,
    path: api ?? page,
    status: report.status ?? null,
    user_id: userId,
    message: clip(report.message, 1000),
    detail: { page, stack: clip(report.stack, 4000), browser: browserOf(req.headers.get('user-agent') ?? ''), digest: report.digest ?? null },
  });
  return new NextResponse(null, { status: 204 });
}
