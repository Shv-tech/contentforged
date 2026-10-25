/**
 * app/api/brand-kit/route.ts
 *
 * GET    the active brand's kit, with preview links for its images
 * PATCH  name, handle, typeface, colours, or an uploaded image's path
 * POST   { kind, contentType, size }  a signed URL to upload a headshot or
 *        logo; PATCH the returned path to use it
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { brandRequest } from '@/lib/forge/brand-request';
import { getBrandKit, KIT_PALETTES, saveBrandKit } from '@/lib/forge/data/brand-kit';
import { HttpError, parseJson, route } from '@/lib/forge/http';
import { assertOwnedPath, baseMediaType, IMAGE_TYPES, MAX_BYTES, newObjectPath, removeObjects, signedReadUrl, signedUploadUrl } from '@/lib/forge/storage';

async function withPreviews<T extends { headshot_path: string | null; logo_path: string | null }>(kit: T) {
  const [headshotUrl, logoUrl] = await Promise.all([
    kit.headshot_path ? signedReadUrl('brand-assets', kit.headshot_path, 3600) : null,
    kit.logo_path ? signedReadUrl('brand-assets', kit.logo_path, 3600) : null,
  ]);
  return { ...kit, headshotUrl, logoUrl };
}

export const GET = route('api/brand-kit:get', async (req: Request) => {
  const { ctx, workspaceId } = await brandRequest(req);
  return NextResponse.json({ kit: await withPreviews(await getBrandKit(ctx.db, ctx.userId, workspaceId)), palettes: KIT_PALETTES });
});

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a colour like #FF8A2B.');

const PatchSchema = z
  .object({
    display_name: z.string().trim().max(80).nullable().optional(),
    handle: z.string().trim().max(60).nullable().optional(),
    font: z.enum(['sans', 'serif', 'mono']).optional(),
    background: hex.optional(),
    ink: hex.optional(),
    accent: hex.optional(),
    headshot_path: z.string().max(300).nullable().optional(),
    logo_path: z.string().max(300).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update.');

export const PATCH = route('api/brand-kit:patch', async (req: Request) => {
  const patch = await parseJson(req, PatchSchema);
  const { ctx, workspaceId } = await brandRequest(req, { write: true, feature: 'visuals' });

  const current = await getBrandKit(ctx.db, ctx.userId, workspaceId);
  for (const key of ['headshot_path', 'logo_path'] as const) {
    const next = patch[key];
    if (next) assertOwnedPath(ctx.userId, next);
    // A replaced or removed image is deleted, so storage holds only what is in use.
    if (next !== undefined && current[key] && current[key] !== next) await removeObjects('brand-assets', [current[key] as string]);
  }

  return NextResponse.json({ kit: await withPreviews(await saveBrandKit(ctx.db, ctx.userId, workspaceId, patch)) });
});

const UploadSchema = z.object({ kind: z.enum(['headshot', 'logo']), contentType: z.string().max(100), size: z.number().int().positive() });

export const POST = route('api/brand-kit:post', async (req: Request) => {
  const input = await parseJson(req, UploadSchema);
  const { ctx } = await brandRequest(req, { write: true, feature: 'visuals' });
  const extension = IMAGE_TYPES[baseMediaType(input.contentType)];
  if (!extension) throw new HttpError(415, 'Use a PNG, JPEG or WebP image.');
  if (input.size > MAX_BYTES['brand-assets']) throw new HttpError(413, 'Images can be up to 5 MB.');
  return NextResponse.json(await signedUploadUrl('brand-assets', newObjectPath(ctx.userId, input.kind, extension)));
});
