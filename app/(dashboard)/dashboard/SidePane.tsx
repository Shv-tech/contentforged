'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Lock, Settings, LogOut, Coins, PanelLeftClose, PanelLeftOpen, 
  Zap, Type, Hash, FileText, BarChart, Image as ImgIcon, Mail, Copy, 
  LayoutTemplate, Mic, LineChart, Target, Building, Users, BookOpen, 
  Presentation, Video, Search, ShieldAlert, Workflow, Fingerprint, 
  Newspaper, Headphones, Layers, Repeat2, ArrowUpRight
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';

// THE 25-TOOL ENTERPRISE ARSENAL
const TOOLS = [
  // ESSENTIALS (Tier 1)
  { id: 'formatter', name: 'Native Formatter', tier: 'tier1', icon: Type, group: 'Essentials' },
  { id: 'shadowban', name: 'Shadowban Checker', tier: 'tier1', icon: Hash, group: 'Essentials' },
  { id: 'simplifier', name: 'Readability Simplifier', tier: 'tier1', icon: BookOpen, group: 'Essentials' },

  // PRO CREATOR (Tier 2)
  { id: 'hook_grader', name: 'Stop-Scroll Grader', tier: 'tier2', icon: BarChart, group: 'Pro Creator' },
  { id: 'pdf_export', name: 'PDF Carousel Builder', tier: 'tier2', icon: FileText, group: 'Pro Creator' },
  { id: 'ocr', name: 'Image-to-Text (OCR)', tier: 'tier2', icon: ImgIcon, group: 'Pro Creator' },
  { id: 'email_inject', name: 'Zero-Cost Outreach', tier: 'tier2', icon: Mail, group: 'Pro Creator' },
  { id: 'viral_hook', name: 'Viral Hook Generator', tier: 'tier2', icon: Zap, group: 'Pro Creator' },
  { id: 'ab_tester', name: 'A/B Test Simulator', tier: 'tier2', icon: LayoutTemplate, group: 'Pro Creator' },
  { id: 'tone_calibrator', name: 'Tone Calibrator', tier: 'tier2', icon: Mic, group: 'Pro Creator' },

  // ENTERPRISE (Tier 3)
  { id: 'war_room', name: 'Multi-Agent War Room', tier: 'tier3', icon: Users, group: 'Enterprise' },
  { id: 'ghostwriter', name: 'Ghostwriter Clone', tier: 'tier3', icon: Copy, group: 'Enterprise' },
  { id: 'brand_dna', name: 'Brand DNA Enforcer', tier: 'tier3', icon: Fingerprint, group: 'Enterprise' },
  { id: 'competitor_gap', name: 'Competitor Gap Analyzer', tier: 'tier3', icon: Target, group: 'Enterprise' },
  { id: 'trend_forecast', name: 'Trend Forecaster', tier: 'tier3', icon: LineChart, group: 'Enterprise' },
  { id: 'b2b_case', name: 'B2B Case Study Builder', tier: 'tier3', icon: Building, group: 'Enterprise' },
  { id: 'seo_cluster', name: 'SEO Content Clusters', tier: 'tier3', icon: Search, group: 'Enterprise' },
  { id: 'lead_magnet', name: 'Lead Funnel Architect', tier: 'tier3', icon: Workflow, group: 'Enterprise' },
  { id: 'video_script', name: 'Video Script Storyboarder', tier: 'tier3', icon: Video, group: 'Enterprise' },
  { id: 'pr_generator', name: 'Press Release Generator', tier: 'tier3', icon: Newspaper, group: 'Enterprise' },
  { id: 'pitch_deck', name: 'Pitch Deck Analyzer', tier: 'tier3', icon: Presentation, group: 'Enterprise' },
  { id: 'podcast_notes', name: 'Podcast Notes Extractor', tier: 'tier3', icon: Headphones, group: 'Enterprise' },
  { id: 'crisis_spin', name: 'Crisis Spindoctor', tier: 'tier3', icon: ShieldAlert, group: 'Enterprise' },
  { id: 'ad_copy', name: 'Ad Copy Multi-Variate', tier: 'tier3', icon: Layers, group: 'Enterprise' },
  { id: 'omni_channel', name: 'Omni-Channel Repurposer', tier: 'tier3', icon: Repeat2, group: 'Enterprise' },
];

const TIER_WEIGHTS: Record<string, number> = { free: 0, basic: 1, tier1: 2, tier2: 3, tier3: 4 };

export function SidebarPane({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { plan, activeTool, setActiveTool, setUser, creditsRemaining, user } = useAppStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const router = useRouter();
  const currentTierWeight = TIER_WEIGHTS[plan || 'free'];

  const handleToolClick = (toolId: string, toolTier: string, toolName: string) => {
    if (currentTierWeight < TIER_WEIGHTS[toolTier]) {
      const planName = toolTier === 'tier1' ? 'Starter' : toolTier === 'tier2' ? 'Pro' : 'Unlimited';
      toast.error(`Upgrade to ${planName} required to unlock ${toolName}.`);
      return;
    }
    setActiveTool(activeTool === toolId ? null : toolId);
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    router.push('/');
  };

  return (
    <aside 
      className={`h-full bg-[#FAFAFA] border-r border-gray-200 flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out font-sans ${
        isCollapsed ? 'w-[68px]' : 'w-[280px]'
      }`}
    >
      {/* HEADER AREA */}
      <div className={`p-4 border-b border-gray-200 flex flex-col gap-2 ${isCollapsed ? 'items-center' : ''}`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isCollapsed && (
            <Link href="/" className="font-semibold tracking-tight text-[16px] text-gray-900 hover:opacity-70 transition-opacity">
              ContentForge
            </Link>
          )}
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded-md transition-colors"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>
        </div>
        
        {/* BADGES, CREDITS & UPGRADE (Hidden when collapsed) */}
        {!isCollapsed && (
          <div className="flex flex-col gap-3 mt-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-sm font-bold uppercase tracking-wider">
                {plan === 'tier3' ? 'Unlimited' : plan === 'tier2' ? 'Pro' : plan === 'tier1' ? 'Starter' : 'Free Trial'}
              </span>
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
                <Coins className="w-3 h-3" />
                {plan === 'tier3' ? 'Unlimited' : `${creditsRemaining} Credits`}
              </div>
            </div>
            
            {/* UPGRADE BUTTON FOR NON-UNLIMITED USERS */}
            {plan !== 'tier3' && (
              <Link 
                href="/#pricing" 
                className="w-full bg-gray-900 text-white text-[12px] font-medium py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-800 transition shadow-sm"
              >
                Upgrade Workspace <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        )}
      </div>

      {/* TOOLS LIST */}
      <div className="flex-1 overflow-y-auto py-4 space-y-6 custom-scrollbar pb-24">
        {['Essentials', 'Pro Creator', 'Enterprise'].map(group => {
          const groupTools = TOOLS.filter(t => t.group === group);
          if (groupTools.length === 0) return null;

          return (
            <div key={group} className={isCollapsed ? "px-2" : "px-3"}>
              {!isCollapsed ? (
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
                  {group}
                </h4>
              ) : (
                <div className="w-full h-px bg-gray-200 my-2" />
              )}
              
              <div className="space-y-0.5">
                {groupTools.map(tool => {
                  const isLocked = currentTierWeight < TIER_WEIGHTS[tool.tier];
                  const isActive = activeTool === tool.id;
                  
                  return (
                    <button 
                      key={tool.id} 
                      onClick={() => handleToolClick(tool.id, tool.tier, tool.name)} 
                      title={isCollapsed ? tool.name : undefined}
                      className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2' : 'justify-between px-3 py-2'} rounded-md transition text-left group ${
                        isActive ? 'bg-white border border-gray-200 shadow-[0_2px_8px_rgb(0,0,0,0.04)]' : 'border border-transparent hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <tool.icon className={`w-4 h-4 ${
                          isLocked 
                            ? 'text-gray-300' 
                            : isActive 
                              ? (tool.group === 'Enterprise' ? 'text-orange-500' : 'text-gray-900') 
                              : 'text-gray-500 group-hover:text-gray-700'
                        }`} />
                        {!isCollapsed && (
                          <span className={`text-[13px] font-medium ${
                            isLocked ? 'text-gray-400' : isActive ? 'text-gray-900' : 'text-gray-600 group-hover:text-gray-900'
                          }`}>
                            {tool.name}
                          </span>
                        )}
                      </div>
                      {!isCollapsed && isLocked && <Lock className="w-3 h-3 text-gray-300" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* SETTINGS & LOGOUT FOOTER */}
      <div className={`p-4 border-t border-gray-200 flex flex-col gap-2 ${isCollapsed ? 'items-center px-2' : ''} bg-[#FAFAFA]`}>
        
        {/* DISPLAY USER EMAIL */}
        {!isCollapsed && user?.email && (
          <div className="px-2 pb-3 mb-1 border-b border-gray-200">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Account</div>
            <div className="text-[12px] font-medium text-gray-900 truncate" title={user.email}>
              {user.email}
            </div>
          </div>
        )}

        {/* REPLACED BUTTON WITH A LINK TO /ACCOUNT */}
        <Link 
          href="/account"
          title={isCollapsed ? "Account Settings" : undefined}
          className={`flex items-center ${isCollapsed ? 'justify-center p-2' : 'gap-2.5 px-3 py-2'} w-full text-[13px] font-medium text-gray-500 hover:text-gray-900 transition rounded-md hover:bg-gray-100`}
        >
          <Settings className="w-4 h-4" /> 
          {!isCollapsed && <span>Account & API</span>}
        </Link>
        
        <button 
          onClick={handleLogout} 
          title={isCollapsed ? "Disconnect" : undefined}
          className={`flex items-center ${isCollapsed ? 'justify-center p-2' : 'gap-2.5 px-3 py-2'} w-full text-[13px] font-medium text-red-500 hover:text-red-600 transition rounded-md hover:bg-red-50`}
        >
          <LogOut className="w-4 h-4" /> 
          {!isCollapsed && <span>Disconnect</span>}
        </button>
      </div>
    </aside>
  );
}