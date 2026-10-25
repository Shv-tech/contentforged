'use client';

/**
 * EbookCanvas — Production-Grade Ebook Renderer
 * ─────────────────────────────────────────────
 * Fixed:
 * • normalizeMarkdown() — inserts blank lines before all block-level elements
 *   so ReactMarkdown always sees valid CommonMark/GFM structure
 * • Mermaid fenced code blocks now reliably detected and rendered
 * • GFM tables render correctly (blank line injected before every `|` row)
 * • H2 / H3 headings render correctly (blank lines before every `#` run)
 * • Content pagination is markdown-aware: never breaks mid-table or mid-heading
 * • Content area uses proper flex+scroll so text is never clipped by overflow:hidden
 * • Print root now normalizes content identically so PDF output is clean
 * • Mermaid render is debounced and uses a stable unique id to prevent collisions
 * • TypeScript types tightened throughout; no `any` on ReactMarkdown code prop
 * • Minor: TOC "Section X" label falls back to first heading found in content
 */

import React, {
  useRef,
  useState,
  useMemo,
  useCallback,
  useEffect,
} from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
  Download,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  AlignLeft,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
});

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type PageKind = 'cover' | 'chapter' | 'content';

interface EbookPage {
  kind: PageKind;
  title?: string;
  chapterNum?: number;
  sectionTitle?: string;
  content?: string;
}

interface Theme {
  id: string;
  coverBg: string;
  chapterBg: string;
  accent: string;
  accentRgb: string;
  gold: string;
  pageBg: string;
  pageText: string;
  mutedText: string;
  borderColor: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN NORMALIZER  → THE CORE FIX
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensures every block-level markdown element is preceded by a blank line,
 * WITHOUT inserting blank lines INSIDE table blocks.
 *
 * The previous regex-based approach (`([^\n])\n(\|)`) inserted `\n\n` before
 * every line starting with `|`, including rows INSIDE a table. GFM tables
 * require all rows to be consecutive — a blank line between rows breaks the
 * table into fragments that render as raw text. This line-by-line version
 * correctly inserts a blank only before the FIRST `|` row of each table.
 *
 * Rules:
 *  1. Blank line before ATX headings   (# … ######)
 *  2. Blank line before the FIRST row of a table block  (|)
 *     — never between rows that are already inside a table
 *  3. Blank line before opening fenced code blocks  (``` or ~~~)
 *  4. Blank line after  closing fenced code blocks
 *  5. Collapse 3+ consecutive blank lines → exactly 2  (cosmetic)
 */
function normalizeMarkdown(raw: string): string {
  // Normalise line endings
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  const out: string[] = [];
  let inFencedBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const prevOut = out.length > 0 ? out[out.length - 1] : '';
    const prevTrimmed = prevOut.trim();

    // Track fenced code blocks so we never mangle content inside them
    if (/^(`{3,}|~{3,})/.test(trimmed)) {
      if (!inFencedBlock) {
        // Opening fence — insert blank line before it if needed
        if (prevTrimmed !== '') {
          out.push('');
        }
        inFencedBlock = true;
      } else {
        // Closing fence
        inFencedBlock = false;
        out.push(line);
        // Insert blank line after closing fence if next line is non-empty
        if (i + 1 < lines.length && lines[i + 1].trim() !== '') {
          out.push('');
        }
        continue;
      }
      out.push(line);
      continue;
    }

    // Inside a fenced block — pass through verbatim
    if (inFencedBlock) {
      out.push(line);
      continue;
    }

    // Rule 1: blank line before ATX headings
    if (/^#{1,6} /.test(trimmed) && prevTrimmed !== '') {
      out.push('');
    }

    // Rule 2: blank line before the FIRST pipe row of a table.
    // Only insert if the PREVIOUS non-empty line does NOT also start with `|`
    // (which would mean we're already inside the table).
    if (
      trimmed.startsWith('|') &&
      prevTrimmed !== '' &&
      !prevTrimmed.startsWith('|') &&
      // separator rows like |---|---| count as "inside table" too
      !/^\|[-| :]+\|?$/.test(prevTrimmed)
    ) {
      out.push('');
    }

    out.push(line);
  }

  // Collapse 3+ blank lines → 2
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// THEME ENGINE
// ─────────────────────────────────────────────────────────────────────────────

const THEMES: Record<string, Theme> = {
  crimson: {
    id: 'crimson',
    coverBg:
      'radial-gradient(ellipse at 70% 20%, rgba(232,56,13,0.18) 0%, transparent 60%), radial-gradient(ellipse at 20% 80%, rgba(201,146,26,0.12) 0%, transparent 60%), linear-gradient(160deg, #0A0A0A 0%, #140502 50%, #0A0A0A 100%)',
    chapterBg:
      'radial-gradient(ellipse at 80% 10%, rgba(232,56,13,0.15) 0%, transparent 50%), linear-gradient(160deg, #130501 0%, #0A0A0A 100%)',
    accent: '#E8380D',
    accentRgb: '232,56,13',
    gold: '#C9921A',
    pageBg: '#FAFAF8',
    pageText: '#1A1A1A',
    mutedText: '#6B6B6B',
    borderColor: '#E8E4DF',
  },
  ocean: {
    id: 'ocean',
    coverBg:
      'radial-gradient(ellipse at 70% 20%, rgba(14,165,233,0.18) 0%, transparent 60%), radial-gradient(ellipse at 20% 80%, rgba(99,102,241,0.12) 0%, transparent 60%), linear-gradient(160deg, #020810 0%, #050E24 50%, #020810 100%)',
    chapterBg:
      'radial-gradient(ellipse at 80% 10%, rgba(14,165,233,0.15) 0%, transparent 50%), linear-gradient(160deg, #050E24 0%, #020810 100%)',
    accent: '#0EA5E9',
    accentRgb: '14,165,233',
    gold: '#F59E0B',
    pageBg: '#F8FAFF',
    pageText: '#0F1A2E',
    mutedText: '#5A6A80',
    borderColor: '#DDE4F0',
  },
  emerald: {
    id: 'emerald',
    coverBg:
      'radial-gradient(ellipse at 70% 20%, rgba(16,185,129,0.18) 0%, transparent 60%), radial-gradient(ellipse at 20% 80%, rgba(251,191,36,0.10) 0%, transparent 60%), linear-gradient(160deg, #020A06 0%, #041208 50%, #020A06 100%)',
    chapterBg:
      'radial-gradient(ellipse at 80% 10%, rgba(16,185,129,0.15) 0%, transparent 50%), linear-gradient(160deg, #041208 0%, #020A06 100%)',
    accent: '#10B981',
    accentRgb: '16,185,129',
    gold: '#FBBF24',
    pageBg: '#F8FBF9',
    pageText: '#0D1F14',
    mutedText: '#4A6A56',
    borderColor: '#D5EDE2',
  },
  violet: {
    id: 'violet',
    coverBg:
      'radial-gradient(ellipse at 70% 20%, rgba(139,92,246,0.18) 0%, transparent 60%), radial-gradient(ellipse at 20% 80%, rgba(236,72,153,0.10) 0%, transparent 60%), linear-gradient(160deg, #08040E 0%, #120828 50%, #08040E 100%)',
    chapterBg:
      'radial-gradient(ellipse at 80% 10%, rgba(139,92,246,0.15) 0%, transparent 50%), linear-gradient(160deg, #120828 0%, #08040E 100%)',
    accent: '#8B5CF6',
    accentRgb: '139,92,246',
    gold: '#EC4899',
    pageBg: '#FAF8FF',
    pageText: '#170D2A',
    mutedText: '#6B5A8A',
    borderColor: '#E4D8F8',
  },
  amber: {
    id: 'amber',
    coverBg:
      'radial-gradient(ellipse at 70% 20%, rgba(217,119,6,0.18) 0%, transparent 60%), radial-gradient(ellipse at 20% 80%, rgba(239,68,68,0.10) 0%, transparent 60%), linear-gradient(160deg, #0C0800 0%, #1A1000 50%, #0C0800 100%)',
    chapterBg:
      'radial-gradient(ellipse at 80% 10%, rgba(217,119,6,0.15) 0%, transparent 50%), linear-gradient(160deg, #1A1000 0%, #0C0800 100%)',
    accent: '#D97706',
    accentRgb: '217,119,6',
    gold: '#EF4444',
    pageBg: '#FFFDF5',
    pageText: '#1C1200',
    mutedText: '#7A6520',
    borderColor: '#EDE4C4',
  },
};

function detectTheme(title: string, content: string): Theme {
  const text = `${title} ${content}`.toLowerCase();
  if (
    text.includes('revenue') ||
    text.includes('sales') ||
    text.includes('money') ||
    text.includes('instagram') ||
    text.includes('creator') ||
    text.includes('business') ||
    text.includes('audience') ||
    text.includes('conversion')
  )
    return THEMES.crimson;
  if (
    text.includes('tech') ||
    text.includes('software') ||
    text.includes('code') ||
    text.includes('ai') ||
    text.includes('data') ||
    text.includes('saas')
  )
    return THEMES.ocean;
  if (
    text.includes('health') ||
    text.includes('fitness') ||
    text.includes('wellness') ||
    text.includes('growth') ||
    text.includes('habit') ||
    text.includes('nature')
  )
    return THEMES.emerald;
  if (
    text.includes('psychology') ||
    text.includes('design') ||
    text.includes('creative') ||
    text.includes('brand') ||
    text.includes('art') ||
    text.includes('mindset')
  )
    return THEMES.violet;
  if (
    text.includes('finance') ||
    text.includes('invest') ||
    text.includes('wealth') ||
    text.includes('gold') ||
    text.includes('market')
  )
    return THEMES.amber;
  return THEMES.crimson;
}

// ─────────────────────────────────────────────────────────────────────────────
// MERMAID DIAGRAM RENDERER
// ─────────────────────────────────────────────────────────────────────────────

// Counter for stable unique IDs (avoids Math.random collisions in fast renders)
let mermaidCounter = 0;

const MermaidBlock = ({ code }: { code: string }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<string>(`mermaid-${++mermaidCounter}`);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      if (!chartRef.current) return;

      // Clear previous render
      chartRef.current.innerHTML = '';

      try {
        const { svg } = await mermaid.render(idRef.current, code);
        if (!cancelled && chartRef.current) {
          chartRef.current.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled && chartRef.current) {
          chartRef.current.innerHTML = `<pre style="color:#e00;font-size:11px;padding:8px">${String(err)}</pre>`;
        }
      }
    };

    // Small delay so the DOM node is fully mounted
    const timer = setTimeout(render, 50);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code]);

  return (
    <div
      ref={chartRef}
      className="flex justify-center my-6 bg-[#FAFAFA] p-6 rounded-xl border border-gray-100 max-w-full overflow-x-auto"
    />
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN-AWARE PAGINATION HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the first heading text found in a markdown string, or undefined.
 * Used to label content pages in the TOC.
 */
function extractFirstHeading(md: string): string | undefined {
  const m = md.match(/^#{1,6}\s+(.+)$/m);
  return m ? m[1].trim() : undefined;
}

/**
 * Splits normalised markdown into page-sized chunks without breaking:
 *  - fenced code blocks (``` ... ```)
 *  - GFM tables (consecutive | lines)
 *  - heading + its immediate following paragraph
 *
 * `charLimit` controls approximate max characters per page.
 */
function paginateMarkdown(md: string, charLimit = 2400): string[] {
  // Split on blank lines to get "blocks" (headings, paragraphs, tables, fences)
  const rawBlocks = md.split(/\n\n+/);

  // Re-group fenced code blocks that got split across blank lines
  const blocks: string[] = [];
  let inFence = false;
  let fenceAccum = '';

  for (const block of rawBlocks) {
    const fenceCount = (block.match(/^```|^~~~/gm) || []).length;

    if (!inFence) {
      if (fenceCount % 2 === 1) {
        // Opening fence without close — start accumulating
        inFence = true;
        fenceAccum = block;
      } else {
        blocks.push(block);
      }
    } else {
      fenceAccum += '\n\n' + block;
      if (fenceCount % 2 === 1) {
        // Closing fence found
        inFence = false;
        blocks.push(fenceAccum);
        fenceAccum = '';
      }
    }
  }
  if (fenceAccum) blocks.push(fenceAccum); // unclosed fence — push anyway

  // Now accumulate blocks into pages
  const pages: string[] = [];
  let current = '';

  for (const block of blocks) {
    const isHeading = /^#{1,6} /.test(block.trimStart());
    const separator = current ? '\n\n' : '';

    // If adding this block would overflow, flush current page first
    // Exception: never start a new page on a heading alone — keep heading with next block
    if (
      current &&
      !isHeading &&
      (current + separator + block).length > charLimit
    ) {
      pages.push(current.trim());
      current = block;
    } else {
      current = current + separator + block;
    }
  }

  if (current.trim()) pages.push(current.trim());
  return pages;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT PARSER
// ─────────────────────────────────────────────────────────────────────────────

function parseContent(content: string): EbookPage[] {
  const pages: EbookPage[] = [];

  // STEP 1: Normalise markdown BEFORE any parsing so block detection is reliable
  const normalised = normalizeMarkdown(content);

  // STEP 2: Split into top-level chapter chunks on `# heading` (H1 only)
  const lines = normalised.split('\n');
  const chapterChunks: string[] = [];
  let currentChunk: string[] = [];

  for (const line of lines) {
    if (/^# /.test(line) && currentChunk.length > 0) {
      chapterChunks.push(currentChunk.join('\n'));
      currentChunk = [];
    }
    currentChunk.push(line);
  }
  if (currentChunk.length > 0) chapterChunks.push(currentChunk.join('\n'));

  // STEP 3: Fallback — no chapters found, paginate whole doc
  if (chapterChunks.length === 1 && !/^# /m.test(normalised)) {
    const paginated = paginateMarkdown(normalised);
    for (const pg of paginated) {
      pages.push({ kind: 'content', content: pg });
    }
    return pages;
  }

  let chapterCount = 0;

  for (const chunk of chapterChunks) {
    const chunkLines = chunk.split('\n');
    const firstLine = chunkLines[0]?.trim() ?? '';
    const bodyRaw = chunkLines.slice(1).join('\n').trim();

    if (/^# /.test(firstLine)) {
      chapterCount++;
      const chapterTitle = firstLine.replace(/^# /, '').trim();

      // Chapter title page
      pages.push({
        kind: 'chapter',
        title: chapterTitle,
        chapterNum: chapterCount,
        // Pass a short teaser (first non-blank line of body)
        content: bodyRaw,
      });

      // Paginate the chapter body if there is any
      if (bodyRaw) {
        const body = normalizeMarkdown(bodyRaw);
        const paginated = paginateMarkdown(body);
        for (const pg of paginated) {
          const heading = extractFirstHeading(pg);
          pages.push({
            kind: 'content',
            sectionTitle: heading ?? `Chapter ${chapterCount} (cont.)`,
            content: pg,
          });
        }
      }
    } else if (chunk.trim()) {
      // Pre-chapter content (preamble / intro)
      const paginated = paginateMarkdown(chunk.trim());
      for (const pg of paginated) {
        pages.push({ kind: 'content', content: pg });
      }
    }
  }

  return pages;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED REACT-MARKDOWN COMPONENTS FACTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Centralised component map so both ContentPage and PrintRoot use identical
 * renderers, avoiding drift between the two.
 */
function makeComponents(theme: Theme): Components {
  return {
    h2: ({ children }) => (
      <h2
        style={{
          fontFamily: '"DM Sans", "Inter", sans-serif',
          fontSize: '22px',
          fontWeight: 800,
          color: theme.accent,
          letterSpacing: '-0.01em',
          marginTop: '4px',
          marginBottom: '18px',
          paddingBottom: '12px',
          borderBottom: `2px solid rgba(${theme.accentRgb},0.14)`,
          lineHeight: 1.2,
        }}
      >
        {children}
      </h2>
    ),

    h3: ({ children }) => (
      <h3
        style={{
          fontFamily: '"DM Sans", "Inter", sans-serif',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '2.5px',
          textTransform: 'uppercase',
          color: theme.accent,
          marginTop: '24px',
          marginBottom: '8px',
          lineHeight: 1.4,
        }}
      >
        {children}
      </h3>
    ),

    h4: ({ children }) => (
      <h4
        style={{
          fontFamily: '"DM Sans", "Inter", sans-serif',
          fontSize: '15px',
          fontWeight: 700,
          color: theme.pageText,
          marginTop: '18px',
          marginBottom: '6px',
        }}
      >
        {children}
      </h4>
    ),

    p: ({ children }) => (
      <p
        style={{
          fontSize: '14.5px',
          lineHeight: '1.75',
          color: '#3A3A3A',
          marginBottom: '13px',
          fontFamily: 'Georgia, "Times New Roman", serif',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
        }}
      >
        {children}
      </p>
    ),

    blockquote: ({ children }) => (
      <blockquote
        style={{
          borderLeft: `4px solid ${theme.accent}`,
          background: `rgba(${theme.accentRgb},0.07)`,
          borderRadius: '0 8px 8px 0',
          padding: '14px 18px',
          margin: '18px 0',
          fontStyle: 'normal',
        }}
      >
        <div
          style={{
            fontFamily: '"DM Sans", "Inter", sans-serif',
            fontSize: '9px',
            fontWeight: 800,
            letterSpacing: '2.5px',
            textTransform: 'uppercase',
            color: theme.accent,
            marginBottom: '6px',
          }}
        >
          Key Insight
        </div>
        {children}
      </blockquote>
    ),

    ul: ({ children }) => (
      <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0' }}>
        {children}
      </ul>
    ),

    ol: ({ children }) => (
      <ol
        style={{
          paddingLeft: '20px',
          margin: '10px 0',
          fontSize: '14px',
          color: '#3A3A3A',
          lineHeight: '1.7',
          fontFamily: 'Georgia, serif',
        }}
      >
        {children}
      </ol>
    ),

    li: ({ children }) => (
      <li
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start',
          marginBottom: '7px',
          fontSize: '14px',
          color: '#3A3A3A',
          lineHeight: '1.68',
          fontFamily: 'Georgia, serif',
        }}
      >
        <span
          style={{
            flexShrink: 0,
            marginTop: '7px',
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            background: theme.accent,
            display: 'block',
          }}
        />
        <span>{children}</span>
      </li>
    ),

    strong: ({ children }) => (
      <strong
        style={{
          fontWeight: 700,
          color: theme.pageText,
          fontFamily: '"DM Sans", "Inter", sans-serif',
        }}
      >
        {children}
      </strong>
    ),

    em: ({ children }) => (
      <em style={{ fontStyle: 'italic', color: '#555' }}>{children}</em>
    ),

    table: ({ children }) => (
      <div
        style={{
          overflowX: 'auto',
          margin: '18px 0',
          borderRadius: '10px',
          boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
          border: `1px solid ${theme.borderColor}`,
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12.5px',
            fontFamily: '"DM Sans", "Inter", sans-serif',
          }}
        >
          {children}
        </table>
      </div>
    ),

    thead: ({ children }) => (
      <thead style={{ background: theme.pageText }}>{children}</thead>
    ),

    th: ({ children }) => (
      <th
        style={{
          padding: '10px 13px',
          textAlign: 'left',
          color: '#FFFFFF',
          fontWeight: 700,
          fontSize: '10px',
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </th>
    ),

    td: ({ children }) => (
      <td
        style={{
          padding: '10px 13px',
          borderBottom: `1px solid ${theme.borderColor}`,
          color: '#4A4A4A',
          verticalAlign: 'top',
          lineHeight: 1.5,
        }}
      >
        {children}
      </td>
    ),

    hr: () => (
      <div
        style={{
          margin: '22px 0',
          height: '1px',
          background: `linear-gradient(90deg, transparent, rgba(${theme.accentRgb},0.3), transparent)`,
        }}
      />
    ),

    // ── Code blocks & inline code ──────────────────────────────────────────
    code: ({
      children,
      className,
      ...props
    }: React.ComponentPropsWithoutRef<'code'> & { inline?: boolean }) => {
      const match = /language-(\w+)/.exec(className ?? '');
      const language = match?.[1];

      // Mermaid diagram
      if (language === 'mermaid') {
        return (
          <MermaidBlock code={String(children).replace(/\n$/, '')} />
        );
      }

      // Inline code — no `inline` prop from remark; detect by absence of newlines
      const isInline = !String(children).includes('\n') && !className;
      if (isInline) {
        return (
          <code
            style={{
              fontFamily: '"Fira Code", "Cascadia Code", monospace',
              fontSize: '12.5px',
              background: `rgba(${theme.accentRgb},0.09)`,
              color: theme.accent,
              padding: '2px 6px',
              borderRadius: '4px',
            }}
            {...props}
          >
            {children}
          </code>
        );
      }

      // Fenced code block
      return (
        <pre
          style={{
            background: '#111111',
            color: '#F5F5F5',
            padding: '16px 18px',
            borderRadius: '10px',
            overflowX: 'auto',
            margin: '18px 0',
            fontSize: '12px',
            lineHeight: 1.6,
            fontFamily: '"Fira Code", "Cascadia Code", monospace',
          }}
        >
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      );
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COVER PAGE
// ─────────────────────────────────────────────────────────────────────────────

function CoverPage({
  mainTitle,
  subTitle,
  theme,
  totalPages,
}: {
  mainTitle: string;
  subTitle: string;
  theme: Theme;
  totalPages: number;
}) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center text-center p-16 overflow-hidden"
      style={{ background: theme.coverBg }}
    >
      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />

      {/* Top-right glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '-15%',
          right: '-10%',
          width: '520px',
          height: '520px',
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(${theme.accentRgb},0.22) 0%, transparent 70%)`,
          filter: 'blur(40px)',
        }}
      />

      {/* Bottom-left glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: '-15%',
          left: '-10%',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${theme.gold}28 0%, transparent 70%)`,
          filter: 'blur(40px)',
        }}
      />

      <div className="relative z-10 max-w-2xl w-full">
        {/* Eyebrow badge */}
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold tracking-[3px] uppercase mb-10 border"
          style={{
            color: theme.accent,
            borderColor: `rgba(${theme.accentRgb},0.25)`,
            background: `rgba(${theme.accentRgb},0.08)`,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: theme.accent }}
          />
          Exclusive Playbook
        </div>

        {/* Title */}
        <h1
          className="text-5xl md:text-[64px] font-black text-white leading-[1.04] tracking-[-0.02em] mb-6"
          style={{ fontFamily: '"DM Sans", "Inter", sans-serif' }}
        >
          {mainTitle}
        </h1>

        {/* Subtitle */}
        {subTitle && (
          <p
            className="text-lg md:text-xl leading-relaxed mb-12 max-w-xl mx-auto"
            style={{
              color: 'rgba(255,255,255,0.48)',
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontStyle: 'italic',
            }}
          >
            {subTitle}
          </p>
        )}

        {/* Divider */}
        <div
          className="w-20 h-px mx-auto mb-12"
          style={{
            background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)`,
          }}
        />

        {/* Stats row */}
        
  
        
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAPTER TITLE PAGE
// ─────────────────────────────────────────────────────────────────────────────

function ChapterPage({ page, theme }: { page: EbookPage; theme: Theme }) {
  const numStr = String(page.chapterNum ?? 1).padStart(2, '0');

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center text-center p-16 overflow-hidden"
      style={{ background: theme.chapterBg }}
    >
      {/* Ghost number */}
      <div
        className="absolute select-none pointer-events-none font-black"
        style={{
          fontSize: 'clamp(180px, 30vw, 280px)',
          lineHeight: 1,
          color: 'rgba(255,255,255,0.03)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          fontFamily: '"DM Sans", "Inter", sans-serif',
        }}
      >
        {numStr}
      </div>

      {/* Diagonal hatching */}
      <div
        className="absolute pointer-events-none opacity-10"
        style={{
          inset: 0,
          backgroundImage: `repeating-linear-gradient(-45deg, ${theme.accent} 0px, ${theme.accent} 1px, transparent 1px, transparent 56px)`,
        }}
      />

      <div className="relative z-10 max-w-xl">
        <div
          className="text-[10px] font-black tracking-[5px] uppercase mb-5"
          style={{ color: theme.accent }}
        >
          Chapter {page.chapterNum}
        </div>

        <div
          className="w-10 h-[3px] mx-auto mb-8 rounded-full"
          style={{ background: theme.accent }}
        />

        <h2
          className="text-4xl md:text-5xl font-black text-white leading-[1.1] tracking-[-0.015em]"
          style={{ fontFamily: '"DM Sans", "Inter", sans-serif' }}
        >
          {page.title}
        </h2>

        {page.content && (
          <p
            className="mt-8 text-[15px] leading-relaxed max-w-md mx-auto"
            style={{
              color: 'rgba(255,255,255,0.38)',
              fontFamily: 'Georgia, serif',
              fontStyle: 'italic',
            }}
          >
            {page.content
              .replace(/[#*`_>[\]|]/g, '')
              .trim()
              .substring(0, 180)
              .trimEnd()}
            …
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT PAGE
// ─────────────────────────────────────────────────────────────────────────────

function ContentPage({
  page,
  theme,
  pageNum,
  totalPages,
}: {
  page: EbookPage;
  theme: Theme;
  pageNum: number;
  totalPages: number;
}) {
  const components = useMemo(() => makeComponents(theme), [theme]);

  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{ background: theme.pageBg }}
    >
      {/* Accent bar */}
      <div
        className="flex-none h-[3px] w-full"
        style={{
          background: `linear-gradient(90deg, ${theme.accent} 0%, ${theme.gold} 100%)`,
        }}
      />

      {/*
        FIXED: was `overflow-hidden` which silently clipped content.
        Now we use `overflow-y-auto` so long pages are scrollable in the
        viewer, and the pagination ensures content fits reasonably well.
      */}
      <div
        className="flex-1 overflow-y-auto px-10 md:px-14 py-8"
        style={{ minHeight: 0 }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {page.content ?? ''}
        </ReactMarkdown>
      </div>

      {/* Footer */}
      <div
        className="flex-none flex items-center justify-between px-10 md:px-14 py-3 border-t"
        style={{ borderColor: theme.borderColor }}
      >
        <div
          className="w-8 h-[2px] rounded-full"
          style={{ background: theme.accent }}
        />
        <span
          className="text-[11px] font-semibold"
          style={{
            color: theme.mutedText,
            fontFamily: '"DM Sans", "Inter", sans-serif',
            letterSpacing: '1px',
          }}
        >
          {pageNum} / {totalPages}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TABLE OF CONTENTS PANEL
// ─────────────────────────────────────────────────────────────────────────────

function TOCPanel({
  pages,
  currentPage,
  onNavigate,
  onClose,
  theme,
}: {
  pages: EbookPage[];
  currentPage: number;
  onNavigate: (idx: number) => void;
  onClose: () => void;
  theme: Theme;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -16, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -16, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      className="absolute left-5 top-20 z-50 w-80 rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.96)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 20px 60px -10px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}
      >
        <span
          className="text-[13px] font-bold"
          style={{ fontFamily: '"DM Sans","Inter",sans-serif', color: '#111' }}
        >
          Contents
        </span>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-800 hover:bg-gray-100 transition-all"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Entries */}
      <div className="overflow-y-auto max-h-[60vh] p-2">
        {/* Cover entry */}
        <button
          onClick={() => onNavigate(0)}
          className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
          style={{
            background:
              currentPage === 0 ? `rgba(${theme.accentRgb},0.08)` : 'transparent',
          }}
        >
          <span
            className="text-[10px] font-bold w-5 text-center flex-none"
            style={{ color: theme.mutedText }}
          >
            —
          </span>
          <span
            className="text-[13px] font-semibold"
            style={{ color: currentPage === 0 ? theme.accent : '#333' }}
          >
            Cover
          </span>
        </button>

        {pages.map((page, idx) => {
          const pageIdx = idx + 1;
          const isActive = currentPage === pageIdx;
          const label =
            page.kind === 'chapter'
              ? `Ch. ${page.chapterNum}: ${page.title}`
              : page.sectionTitle ?? `Page ${pageIdx}`;

          return (
            <button
              key={idx}
              onClick={() => onNavigate(pageIdx)}
              className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
              style={{
                background: isActive
                  ? `rgba(${theme.accentRgb},0.08)`
                  : 'transparent',
              }}
            >
              <span
                className="text-[10px] font-bold w-5 text-center flex-none"
                style={{ color: theme.mutedText }}
              >
                {pageIdx}
              </span>
              <span
                className="text-[13px] truncate"
                style={{
                  fontWeight: page.kind === 'chapter' ? 700 : 400,
                  color: isActive
                    ? theme.accent
                    : page.kind === 'chapter'
                    ? '#111'
                    : '#555',
                  fontFamily: '"DM Sans","Inter",sans-serif',
                }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF PRINT STYLESHEET
// ─────────────────────────────────────────────────────────────────────────────

function injectPrintStyles(theme: Theme) {
  const id = 'ebook-print-css';
  document.getElementById(id)?.remove();

  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    @media print {
      @page { size: A4 portrait; margin: 0; }

      body > *:not(#__ebook_print_root) { display: none !important; }
      #__ebook_print_root {
        display: block !important;
        position: static;
        overflow: visible;
      }

      /*
       * Fixed pages (cover + chapter title slides) stay exactly one A4 page.
       * Content is intentionally clipped here — these are full-bleed decorative pages.
       */
      .ebook-fixed-page {
        width: 210mm;
        height: 297mm;
        position: relative;
        page-break-after: always;
        page-break-inside: avoid;
        overflow: hidden;
        box-sizing: border-box;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .ebook-cover-print {
        width: 210mm;
        height: 297mm;
        background: ${theme.coverBg} !important;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 60px;
        box-sizing: border-box;
        color: white;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .ebook-chapter-print {
        width: 210mm;
        height: 297mm;
        background: ${theme.chapterBg} !important;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 60px;
        box-sizing: border-box;
        color: white;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /*
       * Content pages: NO fixed height, NO overflow:hidden.
       * Browser print engine paginates naturally.
       * page-break-before ensures each chapter's content starts fresh.
       */
      .ebook-content-wrap {
        width: 210mm;
        box-sizing: border-box;
        page-break-before: always;
        background: ${theme.pageBg} !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .ebook-content-accent {
        width: 210mm;
        height: 3px;
        background: linear-gradient(90deg, ${theme.accent}, ${theme.gold}) !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .ebook-content-print {
        width: 210mm;
        box-sizing: border-box;
        padding: 16mm 18mm 20mm 18mm;
        background: ${theme.pageBg} !important;
        font-family: Georgia, serif;
        font-size: 10.5pt;
        line-height: 1.72;
        color: ${theme.pageText};
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* Keep headings glued to what follows */
      .ebook-content-print h2 {
        font-family: "DM Sans", "Inter", sans-serif;
        font-size: 17pt; font-weight: 800;
        color: ${theme.accent} !important;
        margin-top: 4pt; margin-bottom: 12pt;
        padding-bottom: 8pt;
        border-bottom: 2pt solid rgba(${theme.accentRgb},0.2);
        page-break-after: avoid;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .ebook-content-print h3 {
        font-family: "DM Sans", "Inter", sans-serif;
        font-size: 7.5pt; font-weight: 700;
        letter-spacing: 2pt; text-transform: uppercase;
        color: ${theme.accent} !important;
        margin-top: 16pt; margin-bottom: 5pt;
        page-break-after: avoid;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .ebook-content-print h4 {
        font-family: "DM Sans", "Inter", sans-serif;
        font-size: 10.5pt; font-weight: 700;
        color: ${theme.pageText};
        margin-top: 12pt; margin-bottom: 4pt;
        page-break-after: avoid;
      }

      .ebook-content-print p {
        margin-bottom: 10pt;
        orphans: 3;
        widows: 3;
      }

      /* Tables: keep together, never split across pages */
      .ebook-content-print table {
        width: 100%; border-collapse: collapse;
        font-family: "DM Sans", "Inter", sans-serif;
        font-size: 8.5pt; margin: 12pt 0;
        page-break-inside: avoid;
      }

      .ebook-content-print th {
        background: ${theme.pageText} !important;
        color: white !important;
        padding: 6pt 10pt; text-align: left;
        font-size: 7pt; font-weight: 700;
        letter-spacing: 1pt; text-transform: uppercase;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .ebook-content-print td {
        padding: 6pt 10pt;
        border-bottom: 0.5pt solid ${theme.borderColor};
        vertical-align: top;
        word-break: break-word;
      }

      /* Blockquotes: keep together */
      .ebook-content-print blockquote {
        border-left: 4pt solid ${theme.accent} !important;
        background: rgba(${theme.accentRgb},0.06) !important;
        padding: 10pt 14pt; margin: 12pt 0;
        border-radius: 0 6pt 6pt 0;
        page-break-inside: avoid;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .ebook-content-print strong {
        font-weight: 700;
        color: ${theme.pageText};
      }

      /* Code blocks: keep together, wrap long lines */
      .ebook-content-print pre {
        background: #111 !important;
        color: #f5f5f5;
        padding: 10pt 12pt;
        border-radius: 6pt;
        font-size: 7.5pt;
        line-height: 1.5;
        page-break-inside: avoid;
        white-space: pre-wrap;
        word-break: break-all;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .ebook-content-print ul,
      .ebook-content-print ol {
        margin: 8pt 0;
        padding-left: 0;
      }

      .ebook-content-print li {
        margin-bottom: 5pt;
        font-size: 10.5pt;
        line-height: 1.65;
        page-break-inside: avoid;
      }

      /* Footer sits below the content block, one per chapter section */
      .ebook-print-footer {
        width: 210mm;
        box-sizing: border-box;
        display: flex; align-items: center; justify-content: space-between;
        padding: 5pt 18mm 10mm 18mm;
        border-top: 0.5pt solid ${theme.borderColor};
        font-family: "DM Sans","Inter",sans-serif;
        font-size: 7pt; color: ${theme.mutedText};
        background: ${theme.pageBg} !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  `;
  document.head.appendChild(style);
}

// ─────────────────────────────────────────────────────────────────────────────
// HIDDEN PRINT ROOT
// ─────────────────────────────────────────────────────────────────────────────

function PrintRoot({
  mainTitle,
  subTitle,
  pages,
  theme,
  printRef,
}: {
  mainTitle: string;
  subTitle: string;
  pages: EbookPage[];
  theme: Theme;
  printRef: React.RefObject<HTMLDivElement>;
}) {
  const totalPages = pages.length + 1;
  const components = useMemo(() => makeComponents(theme), [theme]);

  return (
    <div
      id="__ebook_print_root"
      ref={printRef}
      style={{
        display: 'none',
        position: 'absolute',
        top: '-9999px',
        left: '-9999px',
        width: '210mm',
      }}
    >
      {/* Cover */}
      <div className="ebook-print-page">
        <div className="ebook-cover-print">
          <h1
            style={{
              fontSize: '42pt',
              fontWeight: 900,
              color: 'white',
              marginBottom: '16px',
              fontFamily: '"DM Sans","Inter",sans-serif',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}
          >
            {mainTitle}
          </h1>
          {subTitle && (
            <p
              style={{
                fontSize: '16pt',
                color: 'rgba(255,255,255,0.45)',
                fontStyle: 'italic',
                fontFamily: 'Georgia,serif',
                marginTop: '12px',
              }}
            >
              {subTitle}
            </p>
          )}
        </div>
      </div>

      {/* Content pages */}
      {pages.map((page, idx) => (
        <div key={idx} className="ebook-print-page" style={{ position: 'relative' }}>
          {page.kind === 'chapter' ? (
            <div className="ebook-chapter-print">
              <div
                style={{
                  fontSize: '8pt',
                  fontWeight: 800,
                  letterSpacing: '4px',
                  textTransform: 'uppercase',
                  color: theme.accent,
                  marginBottom: '20px',
                  fontFamily: '"DM Sans","Inter",sans-serif',
                }}
              >
                Chapter {page.chapterNum}
              </div>
              <h2
                style={{
                  fontSize: '30pt',
                  fontWeight: 900,
                  color: 'white',
                  wordBreak: 'break-word',
                  fontFamily: '"DM Sans","Inter",sans-serif',
                  lineHeight: 1.1,
                  maxWidth: '480px',
                  display: 'block',
                }}
              >
                {page.title}
              </h2>
            </div>
          ) : (
            <>
              <div
                style={{
                  height: '3px',
                  background: `linear-gradient(90deg, ${theme.accent}, ${theme.gold})`,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                }}
              />
              <div
                className="ebook-content-print"
                style={{ paddingTop: '22mm' }}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={components}
                >
                  {page.content ?? ''}
                </ReactMarkdown>
              </div>
              <div className="ebook-print-footer">
                <span>{mainTitle}</span>
                <span>
                  {idx + 2} / {totalPages}
                </span>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function EbookCanvas({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [direction, setDirection] = useState(0);
  const [showTOC, setShowTOC] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Parse title → main + subtitle
  const colonIdx = title.indexOf(':');
  const mainTitle = colonIdx > 0 ? title.slice(0, colonIdx).trim() : title;
  const subTitle = colonIdx > 0 ? title.slice(colonIdx + 1).trim() : '';

  // Detect theme once
  const theme = useMemo(() => detectTheme(title, content), [title, content]);

  // Strip the duplicated H1 title that the AI sometimes includes in the body
  const sanitizedContent = useMemo(() => {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const titleRegex = new RegExp(`^#\\s+${escaped}`, 'im');
    // Also normalise here so parseContent receives clean input
    return normalizeMarkdown(content.replace(titleRegex, '').trim());
  }, [content, title]);

  // Parse into typed pages
  const pages = useMemo(() => parseContent(sanitizedContent), [sanitizedContent]);
  const totalPages = pages.length + 1; // +1 for cover

  // ── Navigation ────────────────────────────────────────────────────────────

  const navigate = useCallback(
    (newDir: number) => {
      const next = currentPage + newDir;
      if (next >= 0 && next < totalPages) {
        setDirection(newDir);
        setCurrentPage(next);
      }
    },
    [currentPage, totalPages]
  );

  const goTo = useCallback(
    (idx: number) => {
      setDirection(idx > currentPage ? 1 : -1);
      setCurrentPage(idx);
      setShowTOC(false);
    },
    [currentPage]
  );

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') navigate(1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') navigate(-1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

  // ── PDF Export ────────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    setIsExporting(true);
    const toastId = toast.loading('Compiling PDF…');

    try {
      const printContents = printRef.current?.innerHTML;
      if (!printContents) throw new Error('No content to print');

      injectPrintStyles(theme);

      const iframe = document.createElement('iframe');
      iframe.style.cssText =
        'position:fixed;right:-9999px;bottom:-9999px;width:1px;height:1px;opacity:0;';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document;
      if (!iframeDoc) throw new Error('iframe generation failed');

      iframeDoc.open();
      iframeDoc.write(`<!DOCTYPE html>
<html>
  <head>
    <title>${mainTitle.replace(/\s+/g, '_')}</title>
    <style>
      @page { size: A4 portrait; margin: 0; }
      body { margin:0; padding:0; background:white;
             -webkit-print-color-adjust:exact; print-color-adjust:exact; }

      .ebook-print-page {
        width:210mm; height:297mm; position:relative; overflow:hidden;
        box-sizing:border-box; page-break-after:always; page-break-inside:avoid;
      }
      .ebook-cover-print {
        height:297mm; background:${theme.coverBg} !important;
        display:flex; flex-direction:column; align-items:center;
        justify-content:center; text-align:center; padding:60px; color:white;
        -webkit-print-color-adjust:exact; print-color-adjust:exact;
      }
      .ebook-chapter-print {
        height:297mm; background:${theme.chapterBg} !important;
        display:flex; flex-direction:column; align-items:center;
        justify-content:center; text-align:center; padding:60px; color:white;
        -webkit-print-color-adjust:exact; print-color-adjust:exact;
      }
      .ebook-content-print {
        height:297mm; box-sizing:border-box; overflow:hidden;
        padding:22mm 18mm 30mm 18mm;
        background:${theme.pageBg} !important;
        font-family:Georgia,serif; font-size:10.5pt; line-height:1.72;
        color:${theme.pageText};
        -webkit-print-color-adjust:exact; print-color-adjust:exact;
      }
      .ebook-content-print h2 {
        font-family:"DM Sans","Inter",sans-serif; font-size:18pt; font-weight:800;
        color:${theme.accent} !important; margin-top:0; margin-bottom:14px;
        padding-bottom:10px; border-bottom:2px solid rgba(${theme.accentRgb},0.2);
        -webkit-print-color-adjust:exact; print-color-adjust:exact;
      }
      .ebook-content-print h3 {
        font-family:"DM Sans","Inter",sans-serif; font-size:8pt; font-weight:700;
        letter-spacing:2px; text-transform:uppercase;
        color:${theme.accent} !important; margin-top:18px; margin-bottom:6px;
        -webkit-print-color-adjust:exact; print-color-adjust:exact;
      }
      .ebook-content-print h4 {
        font-family:"DM Sans","Inter",sans-serif; font-size:11pt; font-weight:700;
        color:${theme.pageText}; margin-top:14px; margin-bottom:5px;
      }
      .ebook-content-print blockquote {
        border-left:4px solid ${theme.accent} !important;
        background:rgba(${theme.accentRgb},0.06) !important;
        padding:10px 14px; margin:14px 0; border-radius:0 8px 8px 0;
        -webkit-print-color-adjust:exact; print-color-adjust:exact;
      }
      .ebook-content-print table {
        width:100%; border-collapse:collapse;
        font-family:"DM Sans","Inter",sans-serif; font-size:8.5pt; margin:14px 0;
      }
      .ebook-content-print th {
        background:${theme.pageText} !important; color:white !important;
        padding:7px 11px; text-align:left; font-size:7pt; font-weight:700;
        letter-spacing:1px; text-transform:uppercase;
        -webkit-print-color-adjust:exact; print-color-adjust:exact;
      }
      .ebook-content-print td {
        padding:7px 11px; border-bottom:1px solid ${theme.borderColor};
        vertical-align:top;
      }
      .ebook-content-print strong { font-weight:700; color:${theme.pageText}; }
      .ebook-content-print pre {
        background:#111 !important; color:#f5f5f5;
        padding:12px 14px; border-radius:8px; font-size:8pt; overflow:hidden;
        -webkit-print-color-adjust:exact; print-color-adjust:exact;
      }
      .ebook-print-footer {
        position:absolute; left:18mm; right:18mm; bottom:10mm;
        display:flex; align-items:center; justify-content:space-between;
        font-family:"DM Sans","Inter",sans-serif; font-size:7.5pt;
        color:${theme.mutedText}; border-top:1px solid ${theme.borderColor};
        padding-top:5px;
      }
    </style>
  </head>
  <body>${printContents}</body>
</html>`);
      iframeDoc.close();

      iframe.onload = () => {
        toast.success('Ready — choose "Save as PDF" in the print dialog.', {
          id: toastId,
        });
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          setIsExporting(false);
        }, 1500);
      };
    } catch (err) {
      console.error(err);
      toast.error('Failed to compile PDF.', { id: toastId });
      setIsExporting(false);
    }
  }, [mainTitle, theme]);

  // ── Page flip animation variants ─────────────────────────────────────────

  const variants: Variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? '55%' : '-55%',
      opacity: 0,
      rotateY: dir > 0 ? 20 : -20,
      scale: 0.93,
    }),
    center: {
      x: 0,
      opacity: 1,
      rotateY: 0,
      scale: 1,
      transition: {
        type: 'spring' as const,
        stiffness: 280,
        damping: 28,
        mass: 0.45,
      },
    },
    exit: (dir: number) => ({
      x: dir < 0 ? '55%' : '-55%',
      opacity: 0,
      rotateY: dir < 0 ? 20 : -20,
      scale: 0.93,
      transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
    }),
  };

  // ── Render a single page by index ────────────────────────────────────────

  const renderPage = (idx: number) => {
    if (idx === 0) {
      return (
        <CoverPage
          mainTitle={mainTitle}
          subTitle={subTitle}
          theme={theme}
          totalPages={totalPages}
        />
      );
    }
    const page = pages[idx - 1];
    if (!page) return null;
    if (page.kind === 'chapter')
      return <ChapterPage page={page} theme={theme} />;
    return (
      <ContentPage
        page={page}
        theme={theme}
        pageNum={idx + 1}
        totalPages={totalPages}
      />
    );
  };

  const progress = (currentPage / Math.max(totalPages - 1, 1)) * 100;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* Off-screen print root */}
      <PrintRoot
        mainTitle={mainTitle}
        subTitle={subTitle}
        pages={pages}
        theme={theme}
        printRef={printRef}
      />

      {/* Interactive viewer */}
      <div
        className="relative w-full h-screen flex flex-col items-center justify-center overflow-hidden"
        style={{ background: '#EDECEB' }}
      >
        {/* Reading progress bar */}
        <div
          className="absolute top-0 left-0 h-[2px] transition-all duration-300"
          style={{
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${theme.accent}, ${theme.gold})`,
            zIndex: 60,
          }}
        />

        {/* Glass header */}
        <div
          className="absolute top-5 z-50 flex items-center justify-between w-[90%] max-w-5xl px-5 py-3 rounded-full"
          style={{
            background: 'rgba(255,255,255,0.72)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.55)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
          }}
        >
          {/* Left: icon + title */}
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-none"
              style={{ background: theme.accent }}
            >
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <div
                className="text-[13px] font-bold text-gray-900 leading-none"
                style={{ fontFamily: '"DM Sans","Inter",sans-serif' }}
              >
                {mainTitle}
              </div>
              <div
                className="text-[11px] text-gray-500 mt-0.5"
                style={{ fontFamily: '"DM Sans","Inter",sans-serif' }}
              >
                Page {currentPage + 1} of {totalPages}
              </div>
            </div>
          </div>

          {/* Right: TOC + Export */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTOC((v) => !v)}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
              style={{
                background: showTOC
                  ? `rgba(${theme.accentRgb},0.12)`
                  : 'rgba(0,0,0,0.06)',
                color: showTOC ? theme.accent : '#555',
              }}
              title="Table of Contents"
            >
              <AlignLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-bold text-white transition-all active:scale-95 disabled:opacity-60"
              style={{ background: theme.accent }}
            >
              <Download className="w-3.5 h-3.5" />
              {isExporting ? 'Preparing…' : 'Export PDF'}
            </button>
          </div>
        </div>

        {/* TOC panel */}
        <AnimatePresence>
          {showTOC && (
            <TOCPanel
              pages={pages}
              currentPage={currentPage}
              onNavigate={goTo}
              onClose={() => setShowTOC(false)}
              theme={theme}
            />
          )}
        </AnimatePresence>

        {/* Flipbook viewport */}
        <div
          className="relative w-full flex items-center justify-center"
          style={{
            maxWidth: '860px',
            width: '100%',
            aspectRatio: '210 / 297',
            maxHeight: '88vh',
            perspective: '2200px',
          }}
        >
          {/* Left arrow */}
          <button
            onClick={() => navigate(-1)}
            disabled={currentPage === 0}
            className="absolute z-20 flex items-center justify-center w-11 h-11 rounded-full text-gray-800 transition-all active:scale-90 disabled:pointer-events-none disabled:opacity-0"
            style={{
              left: '-56px',
              background: 'rgba(255,255,255,0.85)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
            }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Right arrow */}
          <button
            onClick={() => navigate(1)}
            disabled={currentPage === totalPages - 1}
            className="absolute z-20 flex items-center justify-center w-11 h-11 rounded-full text-gray-800 transition-all active:scale-90 disabled:pointer-events-none disabled:opacity-0"
            style={{
              right: '-56px',
              background: 'rgba(255,255,255,0.85)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
            }}
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Animated page */}
          <AnimatePresence initial={false} custom={direction} mode="wait">
            <motion.div
              key={currentPage}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                borderRadius: '14px',
                overflow: 'hidden',
                boxShadow:
                  '0 30px 80px -10px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.05)',
                transformStyle: 'preserve-3d',
              }}
            >
              {renderPage(currentPage)}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Dot pagination */}
        <div className="absolute bottom-5 flex items-center gap-1.5">
          {(() => {
            const count = Math.min(totalPages, 18);
            const step =
              totalPages <= 18 ? 1 : (totalPages - 1) / (count - 1);
            return Array.from({ length: count }, (_, i) => {
              const target = Math.round(i * step);
              const isActive = currentPage === target;
              return (
                <button
                  key={i}
                  onClick={() => goTo(target)}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: isActive ? '22px' : '6px',
                    height: '6px',
                    background: isActive
                      ? theme.accent
                      : 'rgba(0,0,0,0.18)',
                  }}
                />
              );
            });
          })()}
        </div>

        {/* Keyboard hint */}
        <div
          className="absolute bottom-5 right-6 text-[10px] font-medium tracking-wide opacity-40"
          style={{
            fontFamily: '"DM Sans","Inter",sans-serif',
            color: '#555',
          }}
        >
          Press ← → to navigate
        </div>
      </div>
    </>
  );
}