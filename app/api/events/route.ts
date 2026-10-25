/**
 * app/api/events/route.ts
 *
 * POST { name, props }  record a product event from the browser.
 *
 * Only names in EVENT_NAMES are accepted and properties are reduced to a few
 * short scalars (lib/forge/events.ts), so this endpoint cannot be used to
 * store content. Rate limited per person.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isEventName, track } from '@/lib/forge/events';
import { HttpError, parseJson, requireUser, route } from '@/lib/forge/http';
import { consumeLimit } from '@/lib/forge/limits';

const BodySchema = z.object({
  name: z.string().max(64),
  props: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});

export const POST = route('api/events', async (req: Request) => {
  const ctx = await requireUser(req);
  const { name, props } = await parseJson(req, BodySchema);
  if (!isEventName(name)) throw new HttpError(400, 'Unknown event.');

  const limit = await consumeLimit(`events:${ctx.userId}`, 400, 3600);
  if (!limit.allowed) return NextResponse.json({ recorded: false });

  await track(ctx.userId, name, props);
  return NextResponse.json({ recorded: true });
});
