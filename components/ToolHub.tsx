'use client';

import React from 'react';
import { useAppStore } from '@/lib/store';
import toast from 'react-hot-toast';
import {
  Zap, Type, Hash, FileText, BarChart, Image as ImgIcon, Mail, Copy,
  LayoutTemplate, Mic, LineChart, Target, Building, Users, BookOpen,
  Presentation, Video, Search, ShieldAlert, Workflow, Fingerprint,
  Newspaper, Headphones, Layers, Repeat2, Lock, BookText
} from 'lucide-react';

// THE 26-TOOL ENTERPRISE ARSENAL
const TOOLS = [
  // ESSENTIALS (Tier 1)
  { id: 'formatter', name: 'Native Formatter', tier: 'tier1', icon: Type, group: 'Essentials' },
  { id: 'shadowban', name: 'Shadowban Checker', tier: 'tier1', icon: Hash, group: 'Essentials' },
  { id: 'simplifier', name: 'Readability Simplifier', tier: 'tier1', icon: BookOpen, group: 'Essentials' },

  // PRO CREATOR (Tier 2)
  { id: 'hook_grader', name: 'Stop-Scroll Grader', tier: 'tier2', icon: BarChart, group: 'Pro Creator' },
  { id: 'ocr', name: 'Image-to-Text (OCR)', tier: 'tier2', icon: ImgIcon, group: 'Pro Creator' },
  { id: 'email_inject', name: 'Zero-Cost Outreach', tier: 'tier2', icon: Mail, group: 'Pro Creator' },
  { id: 'viral_hook', name: 'Viral Hook Generator', tier: 'tier2', icon: Zap, group: 'Pro Creator' },
  { id: 'ab_tester', name: 'A/B Test Simulator', tier: 'tier2', icon: LayoutTemplate, group: 'Pro Creator' },
  { id: 'tone_calibrator', name: 'Tone Calibrator', tier: 'tier2', icon: Mic, group: 'Pro Creator' },

  // ENTERPRISE (Tier 3)
  { id: 'ebook_writer', name: 'Agentic Ebook Writer', tier: 'tier3', icon: BookText, group: 'Enterprise' },
  { id: 'ghostwriter', name: 'Ghostwriter Clone', tier: 'tier3', icon: Copy, group: 'Enterprise' },
  { id: 'brand_dna', name: 'Brand DNA Enforcer', tier: 'tier3', icon: Fingerprint, group: 'Enterprise' },
  { id: 'competitor_gap', name: 'Competitor Gap Analyzer', tier: 'tier3', icon: Target, group: 'Enterprise' },
  { id: 'trend_forecast', name: 'Trend Forecaster', tier: 'tier3', icon: LineChart, group: 'Enterprise' },
  { id: 'b2b_case', name: 'B2B Case Study Builder', tier: 'tier3', icon: Building, group: 'Enterprise' },
  { id: 'seo_cluster', name: 'SEO Content Clusters', tier: 'tier3', icon: Search, group: 'Enterprise' },
  { id: 'lead_magnet', name: 'Lead Funnel Architect', tier: 'tier3', icon: Workflow, group: 'Enterprise' },
  { id: 'video_script', name: 'Video Script Storyboarder', tier: 'tier3', icon: Video, group: 'Enterprise' },
  { id: 'pr_generator', name: 'Press Release Generator', tier: 'tier3', icon: Newspaper, group: 'Enterprise' },
  { id: 'crisis_spin', name: 'Crisis Spindoctor', tier: 'tier3', icon: ShieldAlert, group: 'Enterprise' },
  { id: 'ad_copy', name: 'Ad Copy Multi-Variate', tier: 'tier3', icon: Layers, group: 'Enterprise' },
  { id: 'omni_channel', name: 'Omni-Channel Repurposer', tier: 'tier3', icon: Repeat2, group: 'Enterprise' },
];

const TIER_WEIGHTS: Record<string, number> = { free: 0, basic: 1, tier1: 2, tier2: 3, tier3: 4 };
const GROUPS = ['Essentials', 'Pro Creator', 'Enterprise'];

interface ToolHubProps {
  onClose?: () => void; // Optional callback to close the parent menu if needed
}

export function ToolHub({ onClose }: ToolHubProps = {}) {
  const { activeTool, setActiveTool, plan } = useAppStore();

  // The demo override is now opt-in through an env flag rather than a
  // hardcoded 99, so shipping it to production requires an explicit
  // NEXT_PUBLIC_UNLOCK_ALL_TOOLS=true rather than remembering to edit a line.
  // Every paid tool is free to everyone while it is on.
  const bypassLocks = process.env.NEXT_PUBLIC_UNLOCK_ALL_TOOLS === 'true';
  const currentTierWeight = bypassLocks ? 99 : (TIER_WEIGHTS[plan || 'free'] ?? 0);

  const handleToolClick = (toolId: string, toolTier: string, toolName: string) => {
    if (currentTierWeight < TIER_WEIGHTS[toolTier]) {
      const planName = toolTier === 'tier1' ? 'Starter' : toolTier === 'tier2' ? 'Pro' : 'Unlimited';
      toast.error(`Upgrade to ${planName} to unlock ${toolName}.`);
      return;
    }
    setActiveTool(activeTool === toolId ? null : toolId);
    onClose?.(); // Optionally trigger a close event to the parent
  };

  return (
    // w-[520px] was unconditional, so this popover was wider than a phone
    // viewport and pushed the whole page sideways. It now takes the smaller of
    // 520px and the viewport minus the anchor's gutters.
    //
    // 65dvh rather than 65vh: on mobile 65vh is measured against the tall
    // viewport, so the panel ran past the visible area once the browser chrome
    // was showing.
    <div
      className="w-[min(520px,calc(100vw-2rem))] p-4 sm:p-5 max-h-[60dvh] sm:max-h-[65dvh] overflow-y-auto overscroll-contain custom-scrollbar font-sans"
    >
      {GROUPS.map((group) => {
        const groupTools = TOOLS.filter(t => t.group === group);
        if (groupTools.length === 0) return null;

        return (
          <div key={group} className="mb-5 sm:mb-6 last:mb-2">
            <h4 className="text-[10px] font-bold text-[#555] uppercase tracking-widest mb-3 px-2 sm:px-3">
              {group}
            </h4>
            {/*
              One column below sm. Two 13px labels in a ~160px cell truncated to
              the point of being unreadable — "Competitor Gap Analyzer" became
              "Competitor Ga...".
            */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {groupTools.map(tool => {
                const isLocked = currentTierWeight < TIER_WEIGHTS[tool.tier];
                const isActive = activeTool === tool.id;

                return (
                  <button
                    key={tool.id}
                    onClick={() => handleToolClick(tool.id, tool.tier, tool.name)}
                    aria-pressed={isActive}
                    className={`flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200 group w-full min-w-0 ${
                      isActive
                        ? 'bg-[#2a2a2a] text-white shadow-sm'
                        : 'bg-transparent text-[#999] hover:bg-[#2a2a2a] hover:text-white active:bg-[#2a2a2a]'
                    }`}
                  >
                    <div className={`flex-shrink-0 transition-colors ${
                      isActive
                        ? 'text-white'
                        : isLocked
                          ? 'text-[#444]'
                          : 'text-[#666] group-hover:text-[#aaa]'
                    }`}>
                      <tool.icon className="w-[18px] h-[18px]" strokeWidth={1.5} />
                    </div>

                    <span className={`text-[13px] font-medium truncate min-w-0 ${isLocked ? 'text-[#555]' : ''}`}>
                      {tool.name}
                    </span>

                    {isLocked && <Lock className="w-[14px] h-[14px] text-[#444] ml-auto flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}