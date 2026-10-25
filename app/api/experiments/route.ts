/**
 * app/api/experiments/route.ts
 *
 * GET   the running experiment with its drafts, past experiments, and the
 *       experiment worth running next with its reason
 * POST  { variable, targetPerArm? }  start one; the next weekly plans
 *       alternate its two arms
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { brandRequest } from '@/lib/forge/brand-request';
import { track } from '@/lib/forge/events';
import { EXPERIMENT_TEMPLATES, experimentDrafts, listExperiments, startExperiment, suggestExperiment, type ExperimentVariable } from '@/lib/forge/experiments';
import { parseJson, route } from '@/lib/forge/http';
import { computePlaybook, loadPostedPosts } from '@/lib/forge/playbook';
import { timezoneOf } from '@/lib/forge/profile';

export const GET = route('api/experiments:get', async (req: Request) => {
  const { ctx, workspaceId } = await brandRequest(req);
  const [experiments, posts, timezone] = await Promise.all([
    listExperiments(ctx.db, ctx.userId, workspaceId),
    loadPostedPosts(ctx.db, ctx.userId, workspaceId, 300).catch(() => []),
    timezoneOf(ctx.userId),
  ]);
  const running = experiments.find((e) => e.status === 'running') ?? null;
  const drafts = running ? await experimentDrafts(ctx.db, running.id) : [];

  return NextResponse.json({
    running,
    drafts,
    past: experiments.filter((e) => e.status !== 'running'),
    suggestion: suggestExperiment(computePlaybook(posts, timezone)),
    templates: EXPERIMENT_TEMPLATES,
  });
});

const StartSchema = z.object({
  variable: z.enum(['opening', 'length', 'ending', 'daypart', 'format']),
  targetPerArm: z.number().int().min(3).max(20).default(4),
});

export const POST = route('api/experiments:post', async (req: Request) => {
  const input = await parseJson(req, StartSchema);
  const { ctx, workspaceId } = await brandRequest(req, { write: true, feature: 'experiments' });
  const experiment = await startExperiment(ctx.db, ctx.userId, workspaceId, input.variable as ExperimentVariable, input.targetPerArm);
  await track(ctx.userId, 'experiment.started', { variable: input.variable, target: input.targetPerArm });
  return NextResponse.json({ experiment }, { status: 201 });
});
