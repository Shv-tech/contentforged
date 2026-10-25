/**
 * app/api/capture/email/route.ts
 *
 * POST  Resend's inbound webhook (event email.received).
 *
 * Verified by its Svix signature before anything else happens. Mail to an
 * unknown address, or from a sender the owner has not allowed, is accepted
 * by the webhook (so Resend does not retry it) and silently dropped.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextResponse } from 'next/server';
import { handleInboundEmail, verifyInboundWebhook } from '@/lib/forge/capture/email';
import { route } from '@/lib/forge/http';

export const POST = route('api/capture/email', async (req: Request) => {
  const payload = await req.text();
  const event = verifyInboundWebhook(payload, req.headers);
  if (event.type !== 'email.received') return NextResponse.json({ ignored: true });

  const result = await handleInboundEmail(event.data);
  return NextResponse.json(result);
});
