/**
 * lib/forge/capture/email.ts
 *
 * Email-in: every brand gets a private address. Forward a client's thank-you,
 * a result, a thread worth writing about, and it lands in the capture inbox.
 *
 * Inbound mail arrives through Resend's receiving webhook. The webhook only
 * carries metadata, so the body is fetched from Resend's API by id. Mail is
 * accepted only from the account's own address and any extra senders the
 * person allows, so a leaked address cannot fill someone's inbox.
 */

import { randomBytes } from 'node:crypto';
import * as cheerio from 'cheerio';
import { Resend } from 'resend';
import { createServiceClient } from '@/lib/supabase/service';
import { HttpError } from '../http';
import { brandLanguage, personById } from '../profile';
import { createCapture, processCapture } from './ingest';

export interface CaptureAddress {
  id: string;
  address: string;
  allowed_senders: string[];
  created_at: string;
}

const ADDRESS_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function inboundDomain(): string | null {
  return process.env.FORGE_INBOUND_DOMAIN?.trim().toLowerCase() || null;
}

function newLocalPart(): string {
  const bytes = randomBytes(16);
  return Array.from(bytes, (b) => ADDRESS_ALPHABET[b % ADDRESS_ALPHABET.length]).join('');
}

type Filterable<Q> = { is: (c: string, v: null) => Q; eq: (c: string, v: string) => Q };
function scoped<Q extends Filterable<Q>>(query: Q, workspaceId: string | null): Q {
  return workspaceId ? query.eq('workspace_id', workspaceId) : query.is('workspace_id', null);
}

function present(row: { id: string; local_part: string; allowed_senders: string[]; created_at: string }, domain: string): CaptureAddress {
  return { id: row.id, address: `${row.local_part}@${domain}`, allowed_senders: row.allowed_senders, created_at: row.created_at };
}

/** The brand's current address, created on first request. */
export async function getCaptureAddress(userId: string, workspaceId: string | null): Promise<CaptureAddress | null> {
  const domain = inboundDomain();
  if (!domain) return null;
  const service = createServiceClient();

  const query = service.from('capture_addresses').select('id, local_part, allowed_senders, created_at').eq('user_id', userId).is('revoked_at', null);
  const { data } = await scoped(query, workspaceId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (data) return present(data, domain);

  const { data: created, error } = await service
    .from('capture_addresses')
    .insert({ user_id: userId, workspace_id: workspaceId, local_part: newLocalPart() })
    .select('id, local_part, allowed_senders, created_at')
    .single();
  if (error || !created) throw new Error(`Could not create a capture address: ${error?.message ?? 'unknown error'}`);
  return present(created, domain);
}

/** Retires the current address and issues a new one, for when an address leaks. */
export async function rotateCaptureAddress(userId: string, workspaceId: string | null): Promise<CaptureAddress | null> {
  const query = createServiceClient().from('capture_addresses').update({ revoked_at: new Date().toISOString() }).eq('user_id', userId).is('revoked_at', null);
  await scoped(query, workspaceId);
  return getCaptureAddress(userId, workspaceId);
}

export async function setAllowedSenders(userId: string, workspaceId: string | null, senders: string[]): Promise<CaptureAddress | null> {
  const cleaned = Array.from(new Set(senders.map((s) => s.trim().toLowerCase()).filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)))).slice(0, 10);
  const query = createServiceClient().from('capture_addresses').update({ allowed_senders: cleaned }).eq('user_id', userId).is('revoked_at', null);
  await scoped(query, workspaceId);
  return getCaptureAddress(userId, workspaceId);
}

// ============================================================================
// INBOUND
// ============================================================================

function resend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new HttpError(503, 'RESEND_API_KEY is not configured.');
  return new Resend(key);
}

/** Verifies the Svix signature Resend puts on webhooks. Throws 401 when it does not match. */
export function verifyInboundWebhook(payload: string, headers: Headers): { type: string; data: Record<string, unknown> } {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, 'RESEND_INBOUND_WEBHOOK_SECRET is not configured.');
  try {
    const event = resend().webhooks.verify({
      payload,
      headers: {
        id: headers.get('svix-id') ?? '',
        timestamp: headers.get('svix-timestamp') ?? '',
        signature: headers.get('svix-signature') ?? '',
      },
      webhookSecret: secret,
    }) as unknown as { type: string; data: Record<string, unknown> };
    return event;
  } catch {
    throw new HttpError(401, 'Invalid signature.');
  }
}

function bareAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, head').remove();
  $('br').replaceWith('\n');
  $('p, div, li, tr, h1, h2, h3').each((_, el) => {
    $(el).append('\n');
  });
  return $.root().text().replace(/\n{3,}/g, '\n\n').trim();
}

/** Drops quoted replies and signatures, which are rarely the point of a forward. */
function trimReply(text: string): string {
  const cut = text.search(/\n(?:-- ?\n|Sent from my |On .{5,80} wrote:)/);
  return (cut > 200 ? text.slice(0, cut) : text).trim();
}

export interface InboundResult {
  accepted: number;
  ignored: number;
}

export async function handleInboundEmail(data: Record<string, unknown>): Promise<InboundResult> {
  const domain = inboundDomain();
  if (!domain) throw new HttpError(503, 'FORGE_INBOUND_DOMAIN is not configured.');

  const recipients = [...(Array.isArray(data.to) ? data.to : []), ...(Array.isArray(data.received_for) ? data.received_for : [])]
    .filter((value): value is string => typeof value === 'string')
    .map(bareAddress)
    .filter((address) => address.endsWith(`@${domain}`))
    .map((address) => address.split('@')[0]);
  const localParts = Array.from(new Set(recipients));
  if (localParts.length === 0) return { accepted: 0, ignored: 1 };

  const service = createServiceClient();
  const { data: addresses } = await service
    .from('capture_addresses')
    .select('id, user_id, workspace_id, local_part, allowed_senders')
    .in('local_part', localParts)
    .is('revoked_at', null);
  if (!addresses || addresses.length === 0) return { accepted: 0, ignored: 1 };

  const emailId = typeof data.email_id === 'string' ? data.email_id : null;
  if (!emailId) return { accepted: 0, ignored: 1 };
  const { data: email, error } = await resend().emails.receiving.get(emailId);
  if (error || !email) throw new Error(`Could not fetch the received email: ${error?.message ?? 'not found'}`);

  const sender = bareAddress(email.from);
  const body = trimReply(email.text?.trim() || (email.html ? htmlToText(email.html) : ''));

  let accepted = 0;
  let ignored = 0;
  for (const address of addresses) {
    const owner = await personById(address.user_id);
    const allowed = new Set([owner?.email.toLowerCase(), ...(address.allowed_senders as string[])].filter(Boolean));
    if (!allowed.has(sender)) {
      ignored += 1;
      continue;
    }

    const capture = await createCapture(service, address.user_id, address.workspace_id, {
      source: 'email',
      title: email.subject?.slice(0, 200) || 'Forwarded email',
      rawText: `Subject: ${email.subject ?? ''}\n\n${body}`.slice(0, 200_000),
      metadata: { from: sender, attachments: email.attachments?.length ?? 0 },
      externalId: email.message_id || emailId,
    });
    if (!capture) continue;
    await processCapture(service, capture, { language: await brandLanguage(address.user_id, address.workspace_id) });
    accepted += 1;
  }

  return { accepted, ignored };
}
