/**
 * lib/forge/http.ts
 *
 * Request plumbing shared by the intelligence routes: identity, validation
 * and error responses.
 *
 * Two ways to be authenticated:
 *   1. The Supabase session cookie, for the web app.
 *   2. A personal access token (Authorization: Bearer fx_...), for the
 *      browser extension, which cannot share the site's cookies.
 *
 * Token requests get the service-role client, because they carry no Supabase
 * session for RLS to evaluate. Every query on that path must therefore filter
 * by the resolved userId explicitly; `ForgeContext.db` documents which client
 * is in use so a route cannot forget.
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ZodError, ZodType, ZodTypeDef } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { timingSafeEqual } from 'node:crypto';
import { sha256Hex } from './crypto';
import { observe } from '@/lib/ops/observe';
import { noteUser, opsContext } from '@/lib/ops/recorder';

export type ApiScope = 'read' | 'write' | 'generate';
export const API_SCOPES: readonly ApiScope[] = ['read', 'write', 'generate'];

export interface ForgeContext {
  userId: string;
  email: string;
  name: string;
  via: 'session' | 'token';
  /** RLS-scoped for sessions; service role for tokens. Always filter by userId. */
  db: SupabaseClient;
  /** What an API key may do. Null for sessions and extension tokens, which may do anything the person can. */
  scopes: ApiScope[] | null;
  /** An API key pinned to one workspace acts for that brand, whatever is active in the app. */
  workspacePin: string | null;
  /** The token's id, for per-key rate limits. */
  tokenId: string | null;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export const TOKEN_PREFIX = 'fx_';

export async function requireUser(req?: Request): Promise<ForgeContext> {
  const authorization = req?.headers.get('authorization') ?? '';
  if (authorization.startsWith(`Bearer ${TOKEN_PREFIX}`)) {
    const ctx = await resolveToken(authorization.slice('Bearer '.length).trim());
    noteUser(ctx.userId);
    // API keys are for the public API and the MCP server only. Everything
    // else in /api is the app's own surface, reachable with a session or the
    // extension's token.
    if (ctx.scopes !== null && req) {
      const path = new URL(req.url).pathname;
      if (!path.startsWith('/api/v1/') && path !== '/api/mcp') throw new HttpError(403, 'API keys work with /api/v1 and /api/mcp only.');
    }
    return ctx;
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'Sign in to continue.');

  const user = data.user;
  noteUser(user.id);
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = typeof meta.full_name === 'string' ? meta.full_name : '';

  return {
    userId: user.id,
    email: user.email ?? '',
    name: fullName.split(' ')[0] || (user.email ?? '').split('@')[0] || 'there',
    via: 'session',
    db: supabase as unknown as SupabaseClient,
    scopes: null,
    workspacePin: null,
    tokenId: null,
  };
}

async function resolveToken(token: string): Promise<ForgeContext> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('extension_tokens')
    .select('id, user_id, revoked_at, kind, scopes, workspace_id')
    .eq('token_hash', sha256Hex(token))
    .maybeSingle();

  if (error || !data || data.revoked_at) throw new HttpError(401, 'This access token is not valid. Create a new one in Forge settings.');

  const { data: userData } = await service.auth.admin.getUserById(data.user_id);
  const email = userData?.user?.email ?? '';
  const meta = (userData?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = typeof meta.full_name === 'string' ? meta.full_name : '';

  // Fire-and-forget: last-used is informational and must not slow requests.
  void service.from('extension_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);

  return {
    userId: data.user_id,
    email,
    name: fullName.split(' ')[0] || email.split('@')[0] || 'there',
    via: 'token',
    db: service,
    scopes: data.kind === 'api' ? ((data.scopes ?? []) as ApiScope[]) : null,
    workspacePin: (data.workspace_id as string | null) ?? null,
    tokenId: data.id,
  };
}

/** Throws 403 when an API key was not given `scope`. Sessions pass. */
export function requireScope(ctx: ForgeContext, scope: ApiScope): void {
  if (ctx.scopes !== null && !ctx.scopes.includes(scope)) {
    throw new HttpError(403, `This API key does not have the "${scope}" scope.`);
  }
}

export async function parseJson<Output, Input = Output>(req: Request, schema: ZodType<Output, ZodTypeDef, Input>): Promise<Output> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, 'The request body must be JSON.');
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, describeZodError(result.error));
  return result.data;
}

function describeZodError(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'The request was not valid.';
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

/**
 * Wraps a route handler so thrown HttpErrors become JSON responses and
 * anything unexpected becomes a logged 500 with no internals leaked. Every
 * call is recorded for the monitoring dashboard (lib/ops/observe.ts), and a
 * 500 carries a reference the person can quote to support.
 */
export function route<Args extends unknown[]>(name: string, handler: (...args: Args) => Promise<Response>): (...args: Args) => Promise<Response> {
  return (...args: Args) => {
    const req = args[0] instanceof Request ? args[0] : null;
    return observe(name, req, async () => {
      try {
        return await handler(...args);
      } catch (error) {
        if (error instanceof HttpError) {
          return NextResponse.json({ error: error.message, ...error.extra }, { status: error.status });
        }
        console.error(`[${name}]`, error);
        const ops = opsContext();
        if (ops) ops.error = error;
        const reference = ops?.requestId;
        return NextResponse.json(
          {
            error: reference ? `Something went wrong on our side. Please try again. Reference: ${reference}` : 'Something went wrong on our side. Please try again.',
            ...(reference ? { reference } : {}),
          },
          { status: 500 }
        );
      }
    });
  };
}

/** Best-effort client IP for rate limiting public endpoints. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Constant-time comparison for secrets carried in headers. */
export function safeEqualHeader(actual: string | null, expected: string): boolean {
  if (!actual) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
