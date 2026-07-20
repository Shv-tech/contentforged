"use client";

import { useState, useRef } from "react";
import { ToolConfig, PLATFORM_LABELS } from "@/lib/tools-config";

interface Props {
  tool: ToolConfig;
}

export default function ToolPageClient({ tool }: Props) {
  const [topic, setTopic] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmailGate, setShowEmailGate] = useState(false);
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  const platformName = PLATFORM_LABELS[tool.platform];

  async function handleGenerate(submittedEmail?: string) {
    if (topic.trim().length < 3) {
      setError("Add a bit more detail about your topic first.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/tools/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: tool.slug,
          input: topic, // Fixed: Maps 'topic' to the 'input' key expected by route.ts
          email: submittedEmail,
        }),
      });

      const data = await res.json();

      if (res.status === 429) {
        setShowEmailGate(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        setLoading(false);
        return;
      }

      setOutput(data.output);
      setShowEmailGate(false);
      setLoading(false);
      
      // Optional UI hint if they just burned their last free generation
      if (data.requiresEmail && !submittedEmail) {
        setShowEmailGate(true);
      }

      setTimeout(() => {
        outputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      
    } catch {
      setError("Network error — please try again.");
      setLoading(false);
    }
  }

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email to keep generating.");
      return;
    }
    handleGenerate(email);
  }

  function applyFormat(tag: "bold" | "italic") {
    if (!outputRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const selectedText = range.toString();
    if (!selectedText) return;

    const wrapped =
      tag === "bold" ? toBoldUnicode(selectedText) : toItalicUnicode(selectedText);
    range.deleteContents();
    range.insertNode(document.createTextNode(wrapped));
  }

  function insertEmoji(emoji: string) {
    // Inserts emoji at the end of the text, or you could upgrade this to insert at cursor
    if (outputRef.current) {
      outputRef.current.innerText += emoji;
    }
  }

  async function handleCopy() {
    const text = outputRef.current?.innerText ?? output;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const wordCount = topic.trim().length ? topic.trim().split(/\s+/).length : 0;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-8 shadow-sm">
      {/* Input */}
      <label htmlFor="topic" className="mb-2 block text-sm font-medium text-neutral-900">
        {tool.inputLabel}
      </label>
      <div className="relative">
        <textarea
          id="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={tool.inputPlaceholder}
          rows={3}
          maxLength={500}
          className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-neutral-900 transition-colors"
        />
        <div className="absolute bottom-3 right-3 text-xs font-medium text-neutral-400">
          {topic.length}/500
        </div>
      </div>

      <button
        onClick={() => handleGenerate()}
        disabled={loading}
        className="mt-4 w-full rounded-xl bg-neutral-900 px-4 py-3.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-8"
      >
        {loading ? "Generating..." : `Generate ${tool.name}`}
      </button>

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

      {/* Email Gate */}
      {showEmailGate && (
        <form
          onSubmit={handleEmailSubmit}
          className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-5"
        >
          <p className="text-sm font-medium text-neutral-900">
            Loved that one? Enter your email to keep generating.
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            We'll also send you a free {platformName} content calendar template. No payment required.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="flex-1 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
            >
              Unlock & Generate
            </button>
          </div>
        </form>
      )}

      {/* Output Area */}
      {output && (
        <div className="mt-8 border-t border-neutral-100 pt-8 animate-in fade-in duration-500">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Your {platformName} Post
            </span>
            <button
              onClick={handleCopy}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              {copied ? "✓ Copied" : "Copy Text"}
            </button>
          </div>

          {/* Toolbar */}
          <div className="mb-2 flex gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1 w-fit">
            <ToolbarButton label="Bold" onClick={() => applyFormat("bold")}>
              <strong className="font-bold">B</strong>
            </ToolbarButton>
            <ToolbarButton label="Italic" onClick={() => applyFormat("italic")}>
              <em className="italic font-serif">I</em>
            </ToolbarButton>
            {tool.showEmojiToggle && (
              <ToolbarButton label="Add emoji" onClick={() => insertEmoji("✨")}>
                🙂
              </ToolbarButton>
            )}
          </div>

          <div
            ref={outputRef}
            contentEditable
            suppressContentEditableWarning
            className="min-h-[160px] whitespace-pre-wrap rounded-xl border border-neutral-200 bg-neutral-50 px-5 py-4 text-sm leading-relaxed text-neutral-800 focus:border-neutral-400 focus:bg-white focus:outline-none transition-colors"
          >
            {output}
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Select text, then tap Bold or Italic to format. It will stay formatted when you paste it into {platformName}.
          </p>
        </div>
      )}
    </div>
  );
}

function ToolbarButton({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-md text-sm text-neutral-700 transition-colors hover:bg-neutral-200 hover:text-neutral-900"
    >
      {children}
    </button>
  );
}

// Unicode conversion functions (Keep exactly as they were - brilliant logic)
function toBoldUnicode(text: string): string {
  const boldMap: Record<string, string> = {};
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  [...upper].forEach((c, i) => (boldMap[c] = String.fromCodePoint(0x1d400 + i)));
  [...lower].forEach((c, i) => (boldMap[c] = String.fromCodePoint(0x1d41a + i)));
  [...digits].forEach((c, i) => (boldMap[c] = String.fromCodePoint(0x1d7ce + i)));
  return [...text].map((c) => boldMap[c] ?? c).join("");
}

function toItalicUnicode(text: string): string {
  const italicMap: Record<string, string> = {};
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  [...upper].forEach((c, i) => (italicMap[c] = String.fromCodePoint(0x1d434 + i)));
  [...lower].forEach((c, i) => (italicMap[c] = String.fromCodePoint(0x1d44e + i)));
  return [...text].map((c) => italicMap[c] ?? c).join("");
}