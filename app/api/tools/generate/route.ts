// app/api/tools/generate/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getToolBySlug } from "@/lib/tools-config";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@supabase/supabase-js";

// Cheapest capable model — short-form generation task
const MODEL = "claude-haiku-4-5-20251001";

// Hard ceiling regardless of what a tool config claims to want.
const ABSOLUTE_MAX_OUTPUT_TOKENS = 400;

// Initialize Supabase admin client for backend lead capture
// Service role key used here to bypass RLS, as this runs securely on the server
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, input, tone, useEmojis, email } = body as {
      slug?: string;
      input?: string;
      tone?: string;
      useEmojis?: boolean;
      email?: string;
    };

    if (!slug || !input) {
      return NextResponse.json(
        { error: "Missing slug or input." },
        { status: 400 }
      );
    }

    const tool = getToolBySlug(slug);
    if (!tool) {
      return NextResponse.json({ error: "Unknown tool." }, { status: 404 });
    }

    const hasEmail = Boolean(email && email.includes("@"));

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
      await supabase.from("leads").upsert(
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