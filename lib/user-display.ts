// lib/user-display.ts

import type { AppUser } from '@/lib/store';

/**
 * Single source of truth for how a user's name is displayed.
 *
 * Three components previously derived this independently — the sidebar, the
 * editor greeting, and the account page — each with slightly different
 * fallback logic, and all three read `user.user_metadata.full_name`, a field
 * the client-side user object never had. The result was a name that saved
 * correctly to Supabase and then appeared nowhere.
 *
 * Precedence:
 *   1. The name the user set for themselves
 *   2. The local part of their email, capitalized
 *   3. A neutral fallback
 */
export function displayName(user: AppUser | null | undefined): string {
  const explicit = user?.fullName?.trim();
  if (explicit) return explicit;

  const emailPrefix = user?.email?.split('@')[0];
  if (emailPrefix) {
    return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
  }

  return 'there';
}

/** First name only, for greetings and compact UI. */
export function firstName(user: AppUser | null | undefined): string {
  return displayName(user).split(' ')[0];
}

/** Single initial for avatars. */
export function userInitial(user: AppUser | null | undefined): string {
  return displayName(user).charAt(0).toUpperCase();
}

/**
 * Builds an AppUser from a Supabase auth user.
 *
 * Supabase stores the display name under `user_metadata.full_name`, and
 * different sign-up paths populate different keys: email sign-up writes
 * whatever the app sends, while OAuth providers commonly use `name`. Both are
 * checked so a Google sign-in does not show an email prefix when the provider
 * already supplied a real name.
 *
 * Every place that calls setUser should go through this, so the mapping from
 * Supabase's shape to the client's shape exists in exactly one place.
 */
export function toAppUser(supabaseUser: any): AppUser | null {
  if (!supabaseUser?.id) return null;

  const metadata = supabaseUser.user_metadata ?? {};
  const name =
    (typeof metadata.full_name === 'string' && metadata.full_name.trim()) ||
    (typeof metadata.name === 'string' && metadata.name.trim()) ||
    null;

  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? '',
    fullName: name || null,
  };
}