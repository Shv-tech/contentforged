/**
 * app/api/cron/client-reports/route.ts
 *
 * On the first of each month: builds last month's report for every client
 * workspace whose owner's plan includes reports, and emails the link to the
 * client when the workspace has a client email and the owner has report
 * emails on.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/forge/app-url';
import { recordAudit } from '@/lib/forge/data/collab';
import { requireCron } from '@/lib/forge/cron';
import { hasFeature } from '@/lib/forge/entitlements';
import { route } from '@/lib/forge/http';
import { preferencesFor } from '@/lib/forge/notify';
import { resolvePlan } from '@/lib/forge/plan';
import { personById, timezoneOf } from '@/lib/forge/profile';
import { saveReport } from '@/lib/forge/reports';
import { sendClientReportEmail } from '@/lib/mail-service';
import { createServiceClient } from '@/lib/supabase/service';

const BUDGET_MS = 250_000;

export const GET = route('api/cron/client-reports', async (req: Request) => {
  requireCron(req);
  const started = Date.now();
  const db = createServiceClient();
  const now = new Date();
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));

  const { data: workspaces, error } = await db.from('workspaces').select('id, name, owner_id, client_email, kind').eq('kind', 'client').limit(500);
  if (error) throw new Error(error.message);

  let built = 0;
  let emailed = 0;
  for (const workspace of workspaces ?? []) {
    if (Date.now() - started > BUDGET_MS) break;
    if (!hasFeature(await resolvePlan(workspace.owner_id), 'client_reports')) continue;

    // Only workspaces that actually published something get a report.
    const { count } = await db.from('drafts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id).eq('status', 'posted');
    if (!count) continue;

    try {
      const report = await saveReport(workspace, workspace.owner_id, lastMonth, await timezoneOf(workspace.owner_id), null);
      built += 1;
      await recordAudit(workspace.id, null, 'report.generated', { type: 'report', id: report.id, detail: { period: report.period_start, automatic: true } });

      const [owner, preferences] = await Promise.all([personById(workspace.owner_id), preferencesFor(workspace.owner_id)]);
      if (workspace.client_email && preferences.reports_email && report.data.posted > 0) {
        const sent = await sendClientReportEmail({
          to: workspace.client_email,
          workspaceName: workspace.name,
          senderName: owner?.name ?? 'Your team',
          period: report.data.periodLabel,
          headline: report.data.headline,
          url: `${appUrl()}/r/${report.token}`,
        });
        if (sent) emailed += 1;
      }
    } catch (failure) {
      console.error('[cron/client-reports] failed for', workspace.id, failure);
    }
  }

  return NextResponse.json({ built, emailed });
});
