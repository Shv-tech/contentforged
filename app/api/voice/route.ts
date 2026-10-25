/**
 * app/api/voice/route.ts
 *
 * GET   the voice fingerprint, traits, samples and banned phrases. The client
 *       uses the profile to score drafts live as the user types.
 * POST  add samples: pasted posts (one per blank-line-separated block, or an
 *       explicit list) or an import of the user's recent X posts.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { acceptedRules, bannedPhrasesFrom } from '@/lib/forge/data/rules';
import { addSamples, getFingerprint, listSamples, type NewSample } from '@/lib/forge/data/voice';
import { getActiveWorkspace, requireWrite } from '@/lib/forge/data/workspace';
import { HttpError, parseJson, requireUser, route } from '@/lib/forge/http';
import { MIN_SAMPLES_FOR_SCORING } from '@/lib/forge/voice';
import { getUserByUsername, getUserPosts, isValidHandle, normaliseHandle, xConfigured, XApiError } from '@/lib/x/client';

export const GET = route('api/voice:get', async (req: Request) => {
  const ctx = await requireUser(req);
  const workspace = await getActiveWorkspace(ctx.db, ctx.userId);
  const workspaceId = workspace?.id ?? null;

  const [fingerprint, samples, rules] = await Promise.all([
    getFingerprint(ctx.db, ctx.userId, workspaceId),
    listSamples(ctx.db, ctx.userId, workspaceId),
    acceptedRules(ctx.db, ctx.userId, workspaceId),
  ]);

  return NextResponse.json({
    fingerprint,
    samples,
    bannedPhrases: bannedPhrasesFrom(rules),
    minSamples: MIN_SAMPLES_FOR_SCORING,
    xAvailable: xConfigured(),
  });
});

const PostSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('paste'),
    text: z.string().max(200_000).optional(),
    samples: z.array(z.string().max(10_000)).max(300).optional(),
    platform: z.enum(['x', 'linkedin', 'threads', 'bluesky', 'newsletter', 'other']).default('other'),
  }),
  z.object({
    source: z.literal('x_import'),
    handle: z.string().max(60).optional(),
  }),
]);

/** Splits pasted text into posts at lines of three or more dashes, or blank-line gaps of two or more. */
function splitPasted(text: string): string[] {
  const byRule = text.split(/\n\s*-{3,}\s*\n/);
  const blocks = byRule.length > 1 ? byRule : text.split(/\n\s*\n\s*\n/);
  return blocks.map((block) => block.trim()).filter((block) => block.length >= 20);
}

export const POST = route('api/voice:post', async (req: Request) => {
  const ctx = await requireUser(req);
  const input = await parseJson(req, PostSchema);
  const workspace = await getActiveWorkspace(ctx.db, ctx.userId);
  requireWrite(workspace);
  const workspaceId = workspace?.id ?? null;

  let samples: NewSample[] = [];

  if (input.source === 'paste') {
    const bodies = input.samples && input.samples.length > 0 ? input.samples : splitPasted(input.text ?? '');
    if (bodies.length === 0) {
      throw new HttpError(400, 'Paste at least one post. Separate posts with a line of three dashes (---) or two blank lines.');
    }
    samples = bodies.map((body) => ({ platform: input.platform, body, source: 'paste' as const }));
  } else {
    if (!xConfigured()) throw new HttpError(503, 'X import is not available on this server yet. Paste your posts instead.');

    let handle = input.handle ? normaliseHandle(input.handle) : '';
    if (!handle) {
      const { data: profile } = await ctx.db.from('profiles').select('x_handle').eq('id', ctx.userId).maybeSingle();
      handle = profile?.x_handle ?? '';
    }
    if (!isValidHandle(handle)) throw new HttpError(400, 'Add your X handle first.');

    try {
      const user = await getUserByUsername(handle);
      const posts = await getUserPosts(user.id, { max: 60 });
      samples = posts.map((post) => ({
        platform: 'x',
        body: post.text,
        external_id: post.id,
        posted_at: post.created_at,
        source: 'x_import' as const,
      }));

      // Remember the handle, so results and audits can use it later.
      if (!workspaceId) {
        await ctx.db.from('profiles').update({ x_handle: user.username, x_user_id: user.id }).eq('id', ctx.userId);
      }
    } catch (error) {
      if (error instanceof XApiError) throw new HttpError(error.status === 404 ? 404 : 502, error.message);
      throw error;
    }
  }

  const fingerprint = await addSamples(ctx.db, ctx.userId, workspaceId, samples);
  return NextResponse.json({ fingerprint, added: samples.length });
});
