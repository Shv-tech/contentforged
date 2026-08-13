// app/api/email/unsubscribe/route.ts

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Unsubscribe by opaque token. No login required.
 *
 * That is not a convenience: an unsubscribe placed behind a login wall does
 * not satisfy CAN-SPAM or GDPR, and in practice a recipient who cannot find
 * the exit uses the spam button instead. A spam complaint costs far more than
 * an unsubscribe, because it damages deliverability for every other recipient.
 *
 * The token is 24 random bytes, unguessable, and grants nothing except the
 * ability to stop email to that one address.
 */

/**
 * POST is the RFC 8058 one-click path.
 *
 * Gmail and Yahoo require bulk senders to support this, and mailbox providers
 * hit this endpoint DIRECTLY without a human present. It must therefore
 * unsubscribe immediately and unconditionally: no confirmation page, no "are
 * you sure", no interstitial. Anything else is treated as a broken
 * unsubscribe.
 */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const result = await unsubscribeByToken(token, 'one-click');
  // 200 even when the token is unknown. Distinguishing the two would let an
  // attacker enumerate valid tokens, and the mailbox provider only cares that
  // the request succeeded.
  return NextResponse.json({ ok: result });
}

/**
 * GET is the human path, reached by clicking the footer link.
 *
 * Also unsubscribes immediately rather than showing a confirmation step. The
 * user has already decided; making them confirm adds friction to the one
 * action you are legally obliged to make easy. The landing page offers
 * resubscribe and granular preferences instead, which is the useful place to
 * spend their attention.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/unsubscribe?status=invalid', req.url));
  }

  const ok = await unsubscribeByToken(token, 'footer-link');

  return NextResponse.redirect(
    new URL(`/unsubscribe?status=${ok ? 'done' : 'invalid'}&token=${encodeURIComponent(token)}`, req.url)
  );
}

async function unsubscribeByToken(token: string, source: string): Promise<boolean> {
  try {
    const supabase = createServiceClient();

    // unsubscribed_all rather than clearing each category flag. A global
    // unsubscribe must survive any later per-category update that only knew
    // about one of the flags, and it preserves what the user had opted into
    // in case they resubscribe.
    const { data, error } = await supabase
      .from('email_preferences')
      .update({
        unsubscribed_all: true,
        unsubscribed_at: new Date().toISOString(),
        consent_source: source,
      })
      .eq('unsubscribe_token', token)
      .select('user_id')
      .maybeSingle();

    if (error) {
      console.error('[unsubscribe] Update failed:', error);
      return false;
    }

    return Boolean(data);
  } catch (error) {
    console.error('[unsubscribe] Threw:', error);
    return false;
  }
}