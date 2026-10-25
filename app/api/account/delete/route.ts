/**
 * app/api/account/delete/route.ts
 *
 * POST { confirm }  permanently delete the signed-in account. `confirm` must
 *      be the account's email, typed by the person. Cancels billing, keeps
 *      work done in other people's workspaces with those workspaces, removes
 *      uploaded files and every record, then signs out.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { deleteAccount } from '@/lib/forge/account';
import { HttpError, parseJson, requireUser, route } from '@/lib/forge/http';

const Schema = z.object({ confirm: z.string().trim().min(3).max(320) });

export const POST = route('api/account/delete', async (req: Request) => {
  const input = await parseJson(req, Schema);
  const ctx = await requireUser(req);
  if (ctx.via !== 'session') throw new HttpError(403, 'Delete your account from the app.');
  if (!ctx.email || input.confirm.toLowerCase() !== ctx.email.toLowerCase()) {
    throw new HttpError(400, 'Type your account email exactly to confirm.');
  }

  const summary = await deleteAccount({ id: ctx.userId, email: ctx.email, name: ctx.name });
  // The auth user is gone; clear this browser's session cookies too.
  await createClient().auth.signOut().catch(() => undefined);
  return NextResponse.json({ deleted: true, ...summary });
});
