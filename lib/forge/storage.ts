/**
 * lib/forge/storage.ts
 *
 * Private file storage for audio captures and brand assets.
 *
 * Browsers upload straight to Supabase Storage through a signed upload URL
 * minted here, because serverless request bodies are capped at a few
 * megabytes and a 40-minute interview is not. Reads happen on the server
 * through the service role. Both buckets are private and have no client
 * policies; every object lives under its owner's user id, and every path a
 * client hands back is checked against that prefix before it is used.
 */

import { randomUUID } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { HttpError } from './http';

export type Bucket = 'captures' | 'brand-assets';

export const AUDIO_TYPES: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Upload limits per bucket, matching the bucket definitions in the migration. */
export const MAX_BYTES: Record<Bucket, number> = {
  captures: 25 * 1024 * 1024,
  'brand-assets': 5 * 1024 * 1024,
};

/** The media type without parameters: "audio/webm;codecs=opus" becomes "audio/webm". */
export function baseMediaType(contentType: string): string {
  return contentType.split(';')[0].trim().toLowerCase();
}

export function newObjectPath(userId: string, folder: string, extension: string): string {
  return `${userId}/${folder}/${randomUUID()}.${extension}`;
}

/** Rejects a path that does not belong to the user, or that tries to escape its folder. */
export function assertOwnedPath(userId: string, path: string): void {
  if (!path.startsWith(`${userId}/`) || path.includes('..') || path.length > 300) {
    throw new HttpError(400, 'That file does not belong to this account.');
  }
}

export async function signedUploadUrl(bucket: Bucket, path: string): Promise<{ path: string; token: string; signedUrl: string }> {
  const { data, error } = await createServiceClient().storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Could not prepare the upload: ${error?.message ?? 'unknown error'}`);
  return { path, token: data.token, signedUrl: data.signedUrl };
}

export async function downloadObject(bucket: Bucket, path: string): Promise<{ bytes: Buffer; contentType: string }> {
  const { data, error } = await createServiceClient().storage.from(bucket).download(path);
  if (error || !data) throw new HttpError(404, 'The uploaded file could not be found. Upload it again.');
  return { bytes: Buffer.from(await data.arrayBuffer()), contentType: data.type || 'application/octet-stream' };
}

export async function removeObjects(bucket: Bucket, paths: string[]): Promise<void> {
  const valid = paths.filter(Boolean);
  if (valid.length === 0) return;
  const { error } = await createServiceClient().storage.from(bucket).remove(valid);
  if (error) console.error(`[forge/storage] could not remove from ${bucket}:`, error.message);
}

/** Every object under a user's prefix, for export and deletion. */
export async function listUserObjects(bucket: Bucket, userId: string): Promise<string[]> {
  const storage = createServiceClient().storage.from(bucket);
  const paths: string[] = [];
  const { data: folders } = await storage.list(userId, { limit: 100 });
  for (const folder of folders ?? []) {
    const { data: files } = await storage.list(`${userId}/${folder.name}`, { limit: 1000 });
    for (const file of files ?? []) paths.push(`${userId}/${folder.name}/${file.name}`);
  }
  return paths;
}

/** A short-lived link for a private object, for previews in the browser. */
export async function signedReadUrl(bucket: Bucket, path: string, seconds = 3600): Promise<string | null> {
  const { data } = await createServiceClient().storage.from(bucket).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}
