/**
 * app/api/connections/route.ts
 *
 * GET  connected publishing accounts for the active brand, the X handle,
 *      and which providers this server is configured for.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { listConnections } from '@/lib/forge/connections';
import { getActiveWorkspace } from '@/lib/forge/data/workspace';
import { hasFeature } from '@/lib/forge/entitlements';
import { requireUser, route } from '@/lib/forge/http';
import { resolvePlan } from '@/lib/forge/plan';
import { linkedinConfigured } from '@/lib/platforms/linkedin';
import { threadsConfigured } from '@/lib/platforms/threads';

export const GET = route('api/connections:get', async (req: Request) => {
  const ctx = await requireUser(req);
  const [workspace, plan, profile] = await Promise.all([
    getActiveWorkspace(ctx.db, ctx.userId),
    resolvePlan(ctx.userId),
    ctx.db.from('profiles').select('x_handle').eq('id', ctx.userId).maybeSingle(),
  ]);
  const connections = await listConnections(ctx.userId, workspace?.id ?? null);

  return NextResponse.json({
    connections,
    xHandle: workspace ? null : ((profile.data?.x_handle as string | null) ?? null),
    publishing: hasFeature(plan, 'publishing'),
    providers: { linkedin: linkedinConfigured(), threads: threadsConfigured(), bluesky: true },
  });
});
