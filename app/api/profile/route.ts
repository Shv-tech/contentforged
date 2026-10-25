/**
 * app/api/profile/route.ts
 *
 * GET    the Forge settings on the profile: niche, X handle, the niche
 *        insights opt-in, and whether onboarding is done
 * PATCH  update any of them
 *
 * Written with the service client after the session check, because the
 * profiles row also carries billing columns and its update policy does not
 * grant these.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { HttpError, parseJson, requireUser, route } from '@/lib/forge/http';
import { isValidHandle, normaliseHandle } from '@/lib/x/client';
import type { ForgeProfile } from '@/lib/forge/types';
import { sendWelcomeEmail } from '@/lib/email/transactional';

const COLUMNS = 'niche, x_handle, share_anonymous_insights, onboarded_at, writing_language';

export const GET = route('api/profile:get', async (req: Request) => {
  const ctx = await requireUser(req);
  const { data, error } = await createServiceClient().from('profiles').select(COLUMNS).eq('id', ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  const profile: ForgeProfile = {
    niche: data?.niche ?? null,
    x_handle: data?.x_handle ?? null,
    share_anonymous_insights: Boolean(data?.share_anonymous_insights),
    onboarded_at: data?.onboarded_at ?? null,
    writing_language: data?.writing_language ?? 'en',
  };
  return NextResponse.json({ profile, name: ctx.name });
});

const PatchSchema = z
  .object({
    niche: z.string().trim().max(80).nullable().optional(),
    x_handle: z.string().trim().max(60).nullable().optional(),
    share_anonymous_insights: z.boolean().optional(),
    writing_language: z.enum(['en', 'hi', 'hinglish']).optional(),
    onboarded: z.literal(true).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update.');

export const PATCH = route('api/profile:patch', async (req: Request) => {
  const ctx = await requireUser(req);
  const input = await parseJson(req, PatchSchema);

  const patch: Record<string, unknown> = {};
  if (input.niche !== undefined) patch.niche = input.niche || null;
  if (input.share_anonymous_insights !== undefined) patch.share_anonymous_insights = input.share_anonymous_insights;
  if (input.writing_language !== undefined) patch.writing_language = input.writing_language;
  if (input.onboarded) patch.onboarded_at = new Date().toISOString();
  if (input.x_handle !== undefined) {
    if (input.x_handle === null || input.x_handle === '') {
      patch.x_handle = null;
      patch.x_user_id = null;
    } else {
      const handle = normaliseHandle(input.x_handle);
      if (!isValidHandle(handle)) throw new HttpError(400, 'That is not a valid X handle.');
      patch.x_handle = handle;
      // The numeric id is resolved lazily the first time X is queried.
      patch.x_user_id = null;
    }
  }

  const service = createServiceClient();
  const firstTimeOnboarded =
    input.onboarded === true && !(await service.from('profiles').select('onboarded_at').eq('id', ctx.userId).maybeSingle()).data?.onboarded_at;

  const { data, error } = await service.from('profiles').update(patch).eq('id', ctx.userId).select(COLUMNS).single();
  if (error) throw new Error(error.message);

  if (firstTimeOnboarded) {
    // The weekly plan is on by default; the person changes it from the plan.
    await service.from('plan_settings').insert({ user_id: ctx.userId }).then(({ error: planError }) => {
      if (planError && planError.code !== '23505') console.error('[api/profile] plan settings not created:', planError.message);
    });
    await sendWelcomeEmail({ userId: ctx.userId, email: ctx.email, firstName: ctx.name }).catch((e) => console.error('[api/profile] welcome email failed', e));
  }
  return NextResponse.json({ profile: data as ForgeProfile });
});
