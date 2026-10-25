/**
 * lib/forge/account.ts
 *
 * The two account actions that have to be complete to be honest: download
 * my data, and delete my account.
 *
 * EXPORT
 *
 * One zip with a JSON file per kind of record, a README describing each,
 * and the person's uploaded files (voice notes, headshot, logo). Secrets
 * never leave: OAuth tokens, encrypted connector credentials, token hashes
 * and webhook secrets are dropped by column name before anything is
 * written. Tables an older deployment does not have are listed as skipped
 * rather than failing the export.
 *
 * DELETE
 *
 * Cancels billing first (so no charge follows a deletion), keeps work done
 * in other people's workspaces with that workspace's owner, withdraws any
 * formats the person published, removes their stored files, then deletes
 * the auth user. Every user-owned table cascades from auth.users, so the
 * database removes the rest in one transaction.
 */

import { strToU8, zipSync, type Zippable } from 'fflate';
import { createServiceClient } from '@/lib/supabase/service';
import { cancelSubscription } from '@/lib/billing/razorpay';
import { sendAccountDeletedEmail } from '@/lib/mail-service';
import { listUserObjects, removeObjects, type Bucket } from './storage';

interface ExportTable {
  table: string;
  file: string;
  description: string;
  /** Column holding the person's id. */
  key: string;
}

const EXPORT_TABLES: ExportTable[] = [
  { table: 'profiles', file: 'profile', key: 'id', description: 'Your profile and settings.' },
  { table: 'user_context', file: 'brand-brief', key: 'user_id', description: 'Your brand brief: role, beliefs, audience, tone.' },
  { table: 'brand_dna_sources', file: 'brand-sources', key: 'user_id', description: 'Material you gave Forge to learn your brand.' },
  { table: 'workspaces', file: 'workspaces', key: 'user_id', description: 'Workspaces you own.' },
  { table: 'workspace_members', file: 'memberships', key: 'user_id', description: 'Workspaces you belong to, and your role in each.' },
  { table: 'story_items', file: 'story-bank', key: 'user_id', description: 'Your Story Bank.' },
  { table: 'story_proposals', file: 'story-proposals', key: 'user_id', description: 'Stories Forge proposed from your captures, with what you decided.' },
  { table: 'captures', file: 'captures', key: 'user_id', description: 'Voice notes, emails, saves and synced items, with transcripts.' },
  { table: 'capture_addresses', file: 'capture-addresses', key: 'user_id', description: 'Your email-in addresses.' },
  { table: 'voice_samples', file: 'voice-samples', key: 'user_id', description: 'Writing you gave Forge to measure your voice.' },
  { table: 'voice_fingerprints', file: 'voice-fingerprints', key: 'user_id', description: 'Your measured voice.' },
  { table: 'learned_rules', file: 'rules', key: 'user_id', description: 'Rules you set or accepted.' },
  { table: 'drafts', file: 'drafts', key: 'user_id', description: 'Every draft, scheduled post and posted post.' },
  { table: 'draft_versions', file: 'draft-versions', key: 'user_id', description: 'Earlier versions of drafts you edited.' },
  { table: 'draft_comments', file: 'draft-comments', key: 'user_id', description: 'Comments you left on drafts.' },
  { table: 'draft_edits', file: 'draft-edits', key: 'user_id', description: 'How you edited drafts, which Forge learns rules from.' },
  { table: 'campaigns', file: 'campaigns', key: 'user_id', description: 'Campaigns.' },
  { table: 'ideas', file: 'ideas', key: 'user_id', description: 'Your idea queue.' },
  { table: 'weekly_plans', file: 'weekly-plans', key: 'user_id', description: 'Weekly plans.' },
  { table: 'plan_settings', file: 'plan-settings', key: 'user_id', description: 'How your weekly plan is set up.' },
  { table: 'repurpose_sources', file: 'sources', key: 'user_id', description: 'Long material you repurposed.' },
  { table: 'experiments', file: 'experiments', key: 'user_id', description: 'Experiments and their results.' },
  { table: 'predictions', file: 'predictions', key: 'user_id', description: 'Predictions made before posting, and how they landed.' },
  { table: 'post_metrics', file: 'post-results', key: 'user_id', description: 'Results recorded for your posts.' },
  { table: 'short_links', file: 'short-links', key: 'user_id', description: 'Tracked links.' },
  { table: 'goal_endpoints', file: 'goal-connections', key: 'user_id', description: 'Booking and webhook connections (secrets removed).' },
  { table: 'goal_events', file: 'goal-events', key: 'user_id', description: 'Bookings, sign-ups and other goals attributed to posts.' },
  { table: 'post_comments', file: 'post-comments', key: 'user_id', description: 'Comments on your posts that Forge read, and replies you drafted.' },
  { table: 'client_reports', file: 'client-reports', key: 'user_id', description: 'Monthly client reports.' },
  { table: 'brand_kits', file: 'brand-kits', key: 'user_id', description: 'Visual brand kits.' },
  { table: 'formats', file: 'formats', key: 'author_id', description: 'Formats you published.' },
  { table: 'approval_requests', file: 'approvals', key: 'user_id', description: 'Approval requests sent to clients.' },
  { table: 'chat_sessions', file: 'chats', key: 'user_id', description: 'Chat sessions.' },
  { table: 'ebooks', file: 'ebooks', key: 'user_id', description: 'Ebooks and guides.' },
  { table: 'calendar_events', file: 'calendar', key: 'user_id', description: 'Calendar events.' },
  { table: 'watch_accounts', file: 'watched-accounts', key: 'user_id', description: 'Accounts you watch.' },
  { table: 'profile_audits', file: 'profile-audits', key: 'user_id', description: 'Profile audits.' },
  { table: 'grade_cards', file: 'grade-cards', key: 'user_id', description: 'Shared grade cards.' },
  { table: 'platform_connections', file: 'connected-accounts', key: 'user_id', description: 'Social accounts you connected (tokens removed).' },
  { table: 'source_connections', file: 'connected-sources', key: 'user_id', description: 'GitHub, Linear, Notion and calendar connections (credentials removed).' },
  { table: 'extension_tokens', file: 'access-tokens', key: 'user_id', description: 'Extension tokens and API keys (labels and dates only).' },
  { table: 'notification_preferences', file: 'notifications', key: 'user_id', description: 'Notification settings.' },
  { table: 'push_subscriptions', file: 'push-devices', key: 'user_id', description: 'Devices that receive push notifications.' },
  { table: 'email_preferences', file: 'email-preferences', key: 'user_id', description: 'Email settings.' },
  { table: 'device_sessions', file: 'sign-ins', key: 'user_id', description: 'Devices you signed in from.' },
  { table: 'subscriptions', file: 'subscriptions', key: 'user_id', description: 'Your subscription history.' },
  { table: 'product_events', file: 'activity', key: 'user_id', description: 'Product activity Forge recorded to improve the app.' },
];

/** Columns that hold credentials or their derivatives. Never exported. */
const SECRET_COLUMN = /(token|secret|hash|password|credential|_enc$|^auth$|^p256dh$|^endpoint$|refresh|cookie)/i;
/** Some columns match the pattern but are safe and useful. */
const ALLOWED_COLUMNS = new Set(['share_token', 'token_count', 'tokens_used']);

const ROW_LIMIT = 50_000;
const PAGE = 1000;
const MAX_FILE_BYTES = 150 * 1024 * 1024;

function stripSecrets(row: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    if (SECRET_COLUMN.test(column) && !ALLOWED_COLUMNS.has(column)) continue;
    clean[column] = value;
  }
  return clean;
}

async function readAll(table: string, key: string, userId: string): Promise<Record<string, unknown>[]> {
  const db = createServiceClient();
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < ROW_LIMIT; from += PAGE) {
    const { data, error } = await db.from(table).select('*').eq(key, userId).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function chatMessages(sessionIds: string[]): Promise<Record<string, unknown>[]> {
  const db = createServiceClient();
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < sessionIds.length; i += 200) {
    const { data } = await db.from('chat_messages').select('*').in('session_id', sessionIds.slice(i, i + 200)).order('created_at');
    rows.push(...((data ?? []) as Record<string, unknown>[]));
  }
  return rows;
}

export interface ExportResult {
  zip: Uint8Array;
  filename: string;
  counts: Record<string, number>;
}

export async function exportAccount(user: { id: string; email: string }): Promise<ExportResult> {
  const files: Zippable = {};
  const counts: Record<string, number> = {};
  const skipped: string[] = [];
  const readme: string[] = [];

  const results = await Promise.allSettled(EXPORT_TABLES.map((spec) => readAll(spec.table, spec.key, user.id)));
  results.forEach((result, index) => {
    const spec = EXPORT_TABLES[index];
    if (result.status === 'rejected') {
      skipped.push(spec.table);
      return;
    }
    const rows = result.value.map(stripSecrets);
    counts[spec.file] = rows.length;
    if (rows.length === 0) return;
    files[`data/${spec.file}.json`] = strToU8(JSON.stringify(rows, null, 2));
    readme.push(`data/${spec.file}.json (${rows.length})  ${spec.description}`);
  });

  const chats = results[EXPORT_TABLES.findIndex((s) => s.table === 'chat_sessions')];
  if (chats?.status === 'fulfilled' && chats.value.length > 0) {
    const messages = await chatMessages(chats.value.map((c) => String(c.id))).catch(() => []);
    counts['chat-messages'] = messages.length;
    if (messages.length > 0) {
      files['data/chat-messages.json'] = strToU8(JSON.stringify(messages, null, 2));
      readme.push(`data/chat-messages.json (${messages.length})  Messages in your chats.`);
    }
  }

  // Uploaded files, up to a total size that fits a single download.
  let bytes = 0;
  const leftOut: string[] = [];
  for (const bucket of ['captures', 'brand-assets'] as Bucket[]) {
    const paths = await listUserObjects(bucket, user.id).catch(() => []);
    for (const path of paths) {
      const { data } = await createServiceClient().storage.from(bucket).download(path);
      if (!data) continue;
      if (bytes + data.size > MAX_FILE_BYTES) {
        leftOut.push(`${bucket}/${path}`);
        continue;
      }
      bytes += data.size;
      files[`files/${bucket}/${path.slice(user.id.length + 1)}`] = new Uint8Array(await data.arrayBuffer());
    }
  }

  const generated = new Date().toISOString();
  files['README.txt'] = strToU8(
    [
      'Your Forge data',
      '',
      `Account: ${user.email}`,
      `Exported: ${generated}`,
      '',
      'Every file in data/ is JSON: one array of records, with the same fields Forge stores.',
      'Access tokens, connector credentials, password and token hashes, and webhook secrets are never included.',
      '',
      'CONTENTS',
      ...readme,
      bytes > 0 ? `files/  Voice notes, headshots and logos you uploaded (${Math.round(bytes / 1024 / 1024)} MB).` : '',
      leftOut.length > 0 ? `\nThese files were too large for one download. Email support to receive them:\n${leftOut.join('\n')}` : '',
      skipped.length > 0 ? `\nNot available in this deployment: ${skipped.join(', ')}.` : '',
      '',
    ]
      .filter((line) => line !== '')
      .join('\n')
  );

  const zip = zipSync(files, { level: 6, mtime: new Date(generated) });
  return { zip, filename: `forge-export-${generated.slice(0, 10)}.zip`, counts };
}

// ============================================================================
// DELETION
// ============================================================================

/** Shared tables whose rows in someone else's workspace stay with that workspace. */
const WORKSPACE_TABLES = ['drafts', 'story_items', 'ideas', 'captures', 'story_proposals', 'repurpose_sources', 'campaigns', 'post_comments', 'predictions', 'short_links', 'goal_events', 'experiments', 'weekly_plans'];

export interface DeletionSummary {
  subscriptionsCancelled: number;
  filesRemoved: number;
  rowsKeptWithWorkspaces: number;
}

export async function deleteAccount(user: { id: string; email: string; name: string }): Promise<DeletionSummary> {
  const db = createServiceClient();
  const summary: DeletionSummary = { subscriptionsCancelled: 0, filesRemoved: 0, rowsKeptWithWorkspaces: 0 };

  // 1. Billing. Cancel now rather than at period end: there is no account
  //    left to use the remaining time. A failure stops the deletion, because
  //    a live mandate on a deleted account would keep charging.
  const { data: subscriptions } = await db
    .from('subscriptions')
    .select('razorpay_subscription_id, status')
    .eq('user_id', user.id)
    .in('status', ['created', 'authenticated', 'active', 'pending', 'halted']);
  for (const subscription of subscriptions ?? []) {
    try {
      await cancelSubscription(subscription.razorpay_subscription_id as string, false);
      summary.subscriptionsCancelled += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Already cancelled or completed on Razorpay's side is fine.
      if (!/cancel|complete|not.*active/i.test(message)) throw new Error(`Could not cancel the subscription: ${message}`);
    }
  }

  // 2. Work in other people's workspaces belongs to those workspaces.
  const { data: memberships } = await db.from('workspace_members').select('workspace_id, role').eq('user_id', user.id).neq('role', 'owner');
  const workspaceIds = (memberships ?? []).map((m) => m.workspace_id as string);
  if (workspaceIds.length > 0) {
    const { data: workspaces } = await db.from('workspaces').select('id, user_id').in('id', workspaceIds).neq('user_id', user.id);
    for (const workspace of workspaces ?? []) {
      for (const table of WORKSPACE_TABLES) {
        const { data, error } = await db.from(table).update({ user_id: workspace.user_id }).eq('user_id', user.id).eq('workspace_id', workspace.id).select('user_id');
        if (error) console.error(`[forge/account] reassign ${table}:`, error.message);
        summary.rowsKeptWithWorkspaces += data?.length ?? 0;
      }
    }
  }

  // 3. Published formats may carry the author's example post: withdraw them.
  await db.from('formats').update({ removed_at: new Date().toISOString(), example: null }).eq('author_id', user.id).is('removed_at', null);

  // 4. Stored files.
  for (const bucket of ['captures', 'brand-assets'] as Bucket[]) {
    const paths = await listUserObjects(bucket, user.id).catch(() => []);
    for (let i = 0; i < paths.length; i += 100) {
      await removeObjects(bucket, paths.slice(i, i + 100)).catch((error) => console.error('[forge/account] storage:', error));
    }
    summary.filesRemoved += paths.length;
  }

  // 5. The account itself. Everything else cascades.
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`Could not delete the account: ${error.message}`);

  if (user.email) await sendAccountDeletedEmail({ to: user.email, firstName: user.name }).catch(() => false);
  return summary;
}
