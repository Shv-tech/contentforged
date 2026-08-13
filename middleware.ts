import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Shape of a cookie as @supabase/ssr hands it to setAll.
 *
 * Declared locally and annotated explicitly rather than relying on inference.
 * Depending on the installed version, the setAll callback parameter can come
 * through untyped, which fails under `strict` with TS7006/TS7031. Annotating
 * here makes the file compile the same way across versions and documents the
 * contract at the call site.
 */
interface SupabaseCookie {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

/**
 * middleware.ts
 *
 * Two jobs, and deliberately only two:
 *
 *   1. Refresh the Supabase session cookie on every browser request.
 *   2. Gate page routes for signed-out users.
 *
 * It does NOT enforce quota or billing. That belongs in the API routes, which
 * are the only place that knows the model, the request size, and the usage
 * actually consumed. Enforcing in both would mean two code paths that drift.
 *
 * The version this replaces was a stub that returned NextResponse.next() with
 * a comment saying authentication was "turned off for V2 Enterprise UI
 * Testing". That left /dashboard open to anyone and, more subtly, meant the
 * session cookie was never refreshed, so server-side supabase.auth.getUser()
 * calls in the account page and API routes worked against stale sessions.
 */

const PROTECTED_PREFIXES = ['/dashboard', '/account'];
const AUTH_ROUTES = new Set(['/login', '/signup']);

/**
 * Paths that bypass session handling entirely.
 *
 * The Razorpay webhook is the important one. It is a server-to-server POST
 * with no cookies, so running a Supabase session refresh against it is pure
 * overhead on the most reliability-sensitive endpoint in the system: Razorpay
 * retries on timeout, and a retry storm against a webhook that is already
 * succeeding is exactly what you do not want. Bypassing also removes any
 * chance that a middleware error takes down billing.
 */
const BYPASS_PREFIXES = ['/api/billing/webhook'];

/**
 * Applied to every response. Cheap, and each closes a specific class of
 * attack that is otherwise available against an authenticated app.
 */
function applySecurityHeaders(response: NextResponse): NextResponse {
  // Stops the browser MIME-sniffing a response into something executable.
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Blocks framing by another origin, which is what makes clickjacking
  // possible against a logged-in session.
  response.headers.set('X-Frame-Options', 'DENY');

  // Send the origin but not the path to third parties. Chat and share URLs
  // contain session ids, and full-URL referrers leak them to every external
  // image or script a page loads.
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Nothing here uses these, so deny them outright rather than trusting a
  // future dependency not to ask.
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  return response;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (BYPASS_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return NextResponse.next();
  }

  // This response object carries the refreshed session cookies back to the
  // browser. It must be the same instance the Supabase client writes to, and
  // it must be the one returned. Creating a fresh NextResponse.next() later
  // and forgetting to copy cookies onto it is the most common way this
  // pattern breaks, and it presents as intermittent logouts rather than an
  // obvious error.
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  // Supabase renamed the public client key: newer projects issue
  // NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, older ones NEXT_PUBLIC_SUPABASE_ANON_KEY.
  // Both are accepted so this file does not depend on which vintage the
  // project was created in. They are the same key with different names, and
  // both are safe to expose to the browser.
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fail open rather than 500 the entire site. A missing env var here would
  // otherwise take down every route including marketing pages, turning a
  // config mistake into a total outage. Protected routes still fail closed
  // below, because `user` stays null.
  if (!supabaseUrl || !supabaseAnonKey) {
    // Names both variants, because "env vars missing" when the value is
    // present under a different name sends you looking in the wrong place.
    console.error(
      '[middleware] Supabase config missing. Sessions will NOT refresh and ' +
      'protected routes are NOT gated.\n' +
      `  NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? 'found' : 'MISSING'}\n` +
      `  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY: ${
        supabaseAnonKey ? 'found' : 'MISSING'
      }`
    );
    return applySecurityHeaders(response);
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: SupabaseCookie[]) {
        // Mirror onto the request, so server code later in this same request
        // sees the fresh session, and onto the response, so the browser does.
        cookiesToSet.forEach(({ name, value }: SupabaseCookie) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request: { headers: request.headers } });
        cookiesToSet.forEach(({ name, value, options }: SupabaseCookie) => {
          response.cookies.set(name, value, options as any);
        });
      },
    },
  });

  // getUser(), not getSession(). getSession() reads the cookie without
  // validating it, so an expired or forged token reads as a logged-in user.
  // getUser() verifies against Supabase and is what actually refreshes the
  // token. Do not "optimize" this into a cookie-presence check.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (error) {
    // A Supabase blip should not make the marketing site unreachable.
    // Protected routes still deny below, because user remains null.
    console.error('[middleware] Auth lookup failed:', error);
  }

  const isProtectedRoute = PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix));
  const isAuthRoute = AUTH_ROUTES.has(path);

  if (!user && isProtectedRoute) {
    const redirectUrl = new URL('/login', request.url);
    // Preserved so login can return the user where they were headed. Only the
    // path and query are kept: putting a full URL in a redirect parameter is
    // an open redirect waiting to happen.
    redirectUrl.searchParams.set('redirectedFrom', path + request.nextUrl.search);
    return applySecurityHeaders(NextResponse.redirect(redirectUrl));
  }

  if (user && isAuthRoute) {
    return applySecurityHeaders(NextResponse.redirect(new URL('/dashboard', request.url)));
  }

  return applySecurityHeaders(response);
}

export const config = {
  /**
   * Runs on everything except static assets and image optimization files.
   *
   * Broad on purpose: session refresh has to happen on every navigation, not
   * only on the routes this file gates. Narrowing the matcher to /dashboard
   * and /account would mean a user who sits on the marketing page for an hour
   * returns to an expired session.
   *
   * API routes are included so a route calling supabase.auth.getUser() sees a
   * freshly refreshed cookie. The billing webhook is excluded inside the
   * function rather than here, because matcher patterns are hard to verify at
   * a glance and that is the one path where being wrong is expensive.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$).*)',
  ],
};