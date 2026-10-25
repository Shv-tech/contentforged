/**
 * lib/forge/capture/sync.ts
 *
 * Stored source connections and the job that reads them.
 *
 * source_connections has RLS enabled with no policies, so every read and
 * write here goes through the service client after the caller has been
 * authenticated, and the encrypted credential never leaves this module.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { decryptSecret, encryptSecret } from '../crypto';
import { HttpError } from '../http';
import { brandLanguage } from '../profile';
import { createCapture, processCapture } from './ingest';
import { CAPTURE_SOURCE_FOR, readSource, verifySource, type SourceConfig, type SourceProvider } from './sources';

export interface SourceSummary {
  id: string;
  provider: SourceProvider;
  label: string | null;
  config: SourceConfig;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
}

const SUMMARY_COLUMNS = 'id, provider, label, config, last_synced_at, last_error, created_at';
const FIRST_SYNC_DAYS = 7;
const MAX_LOOKBACK_DAYS = 14;

type Filterable<Q> = { is: (c: string, v: null) => Q; eq: (c: string, v: string) => Q };

/** Sources belong to the brand, whichever member connected them. */
function scoped<Q extends Filterable<Q>>(query: Q, userId: string, workspaceId: string | null): Q {
  return workspaceId ? query.eq('workspace_id', workspaceId) : query.eq('user_id', userId).is('workspace_id', null);
}

export async function listSources(userId: string, workspaceId: string | null): Promise<SourceSummary[]> {
  const query = createServiceClient().from('source_connections').select(SUMMARY_COLUMNS);
  const { data, error } = await scoped(query, userId, workspaceId).order('created_at');
  if (error) throw new Error(`Could not load sources: ${error.message}`);
  return (data ?? []) as SourceSummary[];
}

export async function connectSource(userId: string, workspaceId: string | null, provider: SourceProvider, secret: string, config: SourceConfig): Promise<SourceSummary> {
  const trimmed = secret.trim();
  if (trimmed.length < 8 || trimmed.length > 2000) throw new HttpError(400, 'That credential does not look right.');
  const label = await verifySource(provider, trimmed, config);

  const service = createServiceClient();
  await scoped(service.from('source_connections').delete().eq('provider', provider), userId, workspaceId);
  const { data, error } = await service
    .from('source_connections')
    .insert({ user_id: userId, workspace_id: workspaceId, provider, label, config, secret_enc: encryptSecret(trimmed) })
    .select(SUMMARY_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not save the source: ${error?.message ?? 'unknown error'}`);
  return data as SourceSummary;
}

export async function disconnectSource(userId: string, workspaceId: string | null, id: string): Promise<void> {
  const { error } = await scoped(createServiceClient().from('source_connections').delete().eq('id', id), userId, workspaceId);
  if (error) throw new Error(`Could not remove the source: ${error.message}`);
}

interface StoredSource {
  id: string;
  user_id: string;
  workspace_id: string | null;
  provider: SourceProvider;
  config: SourceConfig;
  secret_enc: string | null;
  last_synced_at: string | null;
}

/**
 * Reads one source since its last sync and turns what it finds into
 * captures. Returns how many captures were created.
 */
export async function syncSource(source: StoredSource): Promise<number> {
  const service = createServiceClient();
  const now = new Date();
  const floor = new Date(now.getTime() - MAX_LOOKBACK_DAYS * 86_400_000);
  const since = source.last_synced_at ? new Date(Math.max(new Date(source.last_synced_at).getTime(), floor.getTime())) : new Date(now.getTime() - FIRST_SYNC_DAYS * 86_400_000);

  try {
    if (!source.secret_enc) throw new HttpError(400, 'This source has no credential. Connect it again.');
    const materials = await readSource(source.provider, decryptSecret(source.secret_enc), source.config, since);
    const language = await brandLanguage(source.user_id, source.workspace_id);

    let created = 0;
    for (const material of materials) {
      const capture = await createCapture(service, source.user_id, source.workspace_id, {
        source: CAPTURE_SOURCE_FOR[source.provider],
        title: material.title,
        rawText: material.text,
        metadata: material.metadata,
        externalId: material.externalId,
      });
      if (!capture) continue;
      await processCapture(service, capture, { language });
      created += 1;
    }

    await service.from('source_connections').update({ last_synced_at: now.toISOString(), last_error: null }).eq('id', source.id);
    return created;
  } catch (error) {
    const message = error instanceof HttpError ? error.message : 'The last sync failed. It will be retried.';
    await service.from('source_connections').update({ last_error: message }).eq('id', source.id);
    if (!(error instanceof HttpError)) console.error('[forge/sources] sync failed for', source.id, error);
    return 0;
  }
}

/** Sync one source on request, for the "Sync now" button. */
export async function syncSourceById(userId: string, workspaceId: string | null, id: string): Promise<number> {
  const query = createServiceClient().from('source_connections').select('id, user_id, workspace_id, provider, config, secret_enc, last_synced_at').eq('id', id);
  const { data } = await scoped(query, userId, workspaceId).maybeSingle();
  if (!data) throw new HttpError(404, 'Source not found.');
  return syncSource(data as StoredSource);
}

/** Every source due a sync, oldest first. Used by the cron job. */
export async function dueSources(limit: number): Promise<StoredSource[]> {
  const cutoff = new Date(Date.now() - 5 * 3_600_000).toISOString();
  const { data, error } = await createServiceClient()
    .from('source_connections')
    .select('id, user_id, workspace_id, provider, config, secret_enc, last_synced_at')
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`)
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as StoredSource[];
}
