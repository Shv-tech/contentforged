/**
 * app/api/auth/session/route.ts
 *
 * POST  records the device a user just signed in from (browser, OS, coarse
 *       location from the edge, IP), for the account's sign-in history.
 *
 * Identity comes from the session cookie only. An earlier version took the
 * user id from the request body, which let anyone write sign-in records for
 * any account.
 */

export const dynamic = 'force-dynamic';

import { NextResponse, userAgent } from 'next/server';
import { clientIp, requireUser, route } from '@/lib/forge/http';

export const POST = route('api/auth/session', async (req: Request) => {
  const ctx = await requireUser(req);
  const { browser, os } = userAgent(req);
  const city = req.headers.get('x-vercel-ip-city');
  const country = req.headers.get('x-vercel-ip-country');

  const { error } = await ctx.db.from('device_sessions').insert({
    user_id: ctx.userId,
    device_type: `${browser.name ?? 'Unknown browser'} (${os.name ?? 'unknown OS'})`,
    location: [city ? decodeURIComponent(city) : null, country].filter(Boolean).join(', ') || 'Unknown',
    ip_address: clientIp(req),
    is_current_session: true,
  });
  if (error) throw new Error(error.message);
  return NextResponse.json({ recorded: true });
});
