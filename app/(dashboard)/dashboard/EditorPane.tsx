'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, ChevronDown, ChevronUp, RefreshCw,
  User as UserIcon, Aperture, FileText,
  PanelRightClose, PanelRightOpen, PanelLeftOpen,
  Activity, Zap, AlertTriangle, Copy, Edit2, Upload, Paperclip,
  MoreHorizontal, Plus, UploadCloud, Quote, Check, CornerDownRight,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ToolHub } from '@/components/ToolHub';
import { toolById } from '@/lib/forge/entitlements';
import { COMPOSE_EVENT, takePendingCompose, type ComposeDetail } from '@/components/forge/views/ViewShell';
import { LimitReachedModal, friendlyChatError, type QuotaSnapshot } from '@/components/LimitReachedModal';
import {
  ACCEPT_ATTRIBUTE,
  sortAndEncodeFiles,
  toRawAttachment,
  formatBytes,
  type PendingDocument,
} from '@/lib/attachments';
import { firstName } from '@/lib/user-display';
import toast from 'react-hot-toast';
import { readEventStream, useDraftStore, useWorkspaceStore } from '@/lib/forge/client';
import { MARKER, markerBlock, type ChatStreamEvent, type ClarifyingQuestion, type Grade, type PlanProposal } from '@/lib/forge/types';
import { DraftCardById } from '@/components/forge/drafts/DraftCard';
import { GradeReveal } from '@/components/forge/drafts/GradeStrip';
import { QuestionsCard, parseAnswers } from '@/components/forge/chat/QuestionsCard';
import { PlanCard, formatApprovedPlan, parseApprovedPlan } from '@/components/forge/chat/PlanCard';
import { MemoryChip } from '@/components/forge/chat/MemoryChip';
import { ProgressSteps, type StepState } from '@/components/forge/chat/ProgressSteps';
import { ComposerMenu, storyMenuItem, useStorySearch } from '@/components/forge/chat/ComposerMenu';
import {
  activeMention,
  attachMentionedStories,
  extractStoryBlocks,
  insertMention,
  matchSlashCommands,
  resolveSlashCommand,
  type StoryMention,
} from '@/lib/forge/commands';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Image data URLs. Column name kept for database compatibility. */
  attachments?: string[];
}

const MODELS = [
  { id: 'claude haiku 4.5', provider: 'anthropic', desc: 'Deep synthesis & strategy' }
];


/**
 * Enter sends on a hardware keyboard; on a touch keyboard it inserts a
 * newline and the send button is the only way to submit.
 *
 * Shift+Enter is the escape hatch on desktop, but a phone keyboard has no
 * comfortable Shift, so binding Enter to send there makes multi-line input
 * effectively impossible — every paragraph break fires a half-written message.
 */
function isHardwareKeyboard(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(min-width: 768px)').matches;
}

// ============================================================================
// MESSAGE CONTENT MARKERS
//
// A user message carries more than the text typed into the box: it can also
// carry a quoted selection and the server-extracted text of attached files.
// Rather than adding database columns for each, that structure is encoded in
// the message body using explicit markers and parsed back out for display.
//
// This keeps the model's view and the database row identical (both hold the
// full context) while the UI shows only what the user actually typed, with
// the rest rendered as chips and quote bars.
// ============================================================================

const QUOTE_PATTERN = /\[QUOTED FROM YOUR PREVIOUS RESPONSE\]\n([\s\S]*?)\n\[\/QUOTED\]\n*/;
const ATTACHED_FILE_PATTERN = /\n*\[ATTACHED FILE: (.+?)\]\n[\s\S]*?\n\[END FILE: \1\]/g;
const PARSER_NOTE_PATTERN = /\n*\[PARSER NOTE — .+?\]:[^\n]*/g;
const FAILED_FILE_PATTERN = /\n*\[SYSTEM NOTE: "(.+?)" attached but failed to parse: ([^\]]*)\]/g;

/** Pre-unification format. Retained so existing chat history still renders. */
const LEGACY_DOCUMENT_PATTERN = /\[Document: (.+?)\]\n[\s\S]*?\n\nUser Prompt: /g;

const CANVAS_PATTERN = /<canvas_artifact([^>]*)>([\s\S]*?)<\/canvas_artifact>/g;
const THINK_PATTERN = /<think>([\s\S]*?)<\/think>/i;

interface ParsedFileChip {
  name: string;
  error?: string;
}

interface ParsedUserMessage {
  quote: string | null;
  files: ParsedFileChip[];
  stories: string[];
  text: string;
}

function parseUserMessage(content: string): ParsedUserMessage {
  let working = content;
  const files: ParsedFileChip[] = [];

  const quoteMatch = working.match(QUOTE_PATTERN);
  const quote = quoteMatch ? quoteMatch[1].trim() : null;
  if (quoteMatch) working = working.replace(QUOTE_PATTERN, '');

  working = working.replace(ATTACHED_FILE_PATTERN, (_full, name: string) => {
    files.push({ name });
    return '';
  });

  working = working.replace(FAILED_FILE_PATTERN, (_full, name: string, reason: string) => {
    files.push({ name, error: reason.trim() || 'Could not be read' });
    return '';
  });

  working = working.replace(LEGACY_DOCUMENT_PATTERN, (_full, name: string) => {
    files.push({ name });
    return '';
  });

  working = working.replace(PARSER_NOTE_PATTERN, '');

  const { text, titles: stories } = extractStoryBlocks(working);
  return { quote, files, stories, text: text.trim() };
}

type AssistantSegment =
  | { kind: 'text'; value: string }
  | { kind: 'canvas'; title: string; value: string };

interface ParsedAssistantMessage {
  thought: string | null;
  segments: AssistantSegment[];
  score: number | null;
  needsFix: boolean;
}

function extractCanvasTitle(attributeString: string): string {
  const titleMatch = attributeString.match(/title=["']([^"']+)["']/i);
  if (titleMatch) return titleMatch[1];
  const typeMatch = attributeString.match(/type=["']([^"']+)["']/i);
  if (typeMatch) return typeMatch[1].replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return 'Canvas';
}

function parseAssistantMessage(content: string): ParsedAssistantMessage {
  let body = content;
  let thought: string | null = null;

  const thinkMatch = body.match(THINK_PATTERN);
  if (thinkMatch) {
    thought = thinkMatch[1].trim();
    body = body.replace(thinkMatch[0], '').trim();
  }

  // Split canvas blocks out of the surrounding prose so each one can render
  // as its own scrollable, independently copyable panel.
  const segments: AssistantSegment[] = [];
  let cursor = 0;
  CANVAS_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = CANVAS_PATTERN.exec(body)) !== null) {
    const preceding = body.slice(cursor, match.index).trim();
    if (preceding) segments.push({ kind: 'text', value: preceding });

    const inner = match[2].trim();
    if (inner) segments.push({ kind: 'canvas', title: extractCanvasTitle(match[1]), value: inner });

    cursor = match.index + match[0].length;
  }

  const trailing = body.slice(cursor).trim();
  if (trailing) segments.push({ kind: 'text', value: trailing });
  if (segments.length === 0) segments.push({ kind: 'text', value: body });

  const scoreMatch =
    body.match(/Overall Score:\s*(\d+(\.\d+)?)\s*\/\s*50/i) ||
    body.match(/Overall Score:\s*(\d+(\.\d+)?)/i);
  const score = scoreMatch ? parseFloat(scoreMatch[1]) : null;

  return { thought, segments, score, needsFix: score !== null && score < 45 };
}

/** Text stripped of every marker, for the clipboard. */
function toPlainText(content: string, role: 'user' | 'assistant'): string {
  if (role === 'user') return parseUserMessage(content).text;
  return parseAssistantMessage(content)
    .segments.map((segment) => segment.value)
    .join('\n\n');
}

const deriveBookTitle = (topic: string) => {
  let t = topic.replace(/^(write|create|generate|make)\s+(an?\s+)?(e-?book|book|guide)\s+(on|about|for)\s+/i, '').trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t.length > 80 ? t.slice(0, 80) + '…' : t;
};

const preprocessMath = (text: string) => {
  if (!text) return text;
  return text.replace(/\\\[/g, '$$$$').replace(/\\\]/g, '$$$$').replace(/\\\(/g, '$').replace(/\\\)/g, '$');
};

/**
 * Empty-state starters. Each one seeds the composer with the opening of a
 * real request and leaves the cursor at the end, so the user finishes the
 * sentence instead of sending a vague prompt that Forge would have to
 * question them about.
 */
const STARTERS: ReadonlyArray<{ label: string; prompt: string }> = [
  { label: 'Grade a hook', prompt: '/grade ' },
  { label: 'Story to post', prompt: 'Turn this into a LinkedIn post: ' },
  { label: 'Write a thread', prompt: '/thread ' },
  { label: 'Write an ebook', prompt: 'Write an ebook about ' },
];

// ============================================================================
// MESSAGE CONTEXT
//
// Cards rendered inside a message (questions, plans) need to know whether the
// conversation has moved past them, and how to send a reply. ReactMarkdown
// renders them through the `code` component, so that information travels by
// context rather than props.
// ============================================================================

interface MessageCardContext {
  answered: boolean;
  disabled: boolean;
  send: (message: string) => void;
  approvePlan: (plan: PlanProposal, items: string[]) => void;
}

const CardContext = createContext<MessageCardContext>({
  answered: true,
  disabled: true,
  send: () => undefined,
  approvePlan: () => undefined,
});

function safeJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function QuestionsMarker({ raw }: { raw: string }) {
  const ctx = useContext(CardContext);
  const payload = safeJson<{ intro: string | null; questions: ClarifyingQuestion[] }>(raw);
  if (!payload || !Array.isArray(payload.questions)) return null;
  return <QuestionsCard intro={payload.intro} questions={payload.questions} answered={ctx.answered} disabled={ctx.disabled} onSubmit={ctx.send} />;
}

function PlanMarker({ raw }: { raw: string }) {
  const ctx = useContext(CardContext);
  const plan = safeJson<PlanProposal>(raw);
  if (!plan || !Array.isArray(plan.items)) return null;
  return <PlanCard plan={plan} answered={ctx.answered} disabled={ctx.disabled} onApprove={ctx.approvePlan} />;
}

// ============================================================================
// GRADER CARD (legacy)
// Messages written before the structured grader carried a ```grader block.
// They still render here; new grades render as GradeReveal.
// ============================================================================

const GraderCard = ({ data }: { data: any }) => {
  const totalScore = data.scores?.reduce((acc: number, curr: any) => acc + curr.score, 0) || 0;

  const getScoreColor = (score: number) => {
    if (score >= 9) return 'bg-emerald-500';
    if (score >= 7) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="bg-[#1c1c1c] border border-[#333] rounded-2xl shadow-sm w-full max-w-full md:max-w-2xl my-6 font-sans overflow-hidden text-white">
      <div className="p-5 md:p-6 border-b border-[#333] bg-[#111]">
        <div className="flex justify-between items-start gap-4 mb-4">
          <div className="inline-flex px-3 py-1 bg-black text-[#ccc] border border-[#333] text-[10px] font-bold tracking-widest uppercase rounded-md shrink-0">
            {data.badge || 'ANALYSIS COMPLETE'}
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold text-white leading-none">
              {totalScore}<span className="text-sm text-[#777] font-medium">/50</span>
            </div>
            <div className="text-[10px] text-[#777] uppercase tracking-wider mt-1 font-semibold">
              Overall Score
            </div>
          </div>
        </div>
        <blockquote className="text-[15px] italic text-[#ccc] leading-relaxed border-l-4 border-[#444] pl-4 break-words whitespace-pre-wrap max-w-full">
          &ldquo;{data.hook}&rdquo;
        </blockquote>
      </div>

      <div className="p-5 md:p-6">
        <div className="text-[11px] font-bold text-[#777] uppercase tracking-wider mb-5 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-blue-500" /> Performance Autopsy
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
          {data.scores?.map((item: any, idx: number) => (
            <div key={idx} className="w-full">
              <div className="flex justify-between text-[12px] font-medium mb-1.5">
                <span className="text-[#a3a3a3] truncate mr-2">{item.label}</span>
                <span className="text-white font-bold shrink-0">{item.score}/10</span>
              </div>
              <div className="w-full bg-[#333] h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ease-out ${getScoreColor(item.score)}`}
                  style={{ width: `${(item.score / 10) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-5 md:p-6 bg-black border-t border-[#333]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {data.replication_pattern && (
            <div>
              <div className="text-[10px] font-bold text-[#777] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-amber-400" /> Replication Pattern
              </div>
              <div className="text-[13px] text-[#a3a3a3] leading-relaxed break-words whitespace-pre-wrap">
                {data.replication_pattern}
              </div>
            </div>
          )}
          <div className={!data.replication_pattern ? "md:col-span-2" : ""}>
            <div className="text-[10px] font-bold text-[#777] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-rose-400" /> Critical Fix
            </div>
            <div className="text-[13px] text-[#a3a3a3] leading-relaxed break-words whitespace-pre-wrap">
              {data.critical_fix}
            </div>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-[#333] flex flex-wrap gap-3 justify-between items-center">
          <span className="text-[11px] text-[#777] uppercase tracking-widest font-semibold">Final Verdict</span>
          <span className={`text-[11px] font-bold tracking-widest uppercase px-3 py-1 rounded-md ${
            data.verdict?.toLowerCase().includes('publish')
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
          }`}>
            {data.verdict}
          </span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// DIRECTION SELECTOR CARD
// Rendered from an ```options fenced block. Choosing one sends its `prompt`
// back as a new user message, so the model receives a complete standalone
// instruction rather than a bare index it would have to resolve from context.
// ============================================================================

interface DirectionOption {
  label: string;
  description?: string;
  prompt: string;
}

const OptionsCard = ({
  question,
  options,
  onSelect,
  disabled,
}: {
  question?: string;
  options: DirectionOption[];
  onSelect: (prompt: string) => void;
  disabled: boolean;
}) => (
  <div className="w-full max-w-full md:max-w-2xl my-6">
    <div className="flex items-center gap-2 mb-3 text-[11px] font-bold text-[#777] uppercase tracking-wider">
      <CornerDownRight className="w-3.5 h-3.5 text-[#d18a5e] shrink-0" />
      {question || 'Choose a direction'}
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {options.map((option, idx) => (
        <button
          key={idx}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(option.prompt)}
          className="group text-left bg-[#141414] border border-[#2a2a2a] hover:border-[#4a2107] hover:bg-[#1a1a1a] rounded-xl p-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-[#2a2a2a] disabled:hover:bg-[#141414]"
        >
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <span className="text-[14px] font-semibold text-white leading-snug">{option.label}</span>
            <span className="text-[#555] group-hover:text-[#d18a5e] transition-colors shrink-0 mt-0.5">
              <Plus className="w-3.5 h-3.5" />
            </span>
          </div>
          {option.description && (
            <p className="text-[12px] text-[#888] leading-relaxed">{option.description}</p>
          )}
        </button>
      ))}
    </div>
  </div>
);

// ============================================================================
// CANVAS BLOCK
// A long deliverable, isolated from surrounding commentary: independently
// scrollable so it cannot flood the transcript, with a copy button that takes
// the deliverable and nothing else.
// ============================================================================

const CanvasBlock = ({ title, content }: { title: string; content: string }) => {
  const [copied, setCopied] = useState(false);

  // Guard against setting state after unmount when the user navigates away
  // inside the two-second confirmation window.
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copyTimeout.current) clearTimeout(copyTimeout.current);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      copyTimeout.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  };

  return (
    <div className="w-full min-w-0 my-5 rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d] overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[#151515] border-b border-[#2a2a2a]">
        <span className="text-[11px] font-bold text-[#999] uppercase tracking-wider truncate">
          {title}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] font-medium text-[#888] hover:text-white transition-colors px-2 py-1.5 rounded-md hover:bg-[#222] shrink-0"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="max-h-[420px] overflow-y-auto custom-scrollbar px-4 sm:px-5 py-4">
        <div className="prose prose-invert prose-sm max-w-none break-words prose-p:leading-relaxed prose-headings:font-semibold prose-a:text-blue-400 prose-a:break-all prose-pre:bg-[#111] prose-pre:border prose-pre:border-[#333] prose-pre:overflow-x-auto prose-table:block prose-table:overflow-x-auto text-[#e0e0e0] text-[14px]">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {preprocessMath(content)}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================


/** One shared empty list, so a chat with no messages keeps a stable identity across renders. */
const NO_MESSAGES: Message[] = [];
export function EditorPane() {
  const {
    setRenderData, user,
    activeSessionId, setActiveSessionId,
    isLiveRenderOpen, toggleLiveRender,
    isSidebarOpen, toggleSidebar,
    activeTool,
    chatHistory,
  } = useAppStore();

  const supabase = createClient();

  const [input, setInput] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [documents, setDocuments] = useState<PendingDocument[]>([]);
  const [quote, setQuote] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEncoding, setIsEncoding] = useState(false);

  // The assistant reply while it streams: text and cards so far, and the
  // progress steps. Null when no turn is running.
  const [live, setLive] = useState<{ content: string; steps: StepState[] } | null>(null);

  // Quota denial state. Held separately from the transcript because hitting a
  // limit is not a conversational event: it should not become a message in
  // the history the model then sees on the next turn.
  const [limitState, setLimitState] = useState<{
    reason: 'window_exceeded' | 'monthly_exceeded' | 'no_profile';
    quota: QuotaSnapshot | null;
    upgradeRequired: boolean;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // The composer grows (a quote, attachments, a wrapped placeholder on a
  // phone), so the conversation reserves exactly its height plus a gap.
  // A fixed padding left the last reply's actions hidden under it.
  const composerRef = useRef<HTMLDivElement>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  useEffect(() => {
    const el = composerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setComposerHeight(Math.ceil(entry.target.getBoundingClientRect().height)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The full placeholder wraps to two lines on a phone; a short one keeps the box compact.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)');
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [showToolHub, setShowToolHub] = useState(false);
  const [selectedModel] = useState(MODELS[0].id);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [sessionGreeting, setSessionGreeting] = useState('');

  // Composer shortcuts: "/" commands and "@" story mentions.
  const [caret, setCaret] = useState(0);
  const [mentions, setMentions] = useState<StoryMention[]>([]);
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);

  // Drag-and-drop. dragDepth counts enter/leave pairs because both fire for
  // every nested child element the cursor crosses; a naive boolean flickers
  // the overlay off the moment the pointer moves over any inner node.
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);

  // Floating "ask about this" affordance for text selected inside a response.
  const [selection, setSelection] = useState<{ text: string; top: number; left: number } | null>(null);

  // Derived through the shared helper. This previously read
  // user.user_metadata.full_name, a field the client user object never
  // carried, so the greeting always showed the email prefix even after the
  // user set a name on the account page.
  const greetingName = useMemo(() => firstName(user), [user]);

  const messages: Message[] = (activeSessionId && chatHistory[activeSessionId]) || NO_MESSAGES;
  const isChatActive = messages.length > 0;
  const activeToolName = activeTool ? (toolById(activeTool)?.name ?? activeTool) : null;
  const hasPendingInput = Boolean(input.trim() || images.length > 0 || documents.length > 0);
  const isBusy = isLoading || isEncoding;

  const commandMatches = useMemo(() => matchSlashCommands(input), [input]);
  const mention = useMemo(() => (commandMatches.length ? null : activeMention(input, caret)), [commandMatches, input, caret]);
  const storySearch = useStorySearch(mention && !menuDismissed ? mention.query : null);
  const menu = menuDismissed
    ? null
    : commandMatches.length > 0
      ? {
          title: 'Commands',
          empty: '',
          loading: false,
          items: commandMatches.map((c) => ({ id: c.name, primary: c.label, secondary: c.description, meta: c.argument })),
        }
      : mention
        ? {
            title: 'Story Bank',
            empty: mention.query ? 'No stories match. Save one with /story.' : 'Your Story Bank is empty. Save one with /story.',
            loading: storySearch.loading,
            items: storySearch.stories.map(storyMenuItem),
          }
        : null;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [input]);

  useEffect(() => {
    // displayName falls back to 'there' when nothing is known about the user.
    if (!greetingName || greetingName.toLowerCase() === 'there') return;
    const hour = new Date().getHours();
    const name = greetingName;
    const timeGreeting =
      hour < 12 ? `Good morning, ${name}` :
      hour < 17 ? `Good afternoon, ${name}` :
                  `Good evening, ${name}`;
    const options = [
      `Hey there, ${name}`,
      `Welcome back, ${name}`,
      `Good to see you, ${name}`,
      timeGreeting,
      `What are we building today, ${name}?`,
      `Ready to create, ${name}?`,
      `The canvas is yours, ${name}`,
      `What's the vision, ${name}?`,
      `Let's forge something great, ${name}`,
      `Ideas loaded, ${name}?`,
    ];
    setSessionGreeting(options[Math.floor(Math.random() * options.length)]);
  }, [greetingName]);

  useEffect(() => {
    async function loadMessages() {
      if (!activeSessionId) return;
      const existing = useAppStore.getState().chatHistory[activeSessionId];
      if (existing && existing.length > 0) return;

      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', activeSessionId)
        .order('created_at', { ascending: true });

      if (data && data.length > 0) {
        useAppStore.getState().setChatHistory(activeSessionId, data.map((d: any) => ({
          id: d.id,
          role: d.role as 'user' | 'assistant',
          content: d.content,
          attachments: d.attachments || undefined
        })));
      }
    }
    loadMessages();
  }, [activeSessionId, supabase]);

  useEffect(() => {
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
  }, [messages, isLoading]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setIsAttachMenuOpen(false);
        setShowToolHub(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ==========================================================================
  // TEXT SELECTION -> QUOTE
  // ==========================================================================

  useEffect(() => {
    function handleSelectionEnd() {
      const activeSelection = window.getSelection();

      if (!activeSelection || activeSelection.isCollapsed || activeSelection.rangeCount === 0) {
        setSelection(null);
        return;
      }

      const text = activeSelection.toString().trim();
      if (text.length < 2) {
        setSelection(null);
        return;
      }

      const range = activeSelection.getRangeAt(0);

      // Only offer the affordance for text inside an assistant response.
      // Selecting your own message, or UI chrome, should do nothing.
      const anchorNode = range.commonAncestorContainer;
      const anchorElement =
        anchorNode.nodeType === Node.ELEMENT_NODE
          ? (anchorNode as Element)
          : anchorNode.parentElement;

      if (!anchorElement || !anchorElement.closest('[data-message-role="assistant"]')) {
        setSelection(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setSelection(null);
        return;
      }

      setSelection({
        text,
        top: rect.top,
        left: rect.left + rect.width / 2,
      });
    }

    document.addEventListener('mouseup', handleSelectionEnd);
    document.addEventListener('touchend', handleSelectionEnd);
    return () => {
      document.removeEventListener('mouseup', handleSelectionEnd);
      document.removeEventListener('touchend', handleSelectionEnd);
    };
  }, []);

  // The popover is absolutely positioned against the viewport, so any scroll
  // would leave it stranded away from the text it points at.
  useEffect(() => {
    if (!selection) return;
    const container = scrollContainerRef.current;
    const dismiss = () => setSelection(null);
    container?.addEventListener('scroll', dismiss, { passive: true });
    window.addEventListener('resize', dismiss);
    return () => {
      container?.removeEventListener('scroll', dismiss);
      window.removeEventListener('resize', dismiss);
    };
  }, [selection]);

  const applyQuote = useCallback((text: string) => {
    setQuote(text);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    textareaRef.current?.focus();
  }, []);

  // ==========================================================================
  // FILE INTAKE (shared by the picker, drag-and-drop, and paste)
  // ==========================================================================

  const ingestFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setIsEncoding(true);
    try {
      const sorted = await sortAndEncodeFiles(files, images.length, documents.length);

      if (sorted.images.length > 0) setImages(prev => [...prev, ...sorted.images]);
      if (sorted.documents.length > 0) setDocuments(prev => [...prev, ...sorted.documents]);

      if (sorted.rejected.length > 0) {
        // One toast for the batch. A per-file toast storm on a bad drop is
        // worse than the failure it is reporting.
        toast.error(
          sorted.rejected.length === 1
            ? sorted.rejected[0]
            : `${sorted.rejected.length} files skipped:\n${sorted.rejected.join('\n')}`,
          { duration: 6000 }
        );
      }

      const accepted = sorted.images.length + sorted.documents.length;
      if (accepted > 0) {
        toast.success(accepted === 1 ? 'File attached' : `${accepted} files attached`);
      }
    } catch {
      toast.error('Something went wrong while reading those files.');
    } finally {
      setIsEncoding(false);
    }
  }, [images.length, documents.length]);

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    // Reset immediately so re-selecting the same file still fires a change event.
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsAttachMenuOpen(false);
    await ingestFiles(files);
  };

  const handleDragEnter = (event: React.DragEvent) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (event: React.DragEvent) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    // Without preventDefault on dragover the browser refuses the drop.
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (event: React.DragEvent) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  };

  const handleDrop = async (event: React.DragEvent) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    await ingestFiles(Array.from(event.dataTransfer.files || []));
  };

  const handlePaste = async (event: React.ClipboardEvent) => {
    const files = Array.from(event.clipboardData?.files || []);
    if (files.length === 0) return;
    event.preventDefault();
    await ingestFiles(files);
  };

  const removeImage = (index: number) => setImages(prev => prev.filter((_, i) => i !== index));
  const removeDocument = (id: string) => setDocuments(prev => prev.filter(doc => doc.id !== id));

  // ==========================================================================
  // MESSAGE ACTIONS
  // ==========================================================================

  const toggleThought = (id: string) => setExpandedThoughts(prev => ({ ...prev, [id]: !prev[id] }));

  const handleCopy = async (content: string, role: 'user' | 'assistant') => {
    try {
      await navigator.clipboard.writeText(toPlainText(content, role));
      toast.success('Copied to clipboard', { style: { background: '#333', color: '#fff' } });
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  };

  const handleShare = async () => {
    if (!activeSessionId) return;

    const { data, error } = await supabase
      .from('chat_sessions')
      .update({ is_public: true })
      .eq('id', activeSessionId)
      .select('share_token')
      .single();

    if (error || !data) {
      toast.error('Failed to generate secure share link.');
      return;
    }

    const shareUrl = `${window.location.origin}/share/${data.share_token}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Secure share link copied!');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  };

  const startEditing = (msg: Message) => {
    setEditingMsgId(msg.id);
    setEditContent(parseUserMessage(msg.content).text);
  };

  // ==========================================================================
  // AI EXECUTION
  // ==========================================================================

  interface ExecuteOptions {
    /** Documents attached to this turn, sent for server-side parsing. */
    pendingDocuments?: PendingDocument[];
    /** Client-side id of the user message, for reconciling augmented content. */
    userMessageId?: string;
    /** Database row id of the user message, for the same reconciliation. */
    userRowId?: string;
    /** Tool for this turn only (a slash command), in place of the selected one. */
    tool?: string | null;
  }

  const executeAI = async (
    historyToProcess: Message[],
    currentSessionId?: string | null,
    options: ExecuteOptions = {}
  ) => {
    const { pendingDocuments = [], userMessageId, userRowId } = options;
    const turnTool = options.tool !== undefined ? options.tool : activeTool;

    // The live reply is built exactly as the server builds the stored one:
    // streamed text plus a marker block for each card. Rendering it with the
    // same renderer means a card never jumps or re-renders differently once
    // the turn is saved.
    let liveContent = '';
    let liveSteps: StepState[] = [];
    const seenDrafts = new Set<string>();
    const publish = () => setLive({ content: liveContent, steps: liveSteps });
    publish();

    const appendAssistant = async (content: string) => {
      if (!currentSessionId) return;
      const currentMsgs = useAppStore.getState().chatHistory[currentSessionId] || [];
      useAppStore.getState().setChatHistory(currentSessionId, [
        ...currentMsgs,
        { id: `${Date.now()}`, role: 'assistant', content },
      ]);
      await supabase.from('chat_messages').insert({ session_id: currentSessionId, role: 'assistant', content });
    };

    try {
      abortControllerRef.current = new AbortController();
      const lastMsg = historyToProcess[historyToProcess.length - 1];
      const currentImages = lastMsg?.attachments || [];
      const lastUserText = lastMsg ? parseUserMessage(lastMsg.content).text : '';

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyToProcess.map(({ role, content }) => ({ role, content })),
          images: currentImages,
          attachments: pendingDocuments.map(toRawAttachment),
          activeTool: turnTool,
          sessionId: currentSessionId ?? null,
        }),
        signal: abortControllerRef.current.signal,
      });

      // Failures before the stream opens arrive as plain JSON.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 402) {
          toast(data.error ?? 'That tool is on a higher plan.', { icon: null });
          return;
        }
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      let finalReply: string | null = null;
      let streamError: Extract<ChatStreamEvent, { type: 'error' }> | null = null;

      await readEventStream(res, (event) => {
        switch (event.type) {
          case 'step': {
            const existing = liveSteps.findIndex((step) => step.id === event.id);
            liveSteps =
              existing >= 0
                ? liveSteps.map((step, i) => (i === existing ? { ...step, state: event.state } : step))
                : [...liveSteps, { id: event.id, label: event.label, state: event.state }];
            break;
          }
          case 'text':
            liveContent += event.delta;
            break;
          case 'draft':
            useDraftStore.getState().upsert(event.draft);
            if (!seenDrafts.has(event.draft.id)) {
              seenDrafts.add(event.draft.id);
              liveContent += markerBlock(MARKER.draft, { id: event.draft.id });
            }
            break;
          case 'questions':
            liveContent += markerBlock(MARKER.questions, { intro: event.intro, questions: event.questions });
            break;
          case 'plan':
            liveContent += markerBlock(MARKER.plan, event.plan);
            break;
          case 'memory':
            liveContent += markerBlock(MARKER.memory, { kind: event.kind, id: event.id, label: event.label });
            break;
          case 'grade':
            liveContent = `${event.text}${markerBlock(MARKER.grade, { grade: event.grade, cardId: event.cardId, hook: lastUserText })}`;
            break;
          case 'done':
            finalReply = event.reply;
            if (event.quota) useAppStore.getState().applyQuotaSnapshot(event.quota as Partial<QuotaSnapshot>);
            if (event.userContent && currentSessionId && userMessageId) {
              const msgs = useAppStore.getState().chatHistory[currentSessionId] || [];
              useAppStore.getState().setChatHistory(
                currentSessionId,
                msgs.map((m: Message) => (m.id === userMessageId ? { ...m, content: event.userContent! } : m))
              );
              if (userRowId) {
                void supabase.from('chat_messages').update({ content: event.userContent }).eq('id', userRowId);
              }
            }
            break;
          case 'error':
            streamError = event;
            break;
        }
        publish();
      });

      const failure = streamError as Extract<ChatStreamEvent, { type: 'error' }> | null;
      if (failure) {
        // Quota denial is a product state, not a failure: shown as a modal
        // with a reset countdown and never written into the transcript.
        if (failure.status === 429) {
          setLimitState({
            reason: (failure.reason as 'window_exceeded' | 'monthly_exceeded' | 'no_profile') ?? 'window_exceeded',
            quota: (failure.quota as QuotaSnapshot) ?? null,
            upgradeRequired: Boolean(failure.upgradeRequired),
          });
          return;
        }
        // Keep whatever was written before the failure, then the reason.
        const partial = liveContent.trim();
        await appendAssistant(partial ? `${partial}\n\n*${failure.message}*` : failure.message);
        return;
      }

      if (finalReply !== null) await appendAssistant(finalReply);
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        const partial = liveContent.trim();
        await appendAssistant(partial ? `${partial}\n\n*Stopped.*` : '*Stopped.*');
        return;
      }
      await appendAssistant(friendlyChatError(error?.message ?? ''));
    } finally {
      setLive(null);
      setIsLoading(false);
    }
  };

  /**
   * Single path for getting a new user message into the session, the store,
   * the database, and the model. Typing, choosing a direction, and auto-fix
   * all funnel through here so none of them can drift apart.
   */
  const dispatchMessage = async (
    content: string,
    attachedImages: string[] = [],
    attachedDocuments: PendingDocument[] = [],
    turn: { ebookChapters?: string[]; ebookTopic?: string; tool?: string | null } = {}
  ) => {
    // Read from the store, not the render closure: a compose request from
    // another view can change the session and tool in the same tick.
    const latest = useAppStore.getState();
    const turnTool = turn.tool !== undefined ? turn.tool : latest.activeTool;
    let currentSessionId = latest.activeSessionId;

    if (!currentSessionId) {
      const { data: sessionData } = await supabase
        .from('chat_sessions')
        .insert({ user_id: user?.id, title: 'New chat', workspace_id: useWorkspaceStore.getState().activeId })
        .select().single();
      if (sessionData) {
        currentSessionId = sessionData.id;
        setActiveSessionId(sessionData.id);
      }
    }

    const msgs = currentSessionId ? (useAppStore.getState().chatHistory[currentSessionId] || []) : [];

    if (msgs.length === 0 && currentSessionId) {
      const typed = parseUserMessage(content).text;
      const newTitle = typed
        ? typed.substring(0, 30) + (typed.length > 30 ? '...' : '')
        : 'Document Analysis';
      await supabase.from('chat_sessions').update({ title: newTitle }).eq('id', currentSessionId);
      window.dispatchEvent(new Event('refresh-sidebar'));
    }

    const messageId = Date.now().toString();
    const newMessage: Message = {
      id: messageId,
      role: 'user',
      content,
      attachments: attachedImages.length > 0 ? attachedImages : undefined
    };

    const newHistory = [...msgs, newMessage];
    if (currentSessionId) useAppStore.getState().setChatHistory(currentSessionId, newHistory);

    setIsLoading(true);

    let userRowId: string | undefined;
    if (currentSessionId) {
      const { data: inserted } = await supabase
        .from('chat_messages')
        .insert({
          session_id: currentSessionId,
          role: 'user',
          content,
          attachments: newMessage.attachments ? newMessage.attachments : null
        })
        .select('id')
        .single();
      userRowId = inserted?.id;
    }

    if (turn.ebookChapters && turn.ebookChapters.length > 0) {
      await handleEbookGeneration(turn.ebookTopic ?? content, currentSessionId as string, turn.ebookChapters);
      return;
    }

    if (turnTool === 'ebook_writer') {
      await handleEbookGeneration(content, currentSessionId as string);
      return;
    }

    await executeAI(newHistory, currentSessionId, {
      pendingDocuments: attachedDocuments,
      userMessageId: messageId,
      userRowId,
      tool: turnTool,
    });
  };

  const submitEdit = async (msgId: string) => {
    if (!activeSessionId || !editContent.trim()) return;
    const msgs = chatHistory[activeSessionId] || [];
    const msgIndex = msgs.findIndex((m: Message) => m.id === msgId);
    if (msgIndex === -1) return;

    const updatedMsg = { ...msgs[msgIndex], content: editContent };
    const historyToProcess = [...msgs.slice(0, msgIndex), updatedMsg];

    useAppStore.getState().setChatHistory(activeSessionId, historyToProcess);
    setEditingMsgId(null);
    setIsLoading(true);
    await executeAI(historyToProcess, activeSessionId);
  };

  const handleRegenerate = async (msgId: string) => {
    if (!activeSessionId) return;
    const msgs = chatHistory[activeSessionId] || [];
    const msgIndex = msgs.findIndex((m: Message) => m.id === msgId);
    if (msgIndex === -1) return;

    const historyToProcess = msgs.slice(0, msgIndex);
    useAppStore.getState().setChatHistory(activeSessionId, historyToProcess);
    setIsLoading(true);
    await executeAI(historyToProcess, activeSessionId);
  };

  const handleAutoFix = async (originalScore: number | null) => {
    if (originalScore === null || isBusy) return;
    await dispatchMessage(
      `You scored the previous input a ${originalScore}. Apply your own critical fixes and generate a new version that guarantees a 45+ score. Do not explain, just execute the fix.`
    );
  };

  const handleDirectionSelect = async (prompt: string) => {
    if (isBusy) return;
    await dispatchMessage(prompt);
  };

  /**
   * An approved plan is sent back as a message, so the model writes to the
   * agreed outline. An approved ebook outline goes straight to the ebook
   * writer with those chapters, skipping its own outline step.
   */
  const handlePlanApproval = async (plan: PlanProposal, items: string[]) => {
    if (isBusy || items.length === 0) return;
    const message = formatApprovedPlan(plan, items);
    if (plan.kind === 'ebook') {
      await dispatchMessage(message, [], [], { ebookChapters: items, ebookTopic: plan.title });
      return;
    }
    await dispatchMessage(message);
  };

  const handleEbookGeneration = async (topic: string, sessionId: string, approvedChapters?: string[]) => {
    // Declared outside the try so the catch handler can report failures into
    // the transcript, not just a toast that vanishes.
    const updateChat = (text: string) => {
      const msgs = useAppStore.getState().chatHistory[sessionId] || [];
      useAppStore.getState().setChatHistory(sessionId, [
        ...msgs,
        { id: Date.now().toString(), role: 'assistant' as const, content: text }
      ]);
    };

    try {
      setIsLoading(true);
      abortControllerRef.current = new AbortController();
      const activeProvider = MODELS.find(m => m.id === selectedModel)?.provider || 'anthropic';

      let chapters: string[] = approvedChapters ?? [];

      if (chapters.length === 0) {
        updateChat(`*Outlining "${topic}"*`);

        const outRes = await fetch('/api/ebook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 'outline', topic, provider: activeProvider }),
          signal: abortControllerRef.current.signal
        });
        const outlineData = await outRes.json();

        // Ebook generation is quota-gated too. Without this branch a denial
        // mid-book surfaces as a raw error string in the transcript, which is
        // the exact behaviour the modal exists to replace.
        if (outRes.status === 429) {
          setLimitState({
            reason: outlineData.reason ?? 'monthly_exceeded',
            quota: outlineData.quota ?? null,
            upgradeRequired: Boolean(outlineData.upgradeRequired),
          });
          setIsLoading(false);
          return;
        }

        if (!outRes.ok) throw new Error(outlineData.error || 'Could not outline the book.');
        chapters = Array.isArray(outlineData.chapters) ? outlineData.chapters : [];
      }
      if (chapters.length === 0) throw new Error('The outline came back empty.');

      let compiledBook = "";

      for (let i = 0; i < chapters.length; i++) {
        const chapTitle = chapters[i];
        updateChat(`*Writing chapter ${i + 1} of ${chapters.length}: ${chapTitle}*`);
        const chapRes = await fetch('/api/ebook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 'chapter', topic, chapterTitle: chapTitle, outline: chapters, provider: activeProvider }),
          signal: abortControllerRef.current.signal
        });
        const chapterData = await chapRes.json();

        if (chapRes.status === 429) {
          setLimitState({
            reason: chapterData.reason ?? 'monthly_exceeded',
            quota: chapterData.quota ?? null,
            upgradeRequired: Boolean(chapterData.upgradeRequired),
          });
          setIsLoading(false);
          return;
        }

        if (!chapRes.ok) {
          throw new Error(chapterData.error || `Chapter ${i + 1} failed to generate.`);
        }
        compiledBook += `## ${chapTitle}\n\n${chapterData.content}\n\n---\n\n`;
      }

      const bookTitle = deriveBookTitle(topic);
      const finalBook = `# ${bookTitle}\n\n${compiledBook}`;

      await supabase.from('ebooks').insert({
        user_id: user?.id,
        session_id: sessionId,
        title: bookTitle,
        content: compiledBook,
        word_count: compiledBook.split(/\s+/).length,
      });

      const displayPayload = `*"${bookTitle}" is ready. It is open in the preview panel and saved in My Ebooks.*`;
      updateChat(displayPayload);
      await supabase.from('chat_messages').insert({ session_id: sessionId, role: 'assistant', content: displayPayload });
      if (setRenderData) setRenderData(finalBook, 'ebook');
    } catch (error: any) {
      if (error.name === 'AbortError') {
        const msgs = useAppStore.getState().chatHistory[sessionId] || [];
        useAppStore.getState().setChatHistory(sessionId, [
          ...msgs,
          { id: Date.now().toString(), role: 'assistant', content: `*Ebook generation stopped.*` }
        ]);
        return;
      }
      const reason = friendlyChatError(error?.message ?? '');
      toast.error(reason);
      updateChat(reason);
    } finally {
      setIsLoading(false);
    }
  };

  const syncCaret = (el: HTMLTextAreaElement) => setCaret(el.selectionStart ?? el.value.length);

  const placeCaret = (position: number) => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(position, position);
      setCaret(position);
    });
  };

  const pickMenuItem = (index: number) => {
    if (commandMatches.length > 0) {
      const command = commandMatches[index];
      if (!command) return;
      const next = `${command.label} `;
      setInput(next);
      placeCaret(next.length);
    } else if (mention) {
      const story = storySearch.stories[index];
      if (!story) return;
      const result = insertMention(input, mention.start, caret, story);
      setInput(result.text);
      setMentions((prev) => (prev.some((m) => m.id === story.id) ? prev : [...prev, { id: story.id, title: story.title, body: story.body }]));
      placeCaret(result.caret);
    }
    setMenuIndex(0);
  };

  /** Arrow keys, Enter and Tab drive the menu while it is open. */
  const handleMenuKey = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!menu) return false;
    const count = menu.items.length;
    if (e.key === 'Escape') {
      e.preventDefault();
      setMenuDismissed(true);
      return true;
    }
    if (count === 0) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setMenuIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : count - 1)) % count);
      return true;
    }
    if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
      e.preventDefault();
      pickMenuItem(Math.min(menuIndex, count - 1));
      return true;
    }
    return false;
  };

  const handleSend = async () => {
    if (!hasPendingInput || isBusy) return;

    let typed = input.trim();
    let tool: string | undefined;
    const command = resolveSlashCommand(typed);
    if (command) {
      if (!command.argument) {
        toast(`Add ${command.command.argument} after ${command.command.label}.`, { icon: null });
        return;
      }
      typed = command.command.expand(command.argument);
      tool = command.command.tool;
    }
    typed = attachMentionedStories(typed, mentions).text;

    const content = quote
      ? `[QUOTED FROM YOUR PREVIOUS RESPONSE]\n${quote}\n[/QUOTED]\n${typed}`
      : typed;

    const outgoingImages = images;
    const outgoingDocuments = documents;

    // Clear the composer before the await so a slow network cannot leave the
    // user staring at their own message still sitting in the input.
    setInput('');
    setImages([]);
    setDocuments([]);
    setQuote(null);
    setMentions([]);

    await dispatchMessage(content, outgoingImages, outgoingDocuments, tool ? { tool } : {});
  };

  // Requests from other views ("Write about this", Cmd+K) to start in chat.
  // Held in a ref so the listener always sees current state without
  // re-subscribing on every render.
  const composeRef = useRef<(detail: ComposeDetail) => void>(() => undefined);
  composeRef.current = (detail: ComposeDetail) => {
    if (detail.send && !isBusy) {
      void dispatchMessage(detail.text, [], [], detail.tool !== undefined ? { tool: detail.tool } : {});
      return;
    }
    setInput(detail.text);
    placeCaret(detail.text.length);
  };

  useEffect(() => {
    const run = () => {
      const detail = takePendingCompose();
      if (detail) composeRef.current(detail);
    };
    run();
    window.addEventListener(COMPOSE_EVENT, run);
    return () => window.removeEventListener(COMPOSE_EVENT, run);
  }, []);

  // ==========================================================================
  // MARKDOWN RENDERING
  // ==========================================================================

  const renderCodeBlock = useCallback((props: any) => {
    const { children, className, node, ...rest } = props;
    // [\w-]: marker languages contain a hyphen (forge-draft).
    const match = /language-([\w-]+)/.exec(className || '');
    const isInline = !match && !className?.includes('language-');

    if (isInline) {
      return (
        <code className="bg-[#1e1e1e] border border-[#333] px-1.5 py-0.5 rounded text-[13px] text-[#ffc4a3] break-words" {...rest}>
          {children}
        </code>
      );
    }

    const language = match?.[1]?.toLowerCase() || 'code';
    const rawText = (Array.isArray(children) ? children.join('') : String(children)).replace(/\n$/, '');

    // Rich content persisted as marker blocks (see lib/forge/types MARKER).
    if (language === MARKER.draft) {
      const id = safeJson<{ id?: string }>(rawText)?.id;
      return id ? <DraftCardById id={id} /> : null;
    }
    if (language === MARKER.questions) return <QuestionsMarker raw={rawText} />;
    if (language === MARKER.plan) return <PlanMarker raw={rawText} />;
    if (language === MARKER.memory) {
      const memory = safeJson<{ kind: 'rule' | 'story'; id: string; label: string }>(rawText);
      return memory ? <MemoryChip kind={memory.kind} id={memory.id} label={memory.label} /> : null;
    }
    if (language === MARKER.grade) {
      const payload = safeJson<{ grade: Grade; cardId: string | null; hook: string }>(rawText);
      return payload ? <GradeReveal grade={payload.grade} cardId={payload.cardId} hook={payload.hook} /> : null;
    }

    if (language === 'grader') {
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        let cleanText = jsonMatch ? jsonMatch[0] : rawText;
        cleanText = cleanText.replace(/,\s*([\}\]])/g, '$1');
        return <GraderCard data={JSON.parse(cleanText)} />;
      } catch (e) {
        console.error('Grader card parse error:', e);
      }
    }

    if (language === 'options') {
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        let cleanText = jsonMatch ? jsonMatch[0] : rawText;
        cleanText = cleanText.replace(/,\s*([\}\]])/g, '$1');
        const parsed = JSON.parse(cleanText);
        const parsedOptions: DirectionOption[] = Array.isArray(parsed.options)
          ? parsed.options.filter((o: any) => o && typeof o.label === 'string' && typeof o.prompt === 'string')
          : [];

        if (parsedOptions.length >= 2) {
          return (
            <OptionsCard
              question={typeof parsed.question === 'string' ? parsed.question : undefined}
              options={parsedOptions}
              onSelect={handleDirectionSelect}
              disabled={isBusy}
            />
          );
        }
      } catch (e) {
        console.error('Options card parse error:', e);
      }
    }

    return (
      <div className="bg-[#1e1e1e] rounded-xl overflow-hidden my-4 border border-[#333] shadow-sm w-full max-w-full min-w-0">
        <div className="bg-[#2a2a2a] px-4 py-2 text-[11px] text-[#888] font-semibold uppercase tracking-wider flex justify-between items-center gap-3">
          <span className="truncate">{language}</span>
          {(language === 'grader' || language === 'options') && (
            <span className="text-rose-400 font-medium normal-case flex items-center gap-1.5 shrink-0">
              <AlertTriangle className="w-3 h-3" /> Syntax Error
            </span>
          )}
        </div>
        <pre className="p-4 overflow-x-auto custom-scrollbar">
          <code className="text-[13px] text-[#e0e0e0] font-mono leading-relaxed" {...rest}>
            {rawText}
          </code>
        </pre>
      </div>
    );
    // handleDirectionSelect is stable enough for this purpose; isBusy is the
    // value that must stay current so option buttons disable mid-generation.
  }, [isBusy]); // eslint-disable-line react-hooks/exhaustive-deps

  const markdownComponents = useMemo(
    () => ({
      code: renderCodeBlock,
      // Fenced blocks render their own containers (code panels and cards), so
      // the default <pre> wrapper would only nest a card inside a <pre>.
      pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    }),
    [renderCodeBlock]
  );

  const renderAssistantSegments = (content: string) =>
    parseAssistantMessage(content).segments.map((segment, idx) =>
      segment.kind === 'canvas' ? (
        <CanvasBlock key={idx} title={segment.title} content={segment.value} />
      ) : (
        <div
          key={idx}
          className="prose prose-invert prose-sm max-w-none min-w-0 break-words text-[15.5px] prose-p:leading-relaxed prose-headings:font-semibold prose-headings:tracking-[-0.01em] prose-a:text-forge-gold prose-a:break-all prose-strong:text-white prose-table:block prose-table:overflow-x-auto"
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={markdownComponents}
          >
            {preprocessMath(segment.value)}
          </ReactMarkdown>
        </div>
      )
    );

  const sendFromCard = useCallback(
    (message: string) => {
      if (isBusy) return;
      void dispatchMessage(message);
    },
    // dispatchMessage closes over current state; isBusy gates re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isBusy, activeSessionId, activeTool]
  );

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div
      className="absolute inset-0 bg-[#000000] text-white font-sans overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >

      <LimitReachedModal
        open={limitState !== null}
        onClose={() => setLimitState(null)}
        reason={limitState?.reason ?? null}
        quota={limitState?.quota ?? null}
        upgradeRequired={limitState?.upgradeRequired}
      />

      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[1200px] pointer-events-none z-0 transition-opacity duration-700 ${!isChatActive ? 'opacity-100' : 'opacity-0'}`}
        style={{ background: 'radial-gradient(circle at 50% 50%, rgba(210, 85, 20, 0.28) 0%, rgba(130, 45, 5, 0.15) 25%, rgba(0, 0, 0, 0) 50%)' }}
      />

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept={ACCEPT_ATTRIBUTE}
        multiple
        className="hidden"
      />

      {/* Drop target overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-none animate-in fade-in duration-150">
          <div className="flex flex-col items-center gap-4 px-8 sm:px-12 py-10 rounded-3xl border-2 border-dashed border-[#d18a5e]/60 bg-[#111]/90">
            <UploadCloud className="w-10 h-10 text-[#d18a5e]" />
            <div className="text-center">
              <p className="text-[16px] font-semibold text-white mb-1">Drop to attach</p>
              <p className="text-[12px] text-[#888]">
                PDF, Word, Excel, CSV, Markdown, text, and images
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Selection-to-quote affordance */}
      {selection && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyQuote(selection.text)}
          style={{
            position: 'fixed',
            top: Math.max(8, selection.top - 44),
            left: selection.left,
            transform: 'translateX(-50%)',
          }}
          className="z-[70] flex items-center gap-2 px-3 py-2 rounded-full bg-[#1c1c1c] border border-[#3d3d3d] shadow-[0_8px_24px_rgba(0,0,0,0.7)] text-[12px] font-medium text-white hover:border-[#d18a5e] hover:bg-[#242424] transition-colors animate-in fade-in zoom-in-95 duration-100"
        >
          <Quote className="w-3.5 h-3.5 text-[#d18a5e]" />
          Ask about this
        </button>
      )}

      {/* On a phone the floating buttons sit over the conversation; a fade keeps text from showing through them. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-30 h-20 bg-gradient-to-b from-black via-black/85 to-transparent md:hidden" />
      <div className="absolute top-4 left-4 right-4 z-40 flex justify-between items-center pointer-events-none">
        <div className="pointer-events-auto">
          {/*
            Always rendered on mobile, where the sidebar is an overlay that
            covers this button when open. Gating it on !isSidebarOpen (correct
            for desktop, where the sidebar is a sibling column) left phone
            users with no way to reach navigation once the drawer had been
            dismissed.
          */}
          <button
            onClick={() => toggleSidebar()}
            className={`p-2.5 bg-[#1c1c1c] border border-[#333] shadow-sm rounded-full text-[#888] hover:text-white transition-colors ${
              isSidebarOpen ? 'md:hidden' : ''
            }`}
            title="Open navigation"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </div>
        <div className="pointer-events-auto">
          <button
            onClick={() => toggleLiveRender()}
            className="p-2.5 bg-[#1c1c1c] border border-[#333] shadow-sm rounded-full text-[#888] hover:text-white transition-colors"
            title={isLiveRenderOpen ? 'Hide canvas' : 'Show canvas'}
          >
            {isLiveRenderOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="absolute inset-0 z-10 overflow-y-auto overflow-x-hidden custom-scrollbar pt-20 pb-[190px] md:pb-[220px] flex flex-col"
        style={composerHeight ? { paddingBottom: composerHeight + 32 } : undefined}
      >

        {!isChatActive ? (
          <div className="flex-1 flex flex-col items-center justify-center w-full min-h-full px-4 animate-in fade-in duration-500">
            <h1 className="text-[26px] sm:text-[28px] md:text-[40px] font-normal text-[#f5f5f5] tracking-tight mb-8 text-center px-2 break-words">
              {sessionGreeting || (greetingName.toLowerCase() === 'there' ? 'What are we writing today?' : `Hey there, ${greetingName}`)}
            </h1>
          </div>
        ) : (
          <div className="flex-1 flex flex-col w-full min-h-full min-w-0">
            <div className="flex-1 min-h-0" />
            <div ref={transcriptRef} className="max-w-3xl mx-auto w-full min-w-0 px-3 md:px-0 space-y-8 md:space-y-10 pb-12">
              {messages.map((msg: Message, msgIndex: number) => {
                const isUser = msg.role === 'user';
                const cardContext: MessageCardContext = {
                  answered: msgIndex < messages.length - 1,
                  disabled: isBusy,
                  send: sendFromCard,
                  approvePlan: handlePlanApproval,
                };
                const answers = isUser ? parseAnswers(msg.content) : null;
                const approvedPlan = isUser ? parseApprovedPlan(msg.content) : null;
                const parsedUser = isUser ? parseUserMessage(msg.content) : null;
                const parsedAssistant = !isUser ? parseAssistantMessage(msg.content) : null;
                const isExpanded = expandedThoughts[msg.id];
                const isEditing = editingMsgId === msg.id;

                return (
                  <div key={msg.id} className={`group/msg flex gap-3 sm:gap-4 min-w-0 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                      isUser ? 'bg-[#1c1c1c] text-[#888] border border-[#333]' : 'bg-transparent text-white'
                    }`}>
                      {isUser ? <UserIcon className="w-4 h-4" /> : <Aperture className="w-5 h-5 text-[#d18a5e]" />}
                    </div>

                    <div className={`flex flex-col max-w-[92%] md:max-w-[85%] min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>

                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-2 max-w-[300px] justify-end">
                          {msg.attachments.map((imgBase64: string, idx: number) => (
                            <div key={idx} className="rounded-2xl overflow-hidden border border-[#333] w-20 h-20 shadow-sm">
                              <img src={imgBase64} alt="Attachment" className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      )}

                      {parsedUser && parsedUser.files.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-2 justify-end">
                          {parsedUser.files.map((file, idx) => (
                            <div
                              key={idx}
                              className={`inline-flex items-center gap-2 py-1.5 px-3 rounded-xl border text-[12px] font-medium ${
                                file.error
                                  ? 'bg-rose-500/5 border-rose-500/30 text-rose-300'
                                  : 'bg-[#1c1c1c] border-[#333] text-white'
                              }`}
                              title={file.error ? `Failed: ${file.error}` : file.name}
                            >
                              {file.error
                                ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                : <FileText className="w-3.5 h-3.5 text-[#d18a5e] shrink-0" />}
                              <span className="max-w-[160px] truncate">{file.name}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {parsedUser && parsedUser.stories.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-2 justify-end">
                          {parsedUser.stories.map((title) => (
                            <span
                              key={title}
                              className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] py-1 pl-2.5 pr-3 text-[12px] text-white/80"
                              title="From your Story Bank"
                            >
                              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-forge-ember" />
                              <span className="max-w-[200px] truncate">{title}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {parsedUser?.quote && (
                        <div className="mb-2 w-full max-w-[520px] min-w-0 border-l-2 border-[#d18a5e]/60 bg-[#0f0f0f] rounded-r-lg pl-3 pr-4 py-2">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#d18a5e]/80 mb-1">
                            <Quote className="w-3 h-3" /> Quoted
                          </div>
                          <p className="text-[13px] text-[#999] leading-relaxed line-clamp-4 whitespace-pre-wrap break-words">
                            {parsedUser.quote}
                          </p>
                        </div>
                      )}

                      {parsedAssistant?.thought && (
                        <div className="w-full mb-2">
                          <button
                            onClick={() => toggleThought(msg.id)}
                            className="flex items-center gap-2 text-[13px] font-medium text-[#777] hover:text-[#aaa] transition-colors py-1.5 group"
                          >
                            <span className={`w-4 h-4 rounded-full border border-[#444] flex items-center justify-center transition-colors shrink-0 ${isExpanded ? 'bg-[#222]' : ''}`}>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </span>
                            {isExpanded ? 'Hide thinking process' : 'View thinking process'}
                          </button>

                          {isExpanded && (
                            <div className="mt-3 mb-2 pl-4 border-l-2 border-[#333] text-[14px] text-[#888] font-sans whitespace-pre-wrap break-words leading-relaxed animate-in slide-in-from-top-1 fade-in duration-200">
                              {parsedAssistant.thought}
                            </div>
                          )}
                        </div>
                      )}

                      {isEditing ? (
                        <div className="bg-[#1c1c1c] border border-[#333] rounded-2xl p-4 w-full md:min-w-[400px]">
                          {/*
                            16px on mobile. iOS Safari zooms the page in when a
                            focused input is below 16px and never zooms back
                            out, which leaves the layout looking broken for the
                            rest of the session.
                          */}
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full bg-transparent text-[#e0e0e0] text-[16px] md:text-[15px] outline-none resize-none min-h-[80px] custom-scrollbar"
                          />
                          <div className="flex justify-end gap-3 mt-3">
                            <button onClick={() => setEditingMsgId(null)} className="px-4 py-2 rounded-full text-[13px] font-medium bg-[#2a2a2a] hover:bg-[#333] text-white transition-colors">Cancel</button>
                            <button onClick={() => submitEdit(msg.id)} className="px-4 py-2 rounded-full text-[13px] font-medium bg-white text-black hover:bg-gray-200 transition-colors">Send</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div
                            data-message-role={msg.role}
                            className={`text-[15px] leading-relaxed font-sans w-full min-w-0 ${
                              isUser
                                ? 'bg-[#1c1c1c] text-white px-5 py-3.5 rounded-3xl rounded-tr-sm border border-[#333] whitespace-pre-wrap break-words w-auto'
                                : 'text-[#e0e0e0]'
                            }`}
                          >
                            {isUser ? (
                              answers ? (
                                <span className="flex flex-col gap-1.5">
                                  {answers.map((pair, i) => (
                                    <span key={i} className="block">
                                      <span className="text-white/45">{pair.question} </span>
                                      {pair.answer}
                                    </span>
                                  ))}
                                </span>
                              ) : approvedPlan ? (
                                <span>
                                  Approved the plan for <span className="font-medium">{approvedPlan.title}</span> ({approvedPlan.items.length} {approvedPlan.items.length === 1 ? 'item' : 'items'})
                                </span>
                              ) : (
                                parsedUser?.text
                              )
                            ) : (
                              <CardContext.Provider value={cardContext}>{renderAssistantSegments(msg.content)}</CardContext.Provider>
                            )}
                          </div>

                          <div className={`flex items-center gap-4 mt-3 text-[#666] opacity-100 md:opacity-0 md:group-hover/msg:opacity-100 transition-opacity duration-200 ${isUser ? 'justify-end pr-2' : 'justify-start pl-2'}`}>
                            <button onClick={() => handleCopy(msg.content, msg.role)} className="hover:text-white transition-colors p-1.5 -m-0.5" title="Copy">
                              <Copy className="w-[15px] h-[15px]" />
                            </button>
                            {isUser ? (
                              <button onClick={() => startEditing(msg)} className="hover:text-white transition-colors p-1.5 -m-0.5" title="Edit">
                                <Edit2 className="w-[15px] h-[15px]" />
                              </button>
                            ) : (
                              <>
                                <button onClick={handleShare} className="hover:text-white transition-colors p-1.5 -m-0.5" title="Share">
                                  <Upload className="w-[15px] h-[15px]" />
                                </button>
                                <button onClick={() => handleRegenerate(msg.id)} className="hover:text-white transition-colors p-1.5 -m-0.5" title="Regenerate">
                                  <RefreshCw className="w-[15px] h-[15px]" />
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}

                      {parsedAssistant?.needsFix && !isEditing && (
                        <button
                          onClick={() => handleAutoFix(parsedAssistant.score)}
                          disabled={isBusy}
                          className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-[#1c1c1c] text-white hover:bg-[#2a2a2a] border border-[#333] rounded-full text-[12px] font-semibold transition-all shadow-sm disabled:opacity-50"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Auto-Fix to 45+
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex gap-3 sm:gap-4 min-w-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                    <Aperture className="w-5 h-5 text-[#d18a5e] animate-[spin_3s_linear_infinite]" />
                  </div>
                  <div className="flex flex-col min-w-0 max-w-[92%] md:max-w-[85%] flex-1 pt-1" data-message-role="assistant">
                    <ProgressSteps steps={live?.steps ?? [{ id: 'start', label: 'Starting', state: 'active' }]} />
                    {live && live.content.trim() && (
                      <div className="text-[#e0e0e0]">
                        <CardContext.Provider value={{ answered: false, disabled: true, send: sendFromCard, approvePlan: handlePlanApproval }}>
                          {renderAssistantSegments(live.content)}
                        </CardContext.Provider>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          </div>
        )}
      </div>

      <div ref={composerRef} className="absolute bottom-0 left-0 right-0 z-40 w-full flex flex-col items-center bg-[#000000] pt-4 px-3 md:px-0 border-t border-[#111]"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="w-full max-w-[720px] mx-auto relative">

          {quote && (
            <div className="mb-3 flex items-start gap-3 bg-[#101010] border border-[#2a2a2a] rounded-xl px-4 py-3">
              <Quote className="w-4 h-4 text-[#d18a5e] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#666] mb-1">
                  Asking about
                </div>
                <p className="text-[13px] text-[#aaa] leading-relaxed line-clamp-3 whitespace-pre-wrap break-words">
                  {quote}
                </p>
              </div>
              <button
                onClick={() => setQuote(null)}
                className="text-[#666] hover:text-white transition-colors shrink-0 p-1.5 -m-0.5"
                title="Remove quote"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-3 sm:gap-4 w-full min-w-0">
            {!isChatActive && (
              <button
                className="w-[54px] h-[54px] rounded-full flex items-center justify-center shrink-0 shadow-sm border border-[#3d3d3d] hover:border-[#555] transition-colors"
                style={{ background: 'linear-gradient(135deg, #2e2e2e 0%, #151515 100%)' }}
                onClick={() => setIsAttachMenuOpen(!isAttachMenuOpen)}
              >
                <Plus className={`w-6 h-6 text-[#999] transition-transform duration-200 ${isAttachMenuOpen ? 'rotate-45' : 'rotate-0'}`} />
              </button>
            )}

            <div className={`flex-1 min-w-0 relative flex items-end bg-[#1c1c1c] border shadow-[inset_0_2px_6px_rgba(0,0,0,0.2)] transition-colors focus-within:border-[#555] ${
              isDragging ? 'border-[#d18a5e]' : 'border-[#333]'
            } ${isChatActive ? 'rounded-[28px] min-h-[56px] pl-2 pr-2' : 'rounded-[28px] min-h-[56px] pl-4 sm:pl-6 pr-2'}`}>

              {menu && (
                <ComposerMenu
                  title={menu.title}
                  items={menu.items}
                  activeIndex={Math.min(menuIndex, Math.max(menu.items.length - 1, 0))}
                  loading={menu.loading}
                  empty={menu.empty}
                  onPick={pickMenuItem}
                  onHover={setMenuIndex}
                />
              )}

              {!menu && (images.length > 0 || documents.length > 0) && (
                <div className="absolute bottom-full left-0 right-0 mb-3 flex gap-2 flex-wrap z-50">
                  {images.map((img: string, idx: number) => (
                    <div key={`img-${idx}`} className="relative inline-block group shrink-0">
                      <div className="w-14 h-14 rounded-xl overflow-hidden shadow-sm border border-[#333]">
                        <img src={img} alt="Preview" className="w-full h-full object-cover" />
                      </div>
                      {/*
                        Always visible on touch. opacity-0 group-hover reveals
                        nothing on a phone, so there was no way to remove an
                        attachment once it had been added.
                      */}
                      <button
                        onClick={() => removeImage(idx)}
                        className="absolute -top-2 -right-2 bg-black text-white p-1 rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity border border-[#333]"
                        aria-label="Remove image"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {documents.map((doc) => (
                    <div key={doc.id} className="relative inline-flex items-center gap-2 bg-[#1c1c1c] border border-[#333] py-1.5 px-3 rounded-xl shadow-sm shrink-0 group">
                      <FileText className="w-4 h-4 text-[#d18a5e] shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-[12px] font-medium text-white max-w-[140px] truncate leading-tight">
                          {doc.name}
                        </span>
                        <span className="text-[10px] text-[#666] leading-tight">{formatBytes(doc.size)}</span>
                      </div>
                      <button
                        onClick={() => removeDocument(doc.id)}
                        className="absolute -top-2 -right-2 bg-black text-white p-1 rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity border border-[#333]"
                        aria-label="Remove document"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {isChatActive && (
                <button
                  onClick={() => setIsAttachMenuOpen(!isAttachMenuOpen)}
                  className="w-[40px] h-[40px] mb-2 flex items-center justify-center text-[#888] hover:text-white transition-colors shrink-0"
                  aria-label="Attach or choose a tool"
                >
                  <Plus className={`w-6 h-6 transition-transform duration-200 ${isAttachMenuOpen ? 'rotate-45' : 'rotate-0'}`} />
                </button>
              )}

              {activeToolName && (
                <button
                  type="button"
                  onClick={() => useAppStore.getState().setActiveTool(null)}
                  title={`${activeToolName}. Click to turn off.`}
                  className="group/tool mb-2.5 mr-2 flex h-8 max-w-[160px] shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.05] pl-3 pr-2 text-[12.5px] font-medium text-white"
                >
                  <span className="truncate">{activeToolName}</span>
                  <X className="h-3 w-3 shrink-0 text-white/40 group-hover/tool:text-white" aria-hidden />
                </button>
              )}

              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  syncCaret(e.target);
                  setMenuDismissed(false);
                  setMenuIndex(0);
                }}
                onSelect={(e) => syncCaret(e.currentTarget)}
                onBlur={() => setMenuDismissed(true)}
                onFocus={() => setMenuDismissed(false)}
                onPaste={handlePaste}
                aria-autocomplete="list"
                onKeyDown={(e) => {
                  if (handleMenuKey(e)) return;
                  // Send on Enter only with a hardware keyboard. See
                  // isHardwareKeyboard above for why.
                  if (e.key === 'Enter' && !e.shiftKey && isHardwareKeyboard()) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={isEncoding ? 'Reading files...' : narrow ? 'Ask Forge, or type /' : 'Ask Forge, / for commands, @ for a story'}
                rows={1}
                enterKeyHint="enter"
                // 16px on mobile: below that, iOS Safari zooms the page in on
                // focus and does not zoom back out.
                className="flex-1 bg-transparent text-[16px] md:text-[15px] text-white outline-none placeholder:text-[#666] min-w-0 resize-none py-4 leading-[1.4] max-h-[200px] overflow-y-auto"
              />

              {isLoading ? (
                <button
                  onClick={handleStop}
                  className="w-[40px] h-[40px] mb-2 rounded-full flex items-center justify-center bg-black border border-[#333] hover:bg-[#111] transition-all shrink-0"
                  title="Stop generating"
                  aria-label="Stop generating"
                >
                  <div className="w-3.5 h-3.5 bg-white rounded-[2px]" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!hasPendingInput || isEncoding}
                  className="w-[40px] h-[40px] mb-2 rounded-full flex items-center justify-center border border-[#4a2107] transition-all disabled:opacity-50 disabled:grayscale shrink-0"
                  style={{ background: 'radial-gradient(circle at center, #bf671d 0%, #3b1803 100%)' }}
                  title="Send"
                  aria-label="Send"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5"></line>
                    <polyline points="5 12 12 5 19 12"></polyline>
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div ref={attachMenuRef} className="absolute bottom-full left-0 mb-4 z-50">
            {isAttachMenuOpen && !showToolHub && (
              <div className="w-[220px] bg-[#1a1a1a] border border-[#2a2a2a] shadow-[0_8px_30px_rgba(0,0,0,0.6)] rounded-[16px] py-2 animate-in fade-in zoom-in-95 duration-100">
                <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center gap-3 px-4 py-3 text-[14px] font-medium text-[#ccc] hover:bg-[#2a2a2a] hover:text-white transition text-left outline-none">
                  <Paperclip className="w-4 h-4 text-[#888]" /> Upload files
                </button>
                <div className="px-4 pb-2 pt-1 text-[11px] text-[#555] leading-relaxed">
                  PDF, Word, Excel, CSV, Markdown, text, images. Or drop them anywhere.
                </div>
                <div className="h-px bg-[#2a2a2a] my-1" />
                <button onClick={() => setShowToolHub(true)} className="w-full flex items-center gap-3 px-4 py-3 text-[14px] font-medium text-[#ccc] hover:bg-[#2a2a2a] hover:text-white transition text-left outline-none">
                  <MoreHorizontal className="w-4 h-4 text-[#888]" /> More Tools ... <span className="ml-auto text-[#666]">{'>'}</span>
                </button>
              </div>
            )}

            {isAttachMenuOpen && showToolHub && (
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] shadow-[0_8px_30px_rgba(0,0,0,0.6)] rounded-[16px] animate-in fade-in zoom-in-95 duration-100">
                <ToolHub onClose={() => { setIsAttachMenuOpen(false); setShowToolHub(false); }} />
              </div>
            )}
          </div>

          {!isChatActive && (
            <div className="flex flex-wrap justify-center gap-x-6 sm:gap-x-8 gap-y-3 md:gap-[60px] mt-[24px] md:mt-[30px] px-2">
              {STARTERS.map((starter) => (
                <button
                  key={starter.label}
                  type="button"
                  onClick={() => {
                    setInput(starter.prompt);
                    requestAnimationFrame(() => {
                      const el = textareaRef.current;
                      if (!el) return;
                      el.focus();
                      el.setSelectionRange(starter.prompt.length, starter.prompt.length);
                    });
                  }}
                  className="text-[14px] text-[#888] font-medium py-1 cursor-pointer hover:text-white transition-colors"
                >
                  {starter.label}
                </button>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}