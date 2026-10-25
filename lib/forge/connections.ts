/**
 * lib/forge/connections.ts
 *
 * Stored platform credentials: LinkedIn, Threads and Bluesky.
 *
 * Every read and write goes through the service client because
 * platform_connections has RLS enabled with no policies: a browser session,
 * even a compromised one, cannot select a token. Callers must already have
 * authenticated the user and pass their id explicitly.
 *
 * Tokens are encrypted before they are written and decrypted only here, at
 * the moment of use.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { decryptSecret, encryptSecret } from './crypto';
import { refreshThreadsToken } from '@/lib/platforms/threads';
import { PlatformError } from '@/lib/platforms/http';

export type ConnectablePlatform = 'linkedin' | 'threads' | 'bluesky';

export const CONNECTABLE_PLATFORMS: readonly ConnectablePlatform[] = ['linkedin', 'threads', 'bluesky'];

export function isConnectablePlatform(value: string): value is ConnectablePlatform {
  return (CONNECTABLE_PLATFORMS as readonly string[]).includes(value);
}

export interface ConnectionSummary {
  platform: ConnectablePlatform;
  account_handle: string | null;
  account_name: string | null;
  scopes: string[];
  expires_at: string | null;
}

export interface Credential {
  id: string;
  platform: ConnectablePlatform;
  accountId: string;
  accountHandle: string | null;
  accessToken: string;
  refreshToken: string | null;
  /** Bluesky app password. */
  secret: string | null;
  scopes: string[];
  expiresAt: string | null;
}

const SUMMARY_COLUMNS = 'platform, account_handle, account_name, scopes, expires_at';

/**
 * A workspace's connections belong to the workspace, whichever member
 * connected them, so an editor can publish to the client's LinkedIn. The
 * personal brand's connections belong to the user alone.
 */
function scoped<Q extends { is: (c: string, v: null) => Q; eq: (c: string, v: string) => Q }>(query: Q, userId: string, workspaceId: string | null): Q {
  return workspaceId ? query.eq('workspace_id', workspaceId) : query.eq('user_id', userId).is('workspace_id', null);
}

export async function listConnections(userId: string, workspaceId: string | null): Promise<ConnectionSummary[]> {
  const query = createServiceClient().from('platform_connections').select(SUMMARY_COLUMNS);
  const { data, error } = await scoped(query, userId, workspaceId).order('platform');
  if (error) throw new Error(`Could not load connections: ${error.message}`);
  return (data ?? []) as ConnectionSummary[];
}

export async function getCredential(userId: string, workspaceId: string | null, platform: ConnectablePlatform): Promise<Credential | null> {
  const query = createServiceClient()
    .from('platform_connections')
    .select('id, platform, account_id, account_handle, access_token_enc, refresh_token_enc, secret_enc, scopes, expires_at')
    .eq('platform', platform);
  const { data } = await scoped(query, userId, workspaceId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;

  const credential: Credential = {
    id: data.id,
    platform,
    accountId: data.account_id,
    accountHandle: data.account_handle,
    accessToken: decryptSecret(data.access_token_enc),
    refreshToken: data.refresh_token_enc ? decryptSecret(data.refresh_token_enc) : null,
    secret: data.secret_enc ? decryptSecret(data.secret_enc) : null,
    scopes: data.scopes ?? [],
    expiresAt: data.expires_at,
  };

  return platform === 'threads' ? renewThreadsIfDue(credential) : credential;
}

/**
 * Threads tokens last 60 days and can be extended once they are a day old.
 * Extending whenever one is used inside its last 30 days keeps an active
 * user connected indefinitely without a background job.
 */
async function renewThreadsIfDue(credential: Credential): Promise<Credential> {
  if (!credential.expiresAt) return credential;
  const remaining = new Date(credential.expiresAt).getTime() - Date.now();
  if (remaining <= 0) throw new PlatformError('Your Threads connection has expired. Reconnect Threads to keep publishing.', 401, true);
  if (remaining > 30 * 86_400_000) return credential;

  const renewed = await refreshThreadsToken(credential.accessToken);
  if (!renewed) return credential;
  await createServiceClient()
    .from('platform_connections')
    .update({ access_token_enc: encryptSecret(renewed.accessToken), expires_at: renewed.expiresAt })
    .eq('id', credential.id);
  return { ...credential, accessToken: renewed.accessToken, expiresAt: renewed.expiresAt };
}

export interface NewConnection {
  platform: ConnectablePlatform;
  accountId: string;
  accountHandle: string | null;
  accountName: string | null;
  accessToken: string;
  refreshToken?: string | null;
  secret?: string | null;
  scopes: string[];
  expiresAt: string | null;
}

/**
 * Replaces any existing connection for the platform in this brand. Delete
 * then insert, because the uniqueness constraint is over an expression
 * (coalesce on workspace_id) that PostgREST's on_conflict cannot target.
 */
export async function saveConnection(userId: string, workspaceId: string | null, connection: NewConnection): Promise<void> {
  const db = createServiceClient();
  await scoped(db.from('platform_connections').delete().eq('platform', connection.platform), userId, workspaceId);
  const { error } = await db.from('platform_connections').insert({
    user_id: userId,
    workspace_id: workspaceId,
    platform: connection.platform,
    account_id: connection.accountId,
    account_handle: connection.accountHandle,
    account_name: connection.accountName,
    access_token_enc: encryptSecret(connection.accessToken),
    refresh_token_enc: connection.refreshToken ? encryptSecret(connection.refreshToken) : null,
    secret_enc: connection.secret ? encryptSecret(connection.secret) : null,
    scopes: connection.scopes,
    expires_at: connection.expiresAt,
  });
  if (error) throw new Error(`Could not save the connection: ${error.message}`);
}

export async function removeConnection(userId: string, workspaceId: string | null, platform: ConnectablePlatform): Promise<void> {
  const { error } = await scoped(createServiceClient().from('platform_connections').delete().eq('platform', platform), userId, workspaceId);
  if (error) throw new Error(`Could not remove the connection: ${error.message}`);
}

// ---------------------------------------------------------------------------
// OAuth state
// ---------------------------------------------------------------------------

const STATE_TTL_MS = 10 * 60_000;

export async function createOAuthState(
  userId: string,
  workspaceId: string | null,
  platform: ConnectablePlatform,
  state: string,
  returnTo: string
): Promise<void> {
  const db = createServiceClient();
  // Old, unused states for this user are cleared opportunistically.
  await db.from('oauth_states').delete().eq('user_id', userId).lt('expires_at', new Date().toISOString());
  const { error } = await db.from('oauth_states').insert({
    state,
    user_id: userId,
    workspace_id: workspaceId,
    platform,
    return_to: returnTo,
    expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
  });
  if (error) throw new Error(`Could not start the connection: ${error.message}`);
}

/** Single use: the row is deleted as it is read. */
export async function consumeOAuthState(
  state: string,
  platform: ConnectablePlatform
): Promise<{ userId: string; workspaceId: string | null; returnTo: string } | null> {
  const { data } = await createServiceClient()
    .from('oauth_states')
    .delete()
    .eq('state', state)
    .eq('platform', platform)
    .select('user_id, workspace_id, return_to, expires_at')
    .maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) return null;
  return { userId: data.user_id, workspaceId: data.workspace_id, returnTo: data.return_to ?? '/dashboard' };
}

/** Only same-site paths are accepted as a post-connect destination. */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value.slice(0, 200);
}
