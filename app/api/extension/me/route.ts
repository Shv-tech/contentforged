/**
 * app/api/extension/me/route.ts
 *
 * GET  who the extension's token belongs to, and the voice data it needs to
 *      score text locally as the user types in X or LinkedIn.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { acceptedRules, bannedPhrasesFrom } from '@/lib/forge/data/rules';
import { getFingerprint } from '@/lib/forge/data/voice';
import { getActiveWorkspace } from '@/lib/forge/data/workspace';
import { requireUser, route } from '@/lib/forge/http';
import { resolvePlan } from '@/lib/forge/plan';
import { planName } from '@/lib/forge/entitlements';

export const GET = route('api/extension/me', async (req: Request) => {
  const ctx = await requireUser(req);
  const workspace = await getActiveWorkspace(ctx.db, ctx.userId);
  const [plan, fingerprint, rules] = await Promise.all([
    resolvePlan(ctx.userId),
    getFingerprint(ctx.db, ctx.userId, workspace?.id ?? null),
    acceptedRules(ctx.db, ctx.userId, workspace?.id ?? null),
  ]);
  return NextResponse.json({
    name: ctx.name,
    email: ctx.email,
    plan: planName(plan),
    workspace: workspace ? { id: workspace.id, name: workspace.name } : null,
    voice: fingerprint ? { profile: fingerprint.profile, traits: fingerprint.traits, sampleCount: fingerprint.sample_count } : null,
    bannedPhrases: bannedPhrasesFrom(rules),
  });
});
