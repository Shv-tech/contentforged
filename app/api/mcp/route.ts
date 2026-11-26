/**
 * app/api/mcp/route.ts
 *
 * Forge's MCP server, Streamable HTTP transport, stateless.
 *
 * POST  one JSON-RPC message, or a batch for clients on 2025-03-26 and
 *       earlier. Authenticate with "Authorization: Bearer fx_..." using an
 *       API key from Account. Responses are application/json.
 * GET   405: this server never opens a stream to the client.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { HttpError } from '@/lib/forge/http';
import { handleMessage, protocolVersionAllowed, RPC_ERRORS, type JsonRpcResponse } from '@/lib/forge/mcp';
import { apiCaller, type ApiCaller } from '@/lib/forge/public-api';
import { observed } from '@/lib/ops/observe';

const MAX_BATCH = 20;

function rpcError(status: number, code: number, message: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code, message } }, { status, headers });
}

async function handlePOST(req: Request) {
  if (!protocolVersionAllowed(req.headers.get('mcp-protocol-version'))) {
    return rpcError(400, RPC_ERRORS.invalidRequest, 'Unsupported MCP-Protocol-Version.');
  }

  let caller: ApiCaller;
  try {
    caller = await apiCaller(req);
  } catch (error) {
    if (error instanceof HttpError) {
      const headers: Record<string, string> = error.status === 401 ? { 'WWW-Authenticate': 'Bearer realm="forge", error="invalid_token"' } : {};
      return rpcError(error.status, RPC_ERRORS.invalidRequest, error.message, headers);
    }
    console.error('[mcp:auth]', error);
    return rpcError(500, RPC_ERRORS.internal, 'Forge could not authenticate the request.');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return rpcError(400, RPC_ERRORS.parse, 'The request body must be JSON.');
  }

  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > MAX_BATCH) return rpcError(400, RPC_ERRORS.invalidRequest, `A batch must hold 1 to ${MAX_BATCH} messages.`);
    const replies: JsonRpcResponse[] = [];
    for (const message of body) {
      const reply = await handleMessage(caller, message);
      if (reply) replies.push(reply);
    }
    return replies.length > 0 ? NextResponse.json(replies) : new Response(null, { status: 202 });
  }

  const reply = await handleMessage(caller, body);
  return reply ? NextResponse.json(reply) : new Response(null, { status: 202 });
}

async function handleGET() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}

async function handleDELETE() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}

export const POST = observed('api/mcp', handlePOST);
export const GET = observed('api/mcp', handleGET);
export const DELETE = observed('api/mcp', handleDELETE);
