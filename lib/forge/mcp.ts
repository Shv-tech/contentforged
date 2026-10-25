/**
 * lib/forge/mcp.ts
 *
 * A Model Context Protocol server for Forge, so Claude (or any MCP client)
 * can write as the person, check text against their voice, and look up
 * their true stories without leaving the conversation.
 *
 * It speaks the Streamable HTTP transport in its stateless form: every POST
 * carries one JSON-RPC message (or a batch, for older clients) and gets a
 * JSON reply. There are no sessions and no server-initiated messages, which
 * is all a tool server needs and keeps it serverless-friendly.
 *
 * Tools are thin wrappers over lib/forge/public-api, so the MCP server and
 * the REST API can never disagree. Nothing here posts anywhere: draft_post
 * saves a draft for the person to review in Forge.
 */

import { z, type ZodType } from 'zod';
import { HttpError } from './http';
import * as api from './public-api';
import { DRAFT_PLATFORMS } from './types';

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;
const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export const SERVER_INFO = { name: 'forge', title: 'Forge', version: '1.0.0' };

const INSTRUCTIONS = [
  'Forge holds this person\'s measured writing voice, their Story Bank of true experiences, and their idea queue.',
  'Before writing anything they will publish, call get_voice and follow its instructions.',
  'Only use facts from search_stories or from the person; never invent numbers, names or events.',
  'draft_post saves a draft in Forge for the person to review. Nothing is ever posted automatically.',
].join(' ');

/** JSON-RPC 2.0 error codes used by MCP. */
export const RPC_ERRORS = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

type JsonRpcId = string | number;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId | null;
  method: string;
  params?: Record<string, unknown>;
}

export type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: JsonRpcId | null; result: unknown }
  | { jsonrpc: '2.0'; id: JsonRpcId | null; error: { code: number; message: string; data?: unknown } };

interface ToolDefinition<Input> {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  parse: ZodType<Input>;
  readOnly: boolean;
  run: (caller: api.ApiCaller, input: Input) => Promise<unknown>;
}

function tool<Input>(definition: ToolDefinition<Input>): ToolDefinition<unknown> {
  return definition as ToolDefinition<unknown>;
}

const platformSchema = { type: 'string', enum: [...DRAFT_PLATFORMS], description: 'Where the post will go.' };

export const TOOLS: ToolDefinition<unknown>[] = [
  tool({
    name: 'get_voice',
    title: 'Get writing voice',
    description: 'The person\'s measured writing voice: traits, language, and instructions to write toward it. Call before drafting anything in their name.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    parse: z.object({}).passthrough(),
    readOnly: true,
    run: (caller) => api.voice(caller),
  }),
  tool({
    name: 'check_voice',
    title: 'Check text against voice',
    description: 'Score text against the person\'s voice. Returns a 0 to 100 score, the lines that drift and why, and phrases that read as machine-written.',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'The text to check.' } }, required: ['text'], additionalProperties: false },
    parse: z.object({ text: z.string().min(1).max(20_000) }),
    readOnly: true,
    run: (caller, input) => api.checkVoice(caller, input.text),
  }),
  tool({
    name: 'grade_opening',
    title: 'Grade an opening',
    description: 'Grade how well the opening of a post earns the next line, with the weakest part named. Uses the person\'s plan allowance.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, platform: platformSchema }, required: ['text'], additionalProperties: false },
    parse: z.object({ text: z.string().min(1).max(4000), platform: z.enum(DRAFT_PLATFORMS).optional() }),
    readOnly: true,
    run: (caller, input) => api.grade(caller, input.text, input.platform),
  }),
  tool({
    name: 'search_stories',
    title: 'Search the Story Bank',
    description: 'Find true stories, metrics, wins and opinions the person has recorded. Use these as the only source of specifics.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Topic to search for. Omit to list recent stories.' }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, additionalProperties: false },
    parse: z.object({ query: z.string().max(200).optional(), limit: z.number().int().min(1).max(20).optional() }),
    readOnly: true,
    run: (caller, input) => api.stories(caller, input.query ?? null, input.limit ?? 8),
  }),
  tool({
    name: 'save_story',
    title: 'Save a story',
    description: 'Save a true experience, metric or opinion the person has just told you, so it can be used in future posts.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['story', 'metric', 'win', 'failure', 'opinion', 'fact'] },
        title: { type: 'string', description: 'A short label.' },
        body: { type: 'string', description: 'What happened, in their words.' },
        occurred_on: { type: 'string', description: 'YYYY-MM-DD, when known.' },
      },
      required: ['title', 'body'],
      additionalProperties: false,
    },
    parse: z.object({ kind: z.string().max(20).optional(), title: z.string().min(1).max(200), body: z.string().min(1).max(8000), occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
    readOnly: false,
    run: (caller, input) => api.saveStory(caller, input),
  }),
  tool({
    name: 'list_ideas',
    title: 'List ideas',
    description: 'The person\'s open idea queue, best first, with why each idea is there.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    parse: z.object({}).passthrough(),
    readOnly: true,
    run: (caller) => api.ideas(caller),
  }),
  tool({
    name: 'list_drafts',
    title: 'List drafts',
    description: 'Recent drafts, scheduled posts or posted posts, newest first.',
    inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['draft', 'scheduled', 'posted'] }, limit: { type: 'integer', minimum: 1, maximum: 50 } }, additionalProperties: false },
    parse: z.object({ status: z.enum(['draft', 'scheduled', 'posted']).optional(), limit: z.number().int().min(1).max(50).optional() }),
    readOnly: true,
    run: (caller, input) => api.drafts(caller, input.status ?? null, input.limit ?? 10),
  }),
  tool({
    name: 'draft_post',
    title: 'Draft a post',
    description: 'Write a post in the person\'s voice using only their true stories. Saves it as a draft in Forge for review (set save to false to just return the text). Never posts.',
    inputSchema: {
      type: 'object',
      properties: {
        angle: { type: 'string', description: 'What the post is about and the point it makes.' },
        platform: platformSchema,
        kind: { type: 'string', enum: ['post', 'thread', 'carousel'] },
        save: { type: 'boolean', description: 'Save to Forge as a draft. Defaults to true.' },
      },
      required: ['angle', 'platform'],
      additionalProperties: false,
    },
    parse: z.object({ angle: z.string().min(3).max(2000), platform: z.enum(DRAFT_PLATFORMS), kind: z.enum(['post', 'thread', 'carousel']).optional(), save: z.boolean().optional() }),
    readOnly: false,
    run: (caller, input) => api.draftPost(caller, input),
  }),
];

const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

function negotiateVersion(requested: unknown): string {
  return typeof requested === 'string' && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested) ? requested : LATEST_PROTOCOL_VERSION;
}

function ok(id: JsonRpcId | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function fail(id: JsonRpcId | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: data === undefined ? { code, message } : { code, message, data } };
}

function isRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return message.jsonrpc === '2.0' && typeof message.method === 'string' && (message.params === undefined || (typeof message.params === 'object' && message.params !== null));
}

function describeTool(definition: ToolDefinition<unknown>) {
  return {
    name: definition.name,
    title: definition.title,
    description: definition.description,
    inputSchema: definition.inputSchema,
    annotations: { title: definition.title, readOnlyHint: definition.readOnly, destructiveHint: false, openWorldHint: false },
  };
}

async function callTool(caller: api.ApiCaller, params: Record<string, unknown>) {
  const name = params.name;
  const definition = typeof name === 'string' ? TOOLS_BY_NAME.get(name) : undefined;
  if (!definition) throw new RpcError(RPC_ERRORS.invalidParams, `Unknown tool: ${String(name)}`);

  const parsed = definition.parse.safeParse(params.arguments ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return toolError(`Invalid arguments${issue ? `: ${issue.path.join('.') || 'input'} ${issue.message}` : '.'}`);
  }

  try {
    const value = await definition.run(caller, parsed.data);
    const structured = Array.isArray(value) ? { items: value } : (value as Record<string, unknown>);
    return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: structured, isError: false };
  } catch (error) {
    // Tool failures the model can act on (a missing scope, a used-up
    // allowance, bad input) are results, not protocol errors.
    if (error instanceof HttpError) return toolError(error.message);
    throw error;
  }
}

function toolError(message: string) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

class RpcError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

/**
 * Handles one JSON-RPC message. Returns null for notifications, which get
 * no reply.
 */
export async function handleMessage(caller: api.ApiCaller, message: unknown): Promise<JsonRpcResponse | null> {
  if (!isRequest(message)) {
    const id = message && typeof message === 'object' && 'id' in message ? ((message as { id: JsonRpcId }).id ?? null) : null;
    return fail(id, RPC_ERRORS.invalidRequest, 'Not a JSON-RPC 2.0 request.');
  }
  const isNotification = message.id === undefined || message.id === null;
  const id = isNotification ? null : (message.id as JsonRpcId);
  const params = message.params ?? {};

  try {
    switch (message.method) {
      case 'initialize':
        return ok(id, {
          protocolVersion: negotiateVersion(params.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        });
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null;
      case 'ping':
        return isNotification ? null : ok(id, {});
      case 'tools/list':
        return ok(id, { tools: TOOLS.map(describeTool) });
      case 'tools/call':
        return ok(id, await callTool(caller, params));
      default:
        if (isNotification) return null;
        return fail(id, RPC_ERRORS.methodNotFound, `Method not found: ${message.method}`);
    }
  } catch (error) {
    if (isNotification) return null;
    if (error instanceof RpcError) return fail(id, error.code, error.message);
    console.error('[mcp]', message.method, error);
    return fail(id, RPC_ERRORS.internal, 'Forge could not complete the request.');
  }
}

export function protocolVersionAllowed(header: string | null): boolean {
  return header === null || (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(header);
}
