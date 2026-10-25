/**
 * app/api/extension/tokens/route.ts
 *
 * GET   the user's browser extension tokens (never the token itself)
 * POST  { label? }  create a token. The plaintext is returned once and only
 *       its SHA-256 hash is stored, so a lost token is revoked and replaced,
 *       never recovered.
 *
 * Session only: a token cannot mint more tokens.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomToken, sha256Hex } from '@/lib/forge/crypto';
import { HttpError, TOKEN_PREFIX, parseJson, requireUser, route } from '@/lib/forge/http';
import { requireFeature } from '@/lib/forge/plan';
import { createServiceClient } from '@/lib/supabase/service';

const MAX_ACTIVE_TOKENS = 5;

export const GET = route('api/extension/tokens:get', async (req: Request) => {
  const ctx = await requireUser(req);
  if (ctx.via !== 'session') throw new HttpError(403, 'Manage tokens from the Forge website.');
  const { data, error } = await ctx.db
    .from('extension_tokens')
    .select('id, label, last_used_at, revoked_at, created_at')
    .eq('user_id', ctx.userId)
    // API keys share the table and are managed under Account, API keys.
    .eq('kind', 'extension')
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return NextResponse.json({ tokens: data ?? [] });
});

const BodySchema = z.object({ label: z.string().trim().min(1).max(60).default('Chrome extension') });

export const POST = route('api/extension/tokens:post', async (req: Request) => {
  const ctx = await requireUser(req);
  if (ctx.via !== 'session') throw new HttpError(403, 'Create tokens from the Forge website.');
  await requireFeature(ctx.userId, 'extension');
  const { label } = await parseJson(req, BodySchema);

  const service = createServiceClient();
  const { count } = await service.from('extension_tokens').select('id', { count: 'exact', head: true }).eq('user_id', ctx.userId).eq('kind', 'extension').is('revoked_at', null);
  if ((count ?? 0) >= MAX_ACTIVE_TOKENS) throw new HttpError(409, `You have ${MAX_ACTIVE_TOKENS} active tokens. Revoke one first.`);

  const token = `${TOKEN_PREFIX}${randomToken(32)}`;
  // Inserted with the service client: the table only grants owners read and
  // revoke, so a browser session cannot write arbitrary hashes.
  const { data, error } = await service
    .from('extension_tokens')
    .insert({ user_id: ctx.userId, label, token_hash: sha256Hex(token), kind: 'extension' })
    .select('id, label, last_used_at, revoked_at, created_at')
    .single();
  if (error) throw new Error(error.message);
  return NextResponse.json({ token, record: data }, { status: 201 });
});
