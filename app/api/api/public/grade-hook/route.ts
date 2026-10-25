// app/api/public/grade-hook/route.ts
//
// Public, no-login endpoint behind the landing page's live grader.
// Contract (what components/landing/livegrader.tsx expects):
//
//   POST { hook: string }
//   200  { score: number /* 0-50 */, verdict: string, weakest?: string,
//          rewrite?: string, breakdown?: { label: string; score: number /* 0-10 */ }[] }
//   429  when the visitor has used their free grades
//
// The one thing to wire: `gradeWithForge` below. Point it at the same
// Stop-Scroll Grader logic the app already uses, and ask the model to return
// the JSON shape above. Until then this returns 501 and the landing page
// falls back to linking the free hook tool.

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const FREE_GRADES_PER_HOUR = 5;
const hits = new Map<string, { count: number; resetAt: number }>();

function limited(ip: string): boolean {
  // In-memory, per instance. Good enough to stop casual abuse; move to your
  // existing rate limiter (or Supabase/Upstash) for real enforcement.
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }
  entry.count += 1;
  return entry.count > FREE_GRADES_PER_HOUR;
}

async function gradeWithForge(hook: string): Promise<{
  score: number; verdict: string; weakest?: string; rewrite?: string;
  breakdown?: { label: string; score: number }[];
} | null> {
  // TODO: call your existing Stop-Scroll Grader here and return its result.
  void hook;
  return null;
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (limited(ip)) {
    return NextResponse.json({ error: 'Free limit reached' }, { status: 429 });
  }

  let hook = '';
  try {
    const body = await req.json();
    hook = typeof body?.hook === 'string' ? body.hook.trim().slice(0, 500) : '';
  } catch {
    return NextResponse.json({ error: 'Send JSON with a "hook" string.' }, { status: 400 });
  }
  if (!hook) return NextResponse.json({ error: 'The hook is empty.' }, { status: 400 });

  const result = await gradeWithForge(hook);
  if (!result) return NextResponse.json({ error: 'Grader not connected yet.' }, { status: 501 });

  return NextResponse.json(result);
}
