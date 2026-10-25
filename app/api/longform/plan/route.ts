/**
 * app/api/longform/plan/route.ts
 *
 * POST { topic, kind, refs? }  propose a title and chapters for a guide or
 *      book built from the brand's own material. refs pins exactly which
 *      posts (d:), stories (s:) and sources (r:) to use.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { brandRequest } from '@/lib/forge/brand-request';
import { parseJson, route } from '@/lib/forge/http';
import { planBook } from '@/lib/forge/longform';

const Schema = z.object({
  topic: z.string().trim().max(200).default(''),
  kind: z.enum(['guide', 'book', 'playbook']).default('guide'),
  refs: z.array(z.string().regex(/^[dsr]:[0-9a-f-]{36}$/)).max(80).optional(),
});

export const POST = route('api/longform/plan', async (req: Request) => {
  const input = await parseJson(req, Schema);
  const { ctx, workspace } = await brandRequest(req, { feature: 'longform' });
  const { plan, material } = await planBook({ db: ctx.db, userId: ctx.userId, workspace, topic: input.topic, kind: input.kind, refs: input.refs });
  return NextResponse.json({
    plan,
    material: material.map((m) => ({ ref: m.ref, kind: m.kind, title: m.title, preview: m.text.slice(0, 280), relative: m.relative })),
  });
});
