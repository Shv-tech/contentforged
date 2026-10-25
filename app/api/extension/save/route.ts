/**
 * app/api/extension/save/route.ts
 *
 * POST  save something from the page the user is on:
 *   { kind: 'draft', text, platform }      as a draft in the library
 *   { kind: 'story', text, title? }        into the Story Bank
 *   { kind: 'voice', text, platform }      as a voice sample (their own post)
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createDraft } from '@/lib/forge/data/drafts';
import { createStory } from '@/lib/forge/data/stories';
import { addSamples } from '@/lib/forge/data/voice';
import { getActiveWorkspace, requireWrite } from '@/lib/forge/data/workspace';
import { parseJson, requireUser, route } from '@/lib/forge/http';
import { requireFeature } from '@/lib/forge/plan';
import { firstLine, truncate } from '@/lib/forge/text';
import { DRAFT_PLATFORMS } from '@/lib/forge/types';

const BodySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('draft'), text: z.string().trim().min(1).max(20_000), platform: z.enum(DRAFT_PLATFORMS).default('linkedin') }),
  z.object({ kind: z.literal('story'), text: z.string().trim().min(10).max(4000), title: z.string().trim().max(140).optional() }),
  z.object({
    kind: z.literal('voice'),
    text: z.string().trim().min(20).max(10_000),
    platform: z.enum(['x', 'linkedin', 'threads', 'bluesky', 'other']).default('other'),
  }),
]);

export const POST = route('api/extension/save', async (req: Request) => {
  const ctx = await requireUser(req);
  await requireFeature(ctx.userId, 'extension');
  const input = await parseJson(req, BodySchema);
  const workspace = await getActiveWorkspace(ctx.db, ctx.userId);
  requireWrite(workspace);
  const workspaceId = workspace?.id ?? null;

  if (input.kind === 'draft') {
    const draft = await createDraft(ctx.db, ctx.userId, workspaceId, { platform: input.platform, kind: 'post', body: input.text });
    return NextResponse.json({ saved: 'draft', id: draft.id }, { status: 201 });
  }
  if (input.kind === 'story') {
    const story = await createStory(ctx.db, ctx.userId, workspaceId, {
      kind: 'story',
      title: input.title || truncate(firstLine(input.text), 80),
      body: input.text,
      occurred_on: null,
      tags: [],
      source: 'import',
    });
    return NextResponse.json({ saved: 'story', id: story.id }, { status: 201 });
  }
  const fingerprint = await addSamples(ctx.db, ctx.userId, workspaceId, [{ platform: input.platform, body: input.text, source: 'upload' }]);
  return NextResponse.json({ saved: 'voice', samples: fingerprint.sample_count }, { status: 201 });
});
