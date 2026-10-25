/**
 * app/api/keys/route.ts
 *
 * GET   the person's API keys (never the keys themselves)
 * POST  { label, scopes, workspaceId? }  create one; the key is in the
 *       response once and cannot be shown again
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiKey, listApiKeys, SCOPE_DESCRIPTIONS } from '@/lib/forge/api-keys';
import { appUrl } from '@/lib/forge/app-url';
import { resolveRole } from '@/lib/forge/data/workspace';
import { API_SCOPES, HttpError, parseJson, requireUser, route, type ApiScope } from '@/lib/forge/http';
import { requireFeature } from '@/lib/forge/plan';

export const GET = route('api/keys:get', async (req: Request) => {
  const ctx = await requireUser(req);
  if (ctx.via !== 'session') throw new HttpError(403, 'Manage API keys from the app.');
  return NextResponse.json({ keys: await listApiKeys(ctx.userId), scopes: SCOPE_DESCRIPTIONS, baseUrl: appUrl(req) });
});

const CreateSchema = z.object({
  label: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(API_SCOPES as [ApiScope, ...ApiScope[]])).min(1).max(3),
  workspaceId: z.string().uuid().nullish(),
});

export const POST = route('api/keys:post', async (req: Request) => {
  const input = await parseJson(req, CreateSchema);
  const ctx = await requireUser(req);
  if (ctx.via !== 'session') throw new HttpError(403, 'Manage API keys from the app.');
  await requireFeature(ctx.userId, 'api');
  if (input.workspaceId && !(await resolveRole(ctx.db, ctx.userId, input.workspaceId))) throw new HttpError(404, 'Workspace not found.');

  const result = await createApiKey(ctx.userId, { label: input.label, scopes: input.scopes, workspaceId: input.workspaceId ?? null });
  return NextResponse.json(result, { status: 201 });
});
