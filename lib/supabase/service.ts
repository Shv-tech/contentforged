/**
 * lib/supabase/service.ts
 *
 * Service-role Supabase client. Bypasses Row Level Security entirely.
 *
 * REQUIRED FOR BILLING. The usage and billing tables deliberately have no
 * INSERT/UPDATE/DELETE policies for authenticated users — if a user could
 * write their own usage row, quota enforcement would be decorative. Those
 * writes therefore have to come from a client that RLS does not constrain.
 *
 * RULES FOR USING THIS MODULE
 *
 * 1. Server-only. Importing it into a client component leaks
 *    SUPABASE_SERVICE_ROLE_KEY into the browser bundle, which is a full
 *    database compromise: the key can read and write every row of every table
 *    for every user.
 * 2. Never derive identity from it. This client has no session, so
 *    `auth.getUser()` returns nothing. Always resolve the user with the
 *    session-bound client from lib/supabase/server.ts first, then use this one
 *    to write.
 * 3. Every query must be explicitly scoped by user_id. RLS is not there to
 *    catch a missing filter.
 */

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function createServiceClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase service credentials are not configured. ' +
      'SUPABASE_SERVICE_ROLE_KEY must be set (server environment only).'
    );
  }

  cached = createSupabaseClient(url, serviceKey, {
    auth: {
      // No session handling at all: this client is never acting on behalf of a
      // logged-in user, and persisting a session would be meaningless here.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cached;
}