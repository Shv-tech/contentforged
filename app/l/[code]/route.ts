/**
 * app/l/[code]/route.ts
 *
 * GET /l/AbC12xY  count the click and forward to the destination, tagged so
 * a later booking or signup can be traced to the post the link was in.
 *
 * No cookies, no fingerprinting: a click stores the time, the referring
 * site's host and the country the edge reports, nothing that identifies a
 * person.
 */

import { NextResponse } from 'next/server';
import { recordClick } from '@/lib/forge/goals';
import { observed } from '@/lib/ops/observe';

export const dynamic = 'force-dynamic';

async function handleGET(req: Request, { params }: { params: { code: string } }) {
  const destination = await recordClick(params.code, req.headers.get('referer'), req.headers.get('x-vercel-ip-country'));
  if (!destination) return NextResponse.redirect(new URL('/', req.url), 302);
  const response = NextResponse.redirect(destination, 302);
  response.headers.set('cache-control', 'no-store');
  response.headers.set('referrer-policy', 'no-referrer-when-downgrade');
  return response;
}

export const GET = observed('l/[code]', handleGET);
