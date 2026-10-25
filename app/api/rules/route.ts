/**
 * app/api/rules/route.ts
 *
 * GET   accepted rules plus pending suggestions from edit learning
 * POST  add a rule by hand, or answer a suggestion (accept or reject)
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addRule, listRules, pendingSuggestions } from '@/lib/forge/data/rules';
import { getActiveWorkspace, requireWrite } from '@/lib/forge/data/workspace';
import { parseJson, requireUser, route } from '@/lib/forge/http';

export const GET = route('api/rules:get', async (req: Request) => {
  const ctx = await requireUser(req);
  const workspace = await getActiveWorkspace(ctx.db, ctx.userId);
  const workspaceId = workspace?.id ?? null;
  const [rules, suggestions] = await Promise.all([listRules(ctx.db, ctx.userId, workspaceId), pendingSuggestions(ctx.db, ctx.userId, workspaceId)]);
  return NextResponse.json({ rules: rules.filter((rule) => rule.status !== 'rejected'), suggestions });
});

const PostSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add'),
    rule: z.string().trim().min(3).max(280),
    kind: z.enum(['preference', 'banned_phrase', 'structure', 'format']).default('preference'),
  }),
  z.object({
    action: z.enum(['accept', 'reject']),
    signalKey: z.string().min(3).max(120),
    rule: z.string().trim().min(3).max(280),
    kind: z.enum(['preference', 'banned_phrase', 'structure', 'format']),
    evidence: z.number().int().min(0).max(1000).default(0),
  }),
]);

export const POST = route('api/rules:post', async (req: Request) => {
  const ctx = await requireUser(req);
  const input = await parseJson(req, PostSchema);
  const workspace = await getActiveWorkspace(ctx.db, ctx.userId);
  requireWrite(workspace);
  const workspaceId = workspace?.id ?? null;

  if (input.action === 'add') {
    const rule = await addRule(ctx.db, ctx.userId, workspaceId, { rule: input.rule, kind: input.kind, source: 'manual' });
    return NextResponse.json({ rule }, { status: 201 });
  }

  // A rejected suggestion is stored too, so the same suggestion never
  // comes back.
  const rule = await addRule(ctx.db, ctx.userId, workspaceId, {
    rule: input.rule,
    kind: input.kind,
    source: 'edits',
    signalKey: input.signalKey,
    status: input.action === 'accept' ? 'accepted' : 'rejected',
    evidence: input.evidence,
  });
  return NextResponse.json({ rule });
});
