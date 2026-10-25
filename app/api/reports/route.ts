/**
 * app/api/reports/route.ts
 *
 * GET   the active workspace's monthly reports, newest first
 * POST  { month?: 'YYYY-MM', note?, send? }  build (or rebuild) a month's
 *       report; with `send`, email the link to the workspace's client email
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { appUrl } from '@/lib/forge/app-url';
import { brandRequest } from '@/lib/forge/brand-request';
import { recordAudit } from '@/lib/forge/data/collab';
import { HttpError, parseJson, route } from '@/lib/forge/http';
import { timezoneOf } from '@/lib/forge/profile';
import { REPORT_COLUMNS, saveReport } from '@/lib/forge/reports';
import { sendClientReportEmail } from '@/lib/mail-service';
import { createServiceClient } from '@/lib/supabase/service';

export const GET = route('api/reports:get', async (req: Request) => {
  const { ctx, workspaceId } = await brandRequest(req);
  if (!workspaceId) return NextResponse.json({ reports: [] });
  const { data, error } = await ctx.db.from('client_reports').select(REPORT_COLUMNS).eq('workspace_id', workspaceId).order('period_start', { ascending: false }).limit(24);
  if (error) throw new Error(error.message);
  return NextResponse.json({ reports: (data ?? []).map((r: { token: string }) => ({ ...r, url: `${appUrl(req)}/r/${r.token}` })) });
});

const BodySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  note: z.string().trim().max(2000).nullish(),
  send: z.boolean().default(false),
});

export const POST = route('api/reports:post', async (req: Request) => {
  const input = await parseJson(req, BodySchema);
  const { ctx, workspace } = await brandRequest(req, { write: true, feature: 'client_reports' });
  if (!workspace) throw new HttpError(400, 'Reports are for workspaces. Switch to a client workspace first.');

  const month = input.month ? new Date(`${input.month}-15T00:00:00Z`) : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 15));
  const report = await saveReport({ id: workspace.id, name: workspace.name, owner_id: workspace.ownerId }, ctx.userId, month, await timezoneOf(ctx.userId), input.note ?? null);
  const url = `${appUrl(req)}/r/${report.token}`;

  let emailed = false;
  if (input.send) {
    const { data } = await createServiceClient().from('workspaces').select('client_email').eq('id', workspace.id).maybeSingle();
    if (!data?.client_email) throw new HttpError(400, 'Add the client’s email to this workspace first, or copy the link.');
    emailed = await sendClientReportEmail({ to: data.client_email, workspaceName: workspace.name, senderName: ctx.name, period: report.data.periodLabel, headline: report.data.headline, url });
  }

  await recordAudit(workspace.id, ctx.userId, 'report.generated', { type: 'report', id: report.id, detail: { period: report.period_start, emailed } });
  return NextResponse.json({ report: { ...report, url }, emailed }, { status: 201 });
});
