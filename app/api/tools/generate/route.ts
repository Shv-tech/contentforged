// app/api/tools/generate/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getToolBySlug } from "@/lib/tools-config";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";
import { observed } from '@/lib/ops/observe';

// Cheapest capable model — short-form generation task
const MODEL = "claude-haiku-4-5-20251001";

// Hard ceiling regardless of what a tool config claims to want.
const ABSOLUTE_MAX_OUTPUT_TOKENS = 400;


// Public, unauthenticated endpoint: bound every field. `tone` is appended to
// the system prompt, so it is limited to a short plain label.
const BodySchema = z.object({
  slug: z.string().min(1).max(100),
  input: z.string().min(1).max(5000),
  tone: z.string().max(40).regex(/^[\p{L}\p{N} ,'-]*$/u).optional(),
  useEmojis: z.boolean().optional(),
  email: z.union([z.string().trim().max(254).email(), z.literal(""), z.null()]).optional(),
});

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function handlePOST(req: NextRequest) {
  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Missing or invalid slug, input, tone or email." },
        { status: 400 }
      );
    }
    const { slug, input, tone, useEmojis, email } = parsed.data;

    const tool = getToolBySlug(slug);
    if (!tool) {
      return NextResponse.json({ error: "Unknown tool." }, { status: 404 });
    }

    const hasEmail = Boolean(email);

    // ── 1. Atomic Rate Limiting ──
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
    
    // consumeRateLimit handles both the IP hard cap and the soft email gate
    const rate = await consumeRateLimit(ip, slug, hasEmail);
    if (!rate.allowed) {
      return NextResponse.json(
        { 
          error: rate.reason,
          requiresEmail: rate.requiresEmail 
        },
        { status: 429 }
      );
    }

    // ── 2. Lead Capture ──
    if (hasEmail && email) {
      const normalizedEmail = email.toLowerCase();
      // Upsert prevents database errors if the same user tries multiple tools
      await createServiceClient().from("leads").upsert(
        { 
          email: normalizedEmail, 
          source: `tool:${slug}`,
          updated_at: new Date().toISOString()
        },
        { onConflict: "email" }
      );
    }

    // ── 3. Input Validation ──
    const inputWordCount = countWords(input);
    if (inputWordCount === 0) {
      return NextResponse.json(
        { error: "Enter a topic first." },
        { status: 400 }
      );
    }
    if (inputWordCount > tool.maxInputWords) {
      return NextResponse.json(
        {
          error: `Keep your input under ${tool.maxInputWords} words. Yours is ${inputWordCount}.`,
        },
        { status: 400 }
      );
    }

    // ── 4. Prompt Assembly ──
    const maxOutputTokens = Math.min(
      Math.ceil(tool.maxOutputWords * 1.4),
      ABSOLUTE_MAX_OUTPUT_TOKENS
    );

    const systemPrompt = tool.systemPrompt
      .replace("{maxOutputWords}", String(tool.maxOutputWords))
      .concat(
        tone ? ` Tone: ${tone}.` : "",
        useEmojis === false ? " Do not use emojis." : " Light emoji use is fine if natural."
      );

    // ── 5. LLM Call ──
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxOutputTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: input.slice(0, 500) }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", errText);
      return NextResponse.json(
        { error: "Generation failed. Please try again." },
        { status: 502 }
      );
    }

    const data = await response.json();
    const text = data.content
      ?.map((block: { type: string; text?: string }) =>
        block.type === "text" ? block.text : ""
      )
      .filter(Boolean)
      .join("\n")
      .trim();

    if (!text) {
      return NextResponse.json(
        { error: "Generation failed. Please try again." },
        { status: 502 }
      );
    }

    // Return the payload along with rate-limit UI hints
    return NextResponse.json({ 
      output: text,
      remaining: rate.remaining,
      requiresEmail: rate.requiresEmail
    });
    
  } catch (err) {
    console.error("Tool generation error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

export const POST = observed('api/tools/generate', handlePOST);
