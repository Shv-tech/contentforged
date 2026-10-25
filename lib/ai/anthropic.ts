/**
 * lib/ai/anthropic.ts
 *
 * The one place that talks to the Anthropic Messages API.
 *
 * Three call shapes cover every use in Forge:
 *   createMessage    one request, one response
 *   streamMessage    server-sent events, with text deltas surfaced as they
 *                    arrive so the chat can render while the model writes
 *   structuredCall   forces a single tool call and returns its input, which
 *                    is how graders and analysers get schema-shaped JSON
 *                    instead of prose that has to be scraped
 *
 * Plain fetch rather than the SDK: the chat route already used fetch, prompt
 * caching and 1h TTLs are expressed directly in the request body, and the
 * streaming parser below is small enough to own.
 */

import { usageFromAnthropic, type TokenUsage } from '@/lib/billing/plans';

export const FORGE_MODEL = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const DEFAULT_TIMEOUT_MS = 55_000;

export interface CacheControl {
  type: 'ephemeral';
  ttl?: '5m' | '1h';
}

export interface SystemBlock {
  type: 'text';
  text: string;
  cache_control?: CacheControl;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  cache_control?: CacheControl;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface MessageRequest {
  system?: string | SystemBlock[];
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  toolChoice?: { type: 'auto' } | { type: 'any' } | { type: 'tool'; name: string };
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface MessageResponse {
  content: ContentBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | string;
  usage: TokenUsage;
  model: string;
}

export class AnthropicError extends Error {
  constructor(message: string, public readonly status: number, public readonly type?: string) {
    super(message);
  }

  /** Overloaded and rate-limit errors are worth one retry or a fallback. */
  get retryable(): boolean {
    return this.status === 429 || this.status === 529 || this.status >= 500;
  }
}

function apiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AnthropicError('ANTHROPIC_API_KEY is not set.', 500, 'configuration');
  return key;
}

function buildBody(request: MessageRequest, stream: boolean): string {
  return JSON.stringify({
    model: request.model ?? FORGE_MODEL,
    max_tokens: request.maxTokens ?? 4096,
    temperature: request.temperature ?? 0.4,
    system: request.system,
    messages: request.messages,
    ...(request.tools && request.tools.length > 0 ? { tools: request.tools } : {}),
    ...(request.toolChoice ? { tool_choice: request.toolChoice } : {}),
    ...(stream ? { stream: true } : {}),
  });
}

function linkSignals(external: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Request timed out')), timeoutMs);
  const onAbort = () => controller.abort(external?.reason);
  external?.addEventListener('abort', onAbort, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onAbort);
    },
  };
}

async function failure(response: Response): Promise<AnthropicError> {
  let message = `Anthropic API error (${response.status})`;
  let type: string | undefined;
  try {
    const body = await response.json();
    message = body?.error?.message ?? message;
    type = body?.error?.type;
  } catch {
    // Non-JSON error body; keep the status-based message.
  }
  return new AnthropicError(message, response.status, type);
}

export interface CallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function createMessage(request: MessageRequest, options: CallOptions = {}): Promise<MessageResponse> {
  const { signal, dispose } = linkSignals(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey(),
        'anthropic-version': API_VERSION,
      },
      body: buildBody(request, false),
    });
    if (!response.ok) throw await failure(response);
    const data = await response.json();
    return {
      content: data.content ?? [],
      stopReason: data.stop_reason,
      usage: usageFromAnthropic(data.usage),
      model: data.model,
    };
  } finally {
    dispose();
  }
}

/**
 * Streams a message, calling `onText` with each text delta as it arrives,
 * and resolves with the complete message once the stream ends.
 *
 * Tool-use blocks are assembled from their JSON deltas and parsed at
 * content_block_stop, so callers receive whole tool inputs, never fragments.
 */
export async function streamMessage(
  request: MessageRequest,
  onText: (delta: string) => void,
  options: CallOptions = {}
): Promise<MessageResponse> {
  const { signal, dispose } = linkSignals(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey(),
        'anthropic-version': API_VERSION,
      },
      body: buildBody(request, true),
    });
    if (!response.ok || !response.body) throw await failure(response);

    const blocks: ContentBlock[] = [];
    const partialJson = new Map<number, string>();
    let stopReason = 'end_turn';
    let model = request.model ?? FORGE_MODEL;
    let rawUsage: Record<string, number> = {};

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const handle = (eventName: string, data: any) => {
      switch (eventName) {
        case 'message_start':
          model = data.message?.model ?? model;
          rawUsage = { ...rawUsage, ...(data.message?.usage ?? {}) };
          break;
        case 'content_block_start': {
          const block = data.content_block;
          if (block?.type === 'text') blocks[data.index] = { type: 'text', text: '' };
          if (block?.type === 'tool_use') {
            blocks[data.index] = { type: 'tool_use', id: block.id, name: block.name, input: {} };
            partialJson.set(data.index, '');
          }
          break;
        }
        case 'content_block_delta': {
          const delta = data.delta;
          const block = blocks[data.index];
          if (delta?.type === 'text_delta' && block?.type === 'text') {
            block.text += delta.text;
            onText(delta.text);
          } else if (delta?.type === 'input_json_delta') {
            partialJson.set(data.index, (partialJson.get(data.index) ?? '') + delta.partial_json);
          }
          break;
        }
        case 'content_block_stop': {
          const block = blocks[data.index];
          if (block?.type === 'tool_use') {
            const json = partialJson.get(data.index) ?? '';
            try {
              block.input = json ? JSON.parse(json) : {};
            } catch {
              block.input = {};
            }
          }
          break;
        }
        case 'message_delta':
          if (data.delta?.stop_reason) stopReason = data.delta.stop_reason;
          rawUsage = { ...rawUsage, ...(data.usage ?? {}) };
          break;
        case 'error':
          throw new AnthropicError(data.error?.message ?? 'Stream error', 529, data.error?.type);
        default:
          break;
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        let eventName = 'message';
        const dataLines: string[] = [];
        for (const line of rawEvent.split('\n')) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length === 0) continue;
        handle(eventName, JSON.parse(dataLines.join('\n')));
      }
    }

    return {
      content: blocks.filter(Boolean),
      stopReason,
      usage: usageFromAnthropic(rawUsage),
      model,
    };
  } finally {
    dispose();
  }
}

/**
 * Forces the model to answer by calling `tool`, and returns that call's input.
 * The tool is never executed; it exists only to impose a JSON schema on the
 * answer.
 */
export async function structuredCall<T>(
  request: Omit<MessageRequest, 'tools' | 'toolChoice'> & { tool: ToolDefinition },
  options: CallOptions = {}
): Promise<{ data: T; usage: TokenUsage }> {
  const { tool, ...rest } = request;
  const response = await createMessage(
    { ...rest, tools: [tool], toolChoice: { type: 'tool', name: tool.name } },
    options
  );
  const call = response.content.find(
    (block): block is Extract<ContentBlock, { type: 'tool_use' }> => block.type === 'tool_use' && block.name === tool.name
  );
  if (!call) throw new AnthropicError('The model did not return structured output.', 502, 'structure');
  return { data: call.input as T, usage: response.usage };
}

export function textOf(response: MessageResponse): string {
  return response.content
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('');
}
