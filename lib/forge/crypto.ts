/**
 * lib/forge/crypto.ts
 *
 * Server-only helpers for secrets at rest.
 *
 * Platform tokens (LinkedIn, Threads, Bluesky) are encrypted with AES-256-GCM
 * before they are written to Postgres, under a key that lives only in the
 * server environment. A database dump, a leaked backup or an over-broad SQL
 * policy then exposes ciphertext rather than working credentials.
 *
 * Format: base64url(iv) . base64url(authTag) . base64url(ciphertext), with a
 * "v1:" prefix so the scheme can be rotated without guessing at old rows.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const VERSION = 'v1';

let cachedKey: Buffer | null = null;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.FORGE_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('FORGE_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add it to the server environment.');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('FORGE_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 of 32 random bytes).');
  }
  cachedKey = key;
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptSecret(payload: string): string {
  const [version, body] = payload.split(':', 2);
  if (version !== VERSION || !body) throw new Error('Unrecognised secret format.');

  const [ivPart, tagPart, dataPart] = body.split('.');
  if (!ivPart || !tagPart || dataPart === undefined) throw new Error('Malformed secret payload.');

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]).toString('utf8');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** URL-safe random token with the given number of bytes of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Constant-time string comparison, for secrets compared in application code. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * One-way hash of a requester identity (IP) for abuse tracking on public
 * endpoints. Salted with the encryption key when present, so the stored value
 * cannot be reversed by hashing the IPv4 space.
 */
export function hashRequester(identity: string): string {
  const salt = process.env.FORGE_ENCRYPTION_KEY ?? 'forge';
  return sha256Hex(`${salt}:${identity}`).slice(0, 32);
}
