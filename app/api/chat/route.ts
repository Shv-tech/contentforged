/**
 * app/api/chat/route.ts
 *
 * The chat endpoint. Validates and authenticates, then hands the turn to
 * lib/forge/agent/run-turn.ts and streams its events back as NDJSON.
 *
 * Validation and authentication happen before the stream opens, so those
 * failures are ordinary JSON responses with real status codes. Once the
 * stream is open the status is 200, and failures arrive as an `error` event.
 *
 * Prompts live in lib/forge/prompts; tools in lib/forge/agent. This file is
 * deliberately small.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runTurn } from '@/lib/forge/agent/run-turn';
import { getActiveWorkspace, requireWrite } from '@/lib/forge/data/workspace';
import { canUseTool, planName, toolById } from '@/lib/forge/entitlements';
import { HttpError, parseJson, requireUser } from '@/lib/forge/http';
import { resolvePlan } from '@/lib/forge/plan';
import type { ChatStreamEvent } from '@/lib/forge/types';
import { friendlyProviderError } from '@/lib/forge/errors';

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(400_000),
});

const AttachmentSchema = z.object({
  name: z.string().max(260),
  mimeType: z.string().max(160),
  base64: z.string().max(22_000_000),
});

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1).max(400),
  activeTool: z.string().max(40).nullish(),
  images: z.array(z.string()).max(10).default([]),
  attachments: z.array(AttachmentSchema).max(10).default([]),
  sessionId: z.string().uuid().nullish(),
});

export async function POST(req: Request) {
  let body: z.output<typeof BodySchema>;
  let user: Awaited<ReturnType<typeof requireUser>>;

  try {
    user = await requireUser(req);
    body = await parseJson(req, BodySchema);
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  if (body.messages[body.messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'The last message must be from the user.' }, { status: 400 });
  }

  const plan = await resolvePlan(user.userId);
  const activeTool = body.activeTool ?? null;

  // The client hides locked tools, but the server decides. War Room runs
  // through /api/swarm and is not a chat tool here.
  if (activeTool && activeTool !== 'war_room' && toolById(activeTool) && !canUseTool(plan, activeTool)) {
    const tool = toolById(activeTool)!;
    return NextResponse.json(
      { error: `${tool.name} is on ${planName(tool.minPlan)}.`, upgradeRequired: true, requiredPlan: tool.minPlan },
      { status: 402 }
    );
  }

  const workspace = await getActiveWorkspace(user.db, user.userId);
  requireWrite(workspace);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: ChatStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The client went away; nothing left to deliver to.
          closed = true;
        }
      };

      try {
        await runTurn({
          db: user.db,
          userId: user.userId,
          userEmail: user.email,
          userName: user.name,
          plan,
          workspace,
          sessionId: body.sessionId ?? null,
          messages: body.messages,
          activeTool,
          images: body.images,
          attachments: body.attachments,
          signal: req.signal,
          emit,
        });
      } catch (error) {
        if (!req.signal.aborted) {
          console.error('[api/chat]', error);
          emit({ type: 'error', message: friendlyProviderError(error) });
        }
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by a disconnect.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
