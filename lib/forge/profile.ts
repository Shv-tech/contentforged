/**
 * lib/forge/profile.ts
 *
 * Small server-side reads of a person's settings that many features need:
 * their timezone, the language a brand writes in, and their name and email
 * for messages sent on their behalf.
 *
 * Read with the service client because jobs (the weekly plan, syncs, email
 * webhooks) run without a session.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { isWritingLanguage as isLanguage, type WritingLanguage } from './languages';

export async function timezoneOf(userId: string): Promise<string> {
  const { data } = await createServiceClient().from('profiles').select('timezone').eq('id', userId).maybeSingle();
  const zone = (data?.timezone as string | null) ?? 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return 'UTC';
  }
}

/** The language a brand writes in: the workspace's setting, else the person's. */
export async function brandLanguage(userId: string, workspaceId: string | null): Promise<WritingLanguage> {
  const service = createServiceClient();
  if (workspaceId) {
    const { data } = await service.from('workspaces').select('writing_language').eq('id', workspaceId).maybeSingle();
    if (isLanguage(data?.writing_language)) return data.writing_language;
  }
  const { data } = await service.from('profiles').select('writing_language').eq('id', userId).maybeSingle();
  return isLanguage(data?.writing_language) ? data.writing_language : 'en';
}

export interface Person {
  id: string;
  email: string;
  name: string;
  firstName: string;
}

export async function personById(userId: string): Promise<Person | null> {
  const { data } = await createServiceClient().auth.admin.getUserById(userId);
  const user = data?.user;
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = typeof meta.full_name === 'string' ? meta.full_name.trim() : '';
  const email = user.email ?? '';
  const name = fullName || email.split('@')[0] || 'there';
  return { id: user.id, email, name, firstName: name.split(' ')[0] };
}
