import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // BYPASS: Authentication is turned off for V2 Enterprise UI Testing.
  // Allows direct access to /dashboard without Supabase login.
  return NextResponse.next({ request });
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/signup'],
};