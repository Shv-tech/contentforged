/**
 * lib/forge/agent/run-turn.ts
 *
 * Runs one chat turn and streams it to the client as newline-delimited JSON
 * (see ChatStreamEvent in lib/forge/types.ts).
 *
 * WHY STREAMING
 *
 * The previous route answered with a single JSON body after the whole tool
 * loop finished, so users watched an empty placeholder for 10 to 25 seconds.
 * Now the first event (a progress step) arrives within milliseconds, text
 * renders as the model writes it, and draft cards appear the moment
 * present_draft runs, with their grade filling in a moment later.
 *
 * WHAT IS PRESERVED FROM THE PREVIOUS ROUTE
 *
 *   - Quota: one soft reservation per turn, settled against measured usage on
 *     every exit path, including errors and client aborts.
 *   - Prompt caching: four breakpoints (tools, static prompt, user context,
 *     moving message tail), all 1h TTL.
 *   - The calendar agent and its tools.
 *   - Attachment parsing and inlining, returned as userContent so the parsed
 *     text stays in the transcript for later turns.
 *   - The Groq failover when the primary provider is down.
 *   - Episodic memory writes, fire-and-forget.
 */

import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AnthropicError, FORGE_MODEL, streamMessage, type ChatMessage, type ContentBlock, type SystemBlock, type ToolDefinition } from '@/lib/ai/anthropic';
import { reserveQuota, settleQuota, snapshotFrom, denialMessage, type QuotaGrant } from '@/lib/billing/metering';
import { EMPTY_USAGE, addUsage, type TokenUsage } from '@/lib/billing/plans';
import {
  calendarTools,
  getCalendarAgentPrompt,
  getCalendarEvents,
  createCalendarEvent,
  createCalendarEventsBulk,
  updateCalendarEvent,
  deleteCalendarEvents,
} from '@/lib/calendar-tools';
import { parseAttachment, type RawAttachment } from '@/lib/file-parsers';
import { saveEpisodicMemory } from '@/lib/memory';
import { processRagThreshold } from '@/lib/rag';
import { createServiceClient } from '@/lib/supabase/service';
import type { WorkspaceRef } from '../data/workspace';
import { gradeOpening } from '../grader';
import { BASE_SYSTEM_PROMPT } from '../prompts/system';
import { resolveToolPrompt } from '../prompts/tools';
import { MARKER, markerBlock, VERDICT_LABELS, type ChatStreamEvent } from '../types';
import { buildChatContext } from './context';
import { collectDraftIds, loadDrafts, toApiHistory, type ClientMessage } from './history';
import { executeForgeTool, FORGE_TOOLS, TOOL_STEP_LABELS, TURN_ENDING_TOOLS, type AgentContext } from './tools';
import { X_AGENT_TOOLS, executeXAgentTool, xToolsAvailable } from './x-tools';

const MAX_ROUNDS = 8;
const MAX_OUTPUT_TOKENS = 8192;
const CACHE_1H = { type: 'ephemeral' as const, ttl: '1h' as const };

export interface TurnInput {
  db: SupabaseClient;
  userId: string;
  userEmail: string;
  userName: string;
  plan: import('@/lib/billing/plans').PlanId;
  workspace: WorkspaceRef | null;
  sessionId: string | null;
  messages: ClientMessage[];
  activeTool: string | null;
  images: string[];
  attachments: RawAttachment[];
  signal: AbortSignal;
  emit: (event: ChatStreamEvent) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function withLastToolCached(tools: ToolDefinition[]): ToolDefinition[] {
  return tools.map((tool, index) => (index === tools.length - 1 ? { ...tool, cache_control: CACHE_1H } : tool));
}

/** Moves a cache breakpoint onto the final block of the final message. */
function withMessageCacheBreakpoint(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length === 0) return messages;
  const lastIndex = messages.length - 1;
  const last = messages[lastIndex];
  const blocks: ContentBlock[] = typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : last.content;
  if (blocks.length === 0) return messages;
  // cache_control is valid on every block type the API accepts but is not
  // part of the narrow ContentBlock union, hence the widening cast.
  const patched = blocks.map((block, index) => (index === blocks.length - 1 ? ({ ...block, cache_control: CACHE_1H } as unknown as ContentBlock) : block));
  return [...messages.slice(0, lastIndex), { ...last, content: patched }];
}

function flattenForFallback(messages: ChatMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  return messages.map((message) => ({
    role: message.role,
    content:
      typeof message.content === 'string'
        ? message.content
        : message.content
            .map((block) => {
              if (block.type === 'text') return block.text;
              if (block.type === 'tool_use') return `[Tool call: ${block.name}]`;
              if (block.type === 'tool_result') return `[Tool result: ${block.content}]`;
              return '[Image omitted]';
            })
            .join('\n') || '[Empty turn]',
  }));
}

async function executeCalendarTool(name: string, input: any, userId: string, email: string, userName: string) {
  try {
    switch (name) {
      case 'get_calendar_events':
        return await getCalendarEvents(input, userId);
      case 'create_calendar_event':
        return await createCalendarEvent(input, userId);
      case 'create_calendar_events_bulk':
        return await createCalendarEventsBulk(input, userId, email, userName);
      case 'update_calendar_event':
        return await updateCalendarEvent(input, userId);
      case 'delete_calendar_events':
        return await deleteCalendarEvents(input, userId);
      default:
        return { success: false, error: `Unknown calendar tool: ${name}` };
    }
  } catch (error) {
    console.error(`[forge/turn] calendar tool ${name} failed:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Calendar tool failed.' };
  }
}

const CALENDAR_TOOL_NAMES = new Set(calendarTools.map((tool) => tool.name));

/** The user's own words, without quote and attachment markers. */
function typedText(content: string): string {
  return content
    .replace(/\[QUOTED FROM YOUR PREVIOUS RESPONSE\]\n[\s\S]*?\n\[\/QUOTED\]\n*/, '')
    .replace(/\n*\[ATTACHED FILE: (.+?)\]\n[\s\S]*?\n\[END FILE: \1\]/g, '')
    .trim();
}

// ============================================================================
// GRADER TURN
// ============================================================================

async function runGraderTurn(input: TurnInput, text: string): Promise<void> {
  const { emit } = input;
  if (!text) {
    emit({ type: 'done', reply: 'Paste the opening line (or the whole post) you want graded.' });
    return;
  }

  emit({ type: 'step', id: 'grade', label: 'Grading the opening', state: 'active' });

  const decision = await reserveQuota({
    userId: input.userId,
    model: FORGE_MODEL,
    maxTokens: 600,
    estimatedInputTokens: Math.ceil(text.length / 4) + 900,
  });
  if (!decision.allowed) {
    emit({
      type: 'error',
      status: 429,
      message: denialMessage(decision),
      reason: decision.reason,
      quota: snapshotFrom(decision),
      upgradeRequired: decision.reason === 'monthly_exceeded',
    });
    return;
  }

  let usage: TokenUsage = EMPTY_USAGE;
  try {
    const result = await gradeOpening({ text });
    usage = result.usage;
    const { grade } = result;

    let cardId: string | null = null;
    const { data: card } = await createServiceClient()
      .from('grade_cards')
      .insert({
        user_id: input.userId,
        hook:
          text
            .split('\n')
            .find((line) => line.trim())
            ?.trim()
            .slice(0, 600) ?? text.slice(0, 600),
        score: grade.score,
        verdict: VERDICT_LABELS[grade.verdict],
        breakdown: grade.dimensions,
      })
      .select('id')
      .single();
    cardId = card?.id ?? null;

    emit({ type: 'step', id: 'grade', label: 'Grading the opening', state: 'done' });
    const summary = `**${grade.score}/50. ${VERDICT_LABELS[grade.verdict]}.** ${grade.weakest}`;
    emit({ type: 'grade', grade, text: summary, cardId });

    const spent = await settleQuota({ userId: input.userId, grant: decision, model: FORGE_MODEL, usage, route: 'chat:grade' });
    emit({
      type: 'done',
      reply: `${summary}${markerBlock(MARKER.grade, { grade, cardId, hook: text.slice(0, 600) })}`.trim(),
      quota: snapshotFrom(decision, spent),
    });
  } catch (error) {
    await settleQuota({ userId: input.userId, grant: decision, model: FORGE_MODEL, usage, route: 'chat:grade:error' });
    throw error;
  }
}

// ============================================================================
// MAIN TURN
// ============================================================================

export async function runTurn(input: TurnInput): Promise<void> {
  const { emit, db, userId } = input;

  const lastMessage = input.messages[input.messages.length - 1];
  const latestText = lastMessage?.content ?? '';

  if (input.activeTool === 'hook_grader') {
    await runGraderTurn(input, typedText(latestText));
    return;
  }

  // ----- Context ----------------------------------------------------------

  emit({ type: 'step', id: 'context', label: input.workspace ? `Loading ${input.workspace.name}` : 'Reading your Brand DNA', state: 'active' });

  const { data: tzProfile } = await db.from('profiles').select('timezone').eq('id', userId).maybeSingle();
  const timezone: string = tzProfile?.timezone ?? 'UTC';

  const history = input.messages.slice(0, -1);
  const [context, rag, drafts] = await Promise.all([
    buildChatContext(db, userId, input.workspace, timezone),
    processRagThreshold(typedText(latestText) || latestText, userId).catch(() => ({ needsRag: false, ragContext: '' })),
    loadDrafts(db, userId, collectDraftIds(history)),
  ]);

  emit({ type: 'step', id: 'context', label: input.workspace ? `Loading ${input.workspace.name}` : 'Reading your Brand DNA', state: 'done' });

  let staticPrompt = BASE_SYSTEM_PROMPT;
  const toolPrompt = resolveToolPrompt(input.activeTool);
  if (toolPrompt) staticPrompt += `\n\n${toolPrompt}`;
  staticPrompt += `\n\n${getCalendarAgentPrompt(timezone)}`;

  const system: SystemBlock[] = [
    { type: 'text', text: staticPrompt, cache_control: CACHE_1H },
    { type: 'text', text: context.block, cache_control: CACHE_1H },
  ];
  if (rag.needsRag && rag.ragContext) {
    system.push({ type: 'text', text: `RELEVANT EARLIER CONVERSATIONS (for continuity only; not a source of facts):\n${rag.ragContext}` });
  }

  // ----- Messages ---------------------------------------------------------

  const userBlocks: ContentBlock[] = [];
  for (const image of input.images) {
    const [meta, data] = image.split(',');
    const mediaType = meta?.replace('data:', '').replace(';base64', '');
    if (mediaType && data) userBlocks.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } });
  }

  let userText = latestText;
  if (input.attachments.length > 0) {
    emit({ type: 'step', id: 'files', label: input.attachments.length === 1 ? 'Reading your file' : 'Reading your files', state: 'active' });
    const parsed = await Promise.allSettled(input.attachments.map((attachment) => parseAttachment(attachment)));
    parsed.forEach((result, index) => {
      const sourceName = input.attachments[index]?.name || `attachment-${index + 1}`;
      if (result.status === 'fulfilled') {
        const { name, extractedText, warnings } = result.value;
        userText += `\n\n[ATTACHED FILE: ${name}]\n${extractedText}\n[END FILE: ${name}]`;
        if (warnings.length > 0) userText += `\n[PARSER NOTE — ${name}]: ${warnings.join(' ')}`;
      } else {
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
        userText += `\n\n[SYSTEM NOTE: "${sourceName}" attached but failed to parse: ${message}]`;
      }
    });
    emit({ type: 'step', id: 'files', label: input.attachments.length === 1 ? 'Reading your file' : 'Reading your files', state: 'done' });
  }
  userBlocks.push({ type: 'text', text: userText || '(no text)' });

  const working: ChatMessage[] = [...toApiHistory(history, drafts), { role: 'user', content: userBlocks }];
  while (working.length > 0 && working[0].role !== 'user') working.shift();

  const xEnabled = xToolsAvailable(input.plan);
  const tools = withLastToolCached([...FORGE_TOOLS, ...(xEnabled ? X_AGENT_TOOLS : []), ...(calendarTools as ToolDefinition[])]);

  // ----- Quota ------------------------------------------------------------

  const estimatedInputTokens = Math.ceil((system.reduce((total, block) => total + block.text.length, 0) + JSON.stringify(working).length) / 4);

  const decision = await reserveQuota({ userId, model: FORGE_MODEL, maxTokens: MAX_OUTPUT_TOKENS, estimatedInputTokens });
  if (!decision.allowed) {
    emit({
      type: 'error',
      status: 429,
      message: denialMessage(decision),
      reason: decision.reason,
      quota: snapshotFrom(decision),
      upgradeRequired: decision.reason === 'monthly_exceeded',
    });
    return;
  }
  const grant: QuotaGrant = decision;

  let usage: TokenUsage = EMPTY_USAGE;
  const deferred: Promise<unknown>[] = [];
  let settled = false;

  const settle = async (route: string, provider = 'anthropic') => {
    if (settled) return 0;
    settled = true;
    return settleQuota({ userId, grant, model: FORGE_MODEL, usage, route, sessionId: input.sessionId, provider });
  };

  const agent: AgentContext = {
    db,
    userId,
    workspaceId: input.workspace?.id ?? null,
    sessionId: input.sessionId,
    emit,
    addUsage: (extra) => {
      usage = addUsage(usage, extra);
    },
    defer: (work) => {
      deferred.push(work);
    },
  };

  // The persisted reply: text plus marker blocks, in the order they happened.
  const replyParts: string[] = [];
  let usedFallback = false;

  try {
    emit({ type: 'step', id: 'write', label: 'Thinking', state: 'active' });

    for (let round = 0; round < MAX_ROUNDS; round++) {
      let response;
      try {
        response = await streamMessage(
          {
            system,
            messages: withMessageCacheBreakpoint(working),
            tools,
            maxTokens: MAX_OUTPUT_TOKENS,
            temperature: 0.5,
          },
          (delta) => {
            replyParts.push(delta);
            emit({ type: 'text', delta });
          },
          { signal: input.signal }
        );
      } catch (error) {
        if (input.signal.aborted) throw error;
        // Fail over only before anything was written. Switching providers
        // mid-reply would splice two different answers together.
        const canFallback = round === 0 && replyParts.length === 0 && (!(error instanceof AnthropicError) || error.retryable);
        if (!canFallback || !process.env.GROQ_API_KEY) throw error;

        console.warn('[forge/turn] primary provider failed; using fallback.', error);
        const fallbackText = await runFallback(system, working);
        replyParts.push(fallbackText);
        emit({ type: 'text', delta: fallbackText });
        usedFallback = true;
        break;
      }

      usage = addUsage(usage, response.usage);

      const toolUses = response.content.filter((block): block is Extract<ContentBlock, { type: 'tool_use' }> => block.type === 'tool_use');

      if (response.stopReason !== 'tool_use' || toolUses.length === 0) break;

      working.push({ role: 'assistant', content: response.content });

      let endTurn = false;
      const results: ContentBlock[] = [];

      // Sequential, not parallel: tools emit cards in the order the model
      // called them, and present_draft for LinkedIn should not land after the
      // X draft it was written alongside.
      for (const call of toolUses) {
        const label = TOOL_STEP_LABELS[call.name] ?? 'Working';
        emit({ type: 'step', id: call.id, label, state: 'active' });

        let outcome: { result: string; isError?: boolean; endsTurn?: boolean; marker?: string };
        if (CALENDAR_TOOL_NAMES.has(call.name)) {
          const calendarResult = await executeCalendarTool(call.name, call.input, userId, input.userEmail, input.userName);
          outcome = { result: JSON.stringify(calendarResult), isError: calendarResult?.success === false };
        } else if (call.name.startsWith('x_')) {
          outcome = await executeXAgentTool(call.name, call.input, agent);
        } else {
          try {
            outcome = await executeForgeTool(call.name, call.input, agent);
          } catch (error) {
            console.error(`[forge/turn] tool ${call.name} failed:`, error);
            outcome = { result: error instanceof Error ? error.message : 'The tool failed.', isError: true };
          }
        }

        emit({ type: 'step', id: call.id, label, state: 'done' });

        if (outcome.marker) {
          const language =
            call.name === 'present_draft'
              ? MARKER.draft
              : call.name === 'ask_user'
                ? MARKER.questions
                : call.name === 'propose_plan'
                  ? MARKER.plan
                  : MARKER.memory;
          replyParts.push(markerBlock(language, JSON.parse(outcome.marker)));
        }

        results.push({ type: 'tool_result', tool_use_id: call.id, content: outcome.result, is_error: outcome.isError || undefined });
        if (outcome.endsTurn) endTurn = true;
      }

      if (endTurn) break;
      working.push({ role: 'user', content: results });
    }

    emit({ type: 'step', id: 'write', label: 'Thinking', state: 'done' });

    // Grades and other background work finish before the turn closes, so the
    // final usage figure includes them.
    if (deferred.length > 0) {
      emit({ type: 'step', id: 'grade', label: 'Grading', state: 'active' });
      await Promise.allSettled(deferred);
      emit({ type: 'step', id: 'grade', label: 'Grading', state: 'done' });
    }

    const reply = replyParts
      .join('')
      .replace(/<\/?render[^>]*>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const spent = await settle('chat', usedFallback ? 'groq' : 'anthropic');

    // Fire-and-forget: memory and recency must never delay or fail the reply.
    const typed = typedText(latestText);
    if (typed) saveEpisodicMemory(userId, `User: ${typed}`, 'chat_message').catch(() => undefined);
    if (reply) saveEpisodicMemory(userId, `Forge: ${reply.slice(0, 4000)}`, 'chat_message').catch(() => undefined);
    if (input.sessionId) {
      void db.from('chat_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', input.sessionId);
    }

    emit({
      type: 'done',
      reply: reply || 'I could not produce a reply that time. Please try again.',
      ...(userText !== latestText ? { userContent: userText } : {}),
      quota: snapshotFrom(grant, spent),
    });
  } catch (error) {
    await Promise.allSettled(deferred);
    await settle(input.signal.aborted ? 'chat:aborted' : 'chat:error');
    throw error;
  }
}

async function runFallback(system: SystemBlock[], working: ChatMessage[]): Promise<string> {
  const groq = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' });
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 4096,
    temperature: 0.4,
    messages: [{ role: 'system', content: system.map((block) => block.text).join('\n\n') }, ...flattenForFallback(working)],
  });
  return response.choices[0]?.message?.content ?? '';
}
