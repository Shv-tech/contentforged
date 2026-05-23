'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import toast from 'react-hot-toast';
import { 
  Zap, Type, Hash, FileText, BarChart, Image as ImgIcon, Mail, Copy, 
  LayoutTemplate, Mic, LineChart, Target, Building, Users, BookOpen, 
  Presentation, Video, Search, ShieldAlert, Workflow, Fingerprint, 
  Newspaper, Headphones, Layers, Repeat2, ChevronDown, Wrench, Lock, BookText
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
  { id: 'ebook_writer', name: 'Agentic Ebook Writer', tier: 'tier3', icon: BookText, group: 'Enterprise' }, // NEW EBOOK TOOL
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

export function ToolHub() {
  const [isOpen, setIsOpen] = useState(false);
  const { activeTool, setActiveTool, plan } = useAppStore();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ðŸ”¥ DEV MODE OVERRIDE FOR THE DEMO: Forces weight to 99 so it bypasses all locks ðŸ”¥
  // Change '99' to 'TIER_WEIGHTS[plan || 'free']' before going to production
  const currentTierWeight = 99; 

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToolClick = (toolId: string, toolTier: string, toolName: string) => {
    if (currentTierWeight < TIER_WEIGHTS[toolTier]) {
      const planName = toolTier === 'tier1' ? 'Starter' : toolTier === 'tier2' ? 'Pro' : 'Unlimited';
      toast.error(`Upgrade to ${planName} required to unlock ${toolName}.`);
      return;
    }
    setActiveTool(activeTool === toolId ? null : toolId);
    setIsOpen(false);
  };

  const activeToolData = TOOLS.find(t => t.id === activeTool);

  return (
    <div className="relative z-50" ref={dropdownRef}>
      {/* TRIGGER BUTTON */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-4 py-2 bg-white border border-gray-200 rounded-xl shadow-[0_2px_8px_rgb(0,0,0,0.04)] text-sm font-medium text-gray-800 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
      >
        <div className={`p-1 rounded-md ${activeToolData ? 'bg-orange-50 text-orange-600' : 'bg-gray-100 text-gray-600'}`}>
          {activeToolData ? <activeToolData.icon className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
        </div>
        {activeToolData ? activeToolData.name : 'Select Strategic Tool'}
        <ChevronDown className={`w-4 h-4 text-gray-400 ml-1 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* DROPDOWN MEGA-MENU (Now opening UPWARDS) */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-3 w-[520px] bg-white border border-gray-200 shadow-[0_-12px_40px_rgb(0,0,0,0.12)] rounded-2xl overflow-hidden flex flex-col transform origin-bottom-left animate-in fade-in zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="px-5 py-3.5 bg-[#FAFAFA] border-b border-gray-100 flex justify-between items-center shrink-0">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">ContentForge Tool Arsenal</span>
            {activeTool && (
              <button 
                onClick={() => { setActiveTool(null); setIsOpen(false); }} 
                className="text-xs font-medium text-gray-500 hover:text-gray-900 transition"
              >
                Clear Selection
              </button>
            )}
          </div>

          {/* Tools Grid */}
          <div className="p-3 overflow-y-auto max-h-[60vh] custom-scrollbar">
            {GROUPS.map((group) => {
              const groupTools = TOOLS.filter(t => t.group === group);
              if (groupTools.length === 0) return null;

              return (
                <div key={group} className="mb-5 last:mb-1">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-2">
                    {group}
                  </h4>
                  <div className="grid grid-cols-2 gap-1">
                    {groupTools.map(tool => {
                      const isLocked = currentTierWeight < TIER_WEIGHTS[tool.tier];
                      const isActive = activeTool === tool.id;

                      return (
                        <button
                          key={tool.id}
                          onClick={() => handleToolClick(tool.id, tool.tier, tool.name)}
                          className={`flex items-center gap-3 p-2.5 rounded-xl text-left transition-all duration-200 group ${
                            isActive 
                              ? 'bg-gray-900 text-white shadow-md' 
                              : 'bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                          }`}
                        >
                          <div className={`p-1.5 rounded-lg flex-shrink-0 transition-colors ${
                            isActive 
                              ? 'bg-gray-800 text-white' 
                              : isLocked
                                ? 'bg-gray-50 text-gray-300'
                                : 'bg-white border border-gray-200 text-gray-700 shadow-sm group-hover:border-gray-300'
                          }`}>
                            <tool.icon className="w-4 h-4" />
                          </div>
                          
                          <span className={`text-[13px] font-medium truncate ${isLocked ? 'text-gray-400' : ''}`}>
                            {tool.name}
                          </span>

                          {isLocked && <Lock className="w-3 h-3 text-gray-300 ml-auto flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}