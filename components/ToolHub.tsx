'use client';

/**
 * The tool menu behind the composer's + button.
 *
 * Tools, groups and plan gates come from lib/forge/entitlements, the table the
 * chat route enforces, so the menu can never show a tool as open that the
 * server will refuse, or lock one the plan includes. A locked tool still
 * opens a one-line note naming the plan it is on, with a link to compare
 * plans; it is never presented as an error.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  BarChart,
  BookOpen,
  BookText,
  Building,
  Copy,
  Fingerprint,
  Hash,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  LineChart,
  Mail,
  Mic,
  Newspaper,
  Repeat2,
  Search,
  ShieldAlert,
  Swords,
  Target,
  Type,
  Video,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { CHAT_TOOLS, TOOL_GROUPS, canUseTool, planName, type ChatTool } from '@/lib/forge/entitlements';
import { cn, focusRing } from '@/components/forge/ui';

const TOOL_ICONS: Record<string, LucideIcon> = {
  hook_grader: BarChart,
  viral_hook: Zap,
  formatter: Type,
  simplifier: BookOpen,
  shadowban: Hash,
  ocr: ImageIcon,
  email_inject: Mail,
  ab_tester: LayoutTemplate,
  tone_calibrator: Mic,
  omni_channel: Repeat2,
  ebook_writer: BookText,
  ghostwriter: Copy,
  brand_dna: Fingerprint,
  competitor_gap: Target,
  trend_forecast: LineChart,
  b2b_case: Building,
  seo_cluster: Search,
  lead_magnet: Workflow,
  video_script: Video,
  pr_generator: Newspaper,
  crisis_spin: ShieldAlert,
  ad_copy: Layers,
  war_room: Swords,
};

const GROUP_LABELS: Record<(typeof TOOL_GROUPS)[number], string> = {
  Essentials: 'Essentials',
  Creator: 'Creator',
  Pro: 'Pro',
};

export function ToolHub({ onClose }: { onClose?: () => void } = {}) {
  const { activeTool, setActiveTool, plan } = useAppStore();
  const [locked, setLocked] = useState<ChatTool | null>(null);
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CHAT_TOOLS;
    return CHAT_TOOLS.filter((tool) => `${tool.name} ${tool.description}`.toLowerCase().includes(q));
  }, [query]);

  const choose = (tool: ChatTool) => {
    if (!canUseTool(plan, tool.id)) {
      setLocked(tool);
      return;
    }
    setActiveTool(activeTool === tool.id ? null : tool.id);
    onClose?.();
  };

  return (
    <div className="flex w-[min(560px,calc(100vw-2rem))] flex-col font-sans">
      <div className="border-b border-white/[0.06] p-3">
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLocked(null);
          }}
          placeholder="Find a tool"
          aria-label="Find a tool"
          className="h-10 w-full rounded-full border border-white/[0.08] bg-white/[0.03] px-4 text-[14px] text-white outline-none placeholder:text-white/35 focus:border-white/20"
        />
      </div>

      {locked && (
        <div className="mx-3 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
          <p className="text-[13px] text-white/75">
            {locked.name} is on {planName(locked.minPlan)}.
          </p>
          <Link href="/account?tab=billing" onClick={onClose} className={cn('rounded-full bg-white px-3 py-1 text-[12.5px] font-medium text-black', focusRing)}>
            Compare plans
          </Link>
        </div>
      )}

      {/* 60dvh: on mobile vh is measured against the tall viewport and the
          panel would run past the visible area with the browser chrome shown. */}
      <div className="custom-scrollbar max-h-[56dvh] overflow-y-auto overscroll-contain p-3 sm:max-h-[60dvh]">
        {visible.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-white/40">No tool matches.</p>}
        {TOOL_GROUPS.map((group) => {
          const tools = visible.filter((tool) => tool.group === group);
          if (tools.length === 0) return null;
          return (
            <section key={group} className="mb-4 last:mb-1">
              <h4 className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/30">{GROUP_LABELS[group]}</h4>
              <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                {tools.map((tool) => {
                  const Icon = TOOL_ICONS[tool.id] ?? Zap;
                  const isLocked = !canUseTool(plan, tool.id);
                  const isActive = activeTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => choose(tool)}
                      aria-pressed={isActive}
                      title={tool.description}
                      className={cn(
                        'group flex w-full min-w-0 items-start gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors',
                        isActive ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]',
                        focusRing
                      )}
                    >
                      <Icon
                        className={cn(
                          'mt-0.5 h-[17px] w-[17px] shrink-0',
                          isActive ? 'text-forge-gold' : isLocked ? 'text-white/25' : 'text-white/50 group-hover:text-white/80'
                        )}
                        strokeWidth={1.6}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={cn('truncate text-[13.5px] font-medium', isLocked ? 'text-white/45' : 'text-white')}>{tool.name}</span>
                          {isLocked && (
                            <span className="shrink-0 rounded-full border border-white/[0.1] px-1.5 text-[10px] font-medium uppercase tracking-[0.06em] text-white/40">
                              {planName(tool.minPlan)}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-white/40">{tool.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
