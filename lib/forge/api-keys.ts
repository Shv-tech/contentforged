/**
 * lib/forge/api-keys.ts
 *
 * API keys for the public API (/api/v1) and the MCP server (/api/mcp).
 *
 * Keys share the extension's token table and its guarantees: only a SHA-256
 * of the key is stored, the key is shown once, and revoking is immediate.
 * Unlike extension tokens, an API key carries scopes (read, write,
 * generate), can be pinned to one workspace, and works only on the public
 * API surface (enforced in requireUser).
 */

import { createServiceClient } from '@/lib/supabase/service';
import { randomToken, sha256Hex } from './crypto';
import { HttpError, TOKEN_PREFIX, type ApiScope } from './http';

export const MAX_API_KEYS = 20;

export const SCOPE_DESCRIPTIONS: Record<ApiScope, string> = {
  read: 'Read your voice, Story Bank, ideas and drafts',
  write: 'Create drafts and save stories',
  generate: 'Write and grade posts (uses your plan’s allowance)',
};

export interface ApiKeySummary {
  id: string;
  label: string;
  prefix: string | null;
  scopes: ApiScope[];
  workspace_id: string | null;
  last_used_at: string | null;
  created_at: string;
}

export async function listApiKeys(userId: string): Promise<ApiKeySummary[]> {
  const { data, error } = await createServiceClient()
    .from('extension_tokens')
    .select('id, label, prefix, scopes, workspace_id, last_used_at, created_at')
    .eq('user_id', userId)
    .eq('kind', 'api')
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ApiKeySummary[];
}

/** Creates a key and returns it once, in full. Only its hash is kept. */
export async function createApiKey(userId: string, input: { label: string; scopes: ApiScope[]; workspaceId: string | null }): Promise<{ key: string; summary: ApiKeySummary }> {
  if ((await listApiKeys(userId)).length >= MAX_API_KEYS) throw new HttpError(409, `You can have up to ${MAX_API_KEYS} API keys. Revoke one first.`);
  if (input.scopes.length === 0) throw new HttpError(400, 'Choose at least one scope.');

  const key = `${TOKEN_PREFIX}${randomToken(32)}`;
  const { data, error } = await createServiceClient()
    .from('extension_tokens')
    .insert({
      user_id: userId,
      label: input.label.trim().slice(0, 80) || 'API key',
      token_hash: sha256Hex(key),
      kind: 'api',
      scopes: Array.from(new Set(input.scopes)),
      workspace_id: input.workspaceId,
      prefix: key.slice(0, 10),
    })
    .select('id, label, prefix, scopes, workspace_id, last_used_at, created_at')
    .single();
  if (error || !data) throw new Error(`Could not create the key: ${error?.message ?? 'unknown error'}`);
  return { key, summary: data as ApiKeySummary };
}

export async function revokeApiKey(userId: string, id: string): Promise<void> {
  const { data, error } = await createServiceClient()
    .from('extension_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('kind', 'api')
    .is('revoked_at', null)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new HttpError(404, 'Key not found.');
}
