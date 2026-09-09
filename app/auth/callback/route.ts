// app/auth/callback/route.ts
//
// This file is what the 404 means: Google redirects the browser to
// /auth/callback?code=...&next=%2Fdashboard, and nothing in the app answers at
// that path, so Next.js serves its default not-found page.
//
// The account still gets created because Supabase creates the auth.users row on
// its own callback (<project>.supabase.co/auth/v1/callback) before it ever
// redirects here. What is missing is the second half: exchanging the one-time
// code for a session and writing the session cookies. Until that runs the user
// is signed up but not reliably signed in, which is why it "works if you press
// back" sometimes and not others.
//
// Must be route.ts, not page.tsx. A page renders UI; this needs to be a request
// handler that sets cookies and redirects.

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get('code');
  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Open-redirect guard. `next` arrives from the query string, so it is user
  // input: only same-site absolute paths are allowed through. Without this,
  // ?next=https://evil.example is a working redirect off your domain carrying
  // whatever the user just authenticated as.
  const rawNext = searchParams.get('next') ?? '/dashboard';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';

  // The user denied consent, or Google returned an error.
  if (errorParam) {
    const url = new URL('/login', origin);
    url.searchParams.set('error', errorDescription ?? errorParam);
    return NextResponse.redirect(url);
  }

  if (!code) {
    const url = new URL('/login', origin);
    url.searchParams.set('error', 'Sign-in link was incomplete. Please try again.');
    return NextResponse.redirect(url);
  }

  // getForwardedOrigin: behind Vercel's proxy, request.url can report the
  // internal host rather than forgeyourway.dev, which would redirect the user
  // to a URL their session cookie is not scoped to.
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  const isLocal = process.env.NODE_ENV === 'development';
  const baseUrl = isLocal || !forwardedHost ? origin : `${forwardedProto}://${forwardedHost}`;

  const response = NextResponse.redirect(`${baseUrl}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: any; value: any; options: any; }[]) {
          // Written onto the response, not the request. Cookies set on the
          // request object are discarded and the browser never receives them —
          // a very common cause of "the callback runs but I am still logged out".
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] exchange failed:', error.message);
    const url = new URL('/login', baseUrl);
    url.searchParams.set('error', 'Could not complete sign-in. Please try again.');
    return NextResponse.redirect(url);
  }

  return response;
}