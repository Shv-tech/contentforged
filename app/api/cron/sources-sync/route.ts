/**
 * app/api/cron/sources-sync/route.ts
 *
 * Every six hours: reads connected sources (GitHub, Linear, Notion,
 * calendars) that are due, turning new material into captures. Also retries
 * captures that were left reading (a function that timed out mid-way), so
 * nothing captured is ever stuck.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { CAPTURE_COLUMNS, processCapture, type CaptureRecord } from '@/lib/forge/capture/ingest';
import { dueSources, syncSource } from '@/lib/forge/capture/sync';
import { requireCron } from '@/lib/forge/cron';
import { route } from '@/lib/forge/http';
import { brandLanguage } from '@/lib/forge/profile';
import { createServiceClient } from '@/lib/supabase/service';

const BUDGET_MS = 250_000;
const MAX_SOURCES = 40;
const MAX_RETRIES = 20;

export const GET = route('api/cron/sources-sync', async (req: Request) => {
  requireCron(req);
  const started = Date.now();
  const service = createServiceClient();

  let synced = 0;
  let captures = 0;
  for (const source of await dueSources(MAX_SOURCES)) {
    if (Date.now() - started > BUDGET_MS) break;
    captures += await syncSource(source);
    synced += 1;
  }

  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: stuck } = await service.from('captures').select(CAPTURE_COLUMNS).eq('status', 'processing').lt('updated_at', stale).limit(MAX_RETRIES);
  let retried = 0;
  for (const capture of (stuck ?? []) as CaptureRecord[]) {
    if (Date.now() - started > BUDGET_MS) break;
    await processCapture(service, capture, {
      language: await brandLanguage(capture.user_id, capture.workspace_id),
      subject: typeof capture.metadata.subject === 'string' ? capture.metadata.subject : null,
    });
    retried += 1;
  }

  return NextResponse.json({ synced, captures, retried });
});
