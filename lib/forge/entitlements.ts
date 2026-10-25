/**
 * lib/forge/entitlements.ts
 *
 * What each plan unlocks, in one table.
 *
 * The tool menu used to compare the user's plan against its own tier names
 * ('basic', 'tier1', 'tier2', 'tier3') while the store had moved to the
 * billing vocabulary ('free', 'starter', 'pro', 'agency'). Every lookup missed
 * and fell through to zero, so paying customers saw every tool locked. All
 * gates now key off PlanId from lib/billing/plans.ts, and the server checks
 * the same table the client renders.
 */

import { PLANS, type PlanId } from '@/lib/billing/plans';

export const PLAN_ORDER: readonly PlanId[] = ['free', 'starter', 'pro', 'agency'];

export function planRank(plan: PlanId | null | undefined): number {
  const index = PLAN_ORDER.indexOf(plan ?? 'free');
  return index === -1 ? 0 : index;
}

export function planAtLeast(plan: PlanId | null | undefined, required: PlanId): boolean {
  return planRank(plan) >= planRank(required);
}

export function planName(plan: PlanId): string {
  return PLANS[plan]?.name ?? 'Free';
}

// ============================================================================
// FEATURES
// ============================================================================

export type FeatureId =
  | 'drafts'
  | 'story_bank'
  | 'voice'
  | 'grader'
  | 'profile_audit'
  | 'playbook'
  | 'niche_pulse'
  | 'niche_intelligence'
  | 'campaigns'
  | 'publishing'
  | 'extension'
  | 'reply_radar'
  | 'competitor_watch'
  | 'war_room'
  | 'workspaces'
  | 'capture'
  | 'weekly_plan'
  | 'visuals'
  | 'repurpose'
  | 'sources'
  | 'interviews'
  | 'experiments'
  | 'predictions'
  | 'goals'
  | 'comment_inbox'
  | 'client_reports'
  | 'members'
  | 'api'
  | 'formats'
  | 'longform';

export const FEATURE_MIN_PLAN: Record<FeatureId, PlanId> = {
  drafts: 'free',
  story_bank: 'free',
  voice: 'free',
  grader: 'free',
  profile_audit: 'free',
  playbook: 'free',
  niche_pulse: 'starter',
  niche_intelligence: 'starter',
  campaigns: 'starter',
  publishing: 'starter',
  extension: 'starter',
  reply_radar: 'pro',
  competitor_watch: 'pro',
  war_room: 'pro',
  workspaces: 'agency',
  capture: 'free',
  weekly_plan: 'free',
  formats: 'free',
  predictions: 'free',
  visuals: 'starter',
  repurpose: 'starter',
  sources: 'starter',
  experiments: 'starter',
  interviews: 'pro',
  goals: 'pro',
  comment_inbox: 'pro',
  api: 'pro',
  longform: 'pro',
  client_reports: 'agency',
  members: 'agency',
};

export const FEATURE_NAMES: Record<FeatureId, string> = {
  drafts: 'Drafts',
  story_bank: 'Story Bank',
  voice: 'Voice Fingerprint',
  grader: 'Stop-Scroll Grader',
  profile_audit: 'Profile audit',
  playbook: 'Playbook',
  niche_pulse: 'Niche pulse',
  niche_intelligence: 'Niche intelligence',
  campaigns: 'Campaigns',
  publishing: 'Publishing to LinkedIn, Threads and Bluesky',
  extension: 'Browser extension',
  reply_radar: 'Reply Radar',
  competitor_watch: 'Competitor watch',
  war_room: 'War Room',
  workspaces: 'Workspaces',
  capture: 'Capture inbox',
  weekly_plan: 'The weekly plan',
  formats: 'Formats',
  predictions: 'Predictions',
  visuals: 'Rendered visuals',
  repurpose: 'Repurposing',
  sources: 'Connected sources',
  experiments: 'Experiments',
  interviews: 'Interview mode',
  goals: 'Goals and attribution',
  comment_inbox: 'Comment inbox',
  api: 'API and MCP access',
  longform: 'Long form',
  client_reports: 'Client reports',
  members: 'Team members',
};

/** Posts a weekly plan may hold, by plan. The allowance still applies on top. */
export const WEEKLY_GOAL_MAX: Record<PlanId, number> = { free: 2, starter: 5, pro: 10, agency: 14 };

export function hasFeature(plan: PlanId | null | undefined, feature: FeatureId): boolean {
  if (process.env.NEXT_PUBLIC_UNLOCK_ALL_TOOLS === 'true') return true;
  return planAtLeast(plan, FEATURE_MIN_PLAN[feature]);
}

/** Calm upsell copy, never an error: "Reply Radar is on Pro." */
export function upsellLine(feature: FeatureId): string {
  return `${FEATURE_NAMES[feature]} is on ${planName(FEATURE_MIN_PLAN[feature])}.`;
}

// ============================================================================
// CHAT TOOLS (the + menu)
// ============================================================================

export type ToolGroup = 'Essentials' | 'Creator' | 'Pro';

export interface ChatTool {
  id: string;
  name: string;
  group: ToolGroup;
  minPlan: PlanId;
  description: string;
}

/**
 * The tool menu. Ids must match TOOL_PROMPTS in lib/forge/prompts/tools.ts.
 * Free includes the grader and hook generator so a new user can feel what
 * Forge does before paying.
 */
export const CHAT_TOOLS: readonly ChatTool[] = [
  {
    id: 'hook_grader',
    name: 'Stop-Scroll Grader',
    group: 'Essentials',
    minPlan: 'free',
    description: 'Scores an opening line and gives the one fix that matters.',
  },
  { id: 'viral_hook', name: 'Hook Generator', group: 'Essentials', minPlan: 'free', description: 'Ten opening lines for one idea, each with a reason.' },
  { id: 'formatter', name: 'Native Formatter', group: 'Essentials', minPlan: 'free', description: 'Reshapes a draft for how the platform is read.' },
  {
    id: 'simplifier',
    name: 'Readability Simplifier',
    group: 'Essentials',
    minPlan: 'free',
    description: 'Makes dense writing easy to read without dumbing it down.',
  },
  { id: 'shadowban', name: 'Reach Check', group: 'Essentials', minPlan: 'free', description: 'Flags wording and formatting that tend to limit reach.' },

  { id: 'ocr', name: 'Image to Text', group: 'Creator', minPlan: 'starter', description: 'Pulls the text out of screenshots and slides.' },
  { id: 'email_inject', name: 'Cold Outreach', group: 'Creator', minPlan: 'starter', description: 'Short cold emails and DMs that get replies.' },
  { id: 'ab_tester', name: 'A/B Test Simulator', group: 'Creator', minPlan: 'starter', description: 'Compares two versions and predicts the stronger one.' },
  { id: 'tone_calibrator', name: 'Tone Calibrator', group: 'Creator', minPlan: 'starter', description: 'Shifts the tone without losing the voice.' },
  { id: 'omni_channel', name: 'Repurposer', group: 'Creator', minPlan: 'starter', description: 'One idea into posts for every platform.' },

  { id: 'ebook_writer', name: 'Ebook Writer', group: 'Pro', minPlan: 'pro', description: 'Complete chapters with frameworks and checklists.' },
  { id: 'ghostwriter', name: 'Ghostwriter Clone', group: 'Pro', minPlan: 'pro', description: 'Writes in a client’s voice from their samples.' },
  { id: 'brand_dna', name: 'Brand DNA Builder', group: 'Pro', minPlan: 'pro', description: 'Interviews you and writes your Brand DNA.' },
  { id: 'competitor_gap', name: 'Competitor Gap', group: 'Pro', minPlan: 'pro', description: 'Finds what competitors are not saying.' },
  { id: 'trend_forecast', name: 'Trend Forecaster', group: 'Pro', minPlan: 'pro', description: 'Separates real shifts from noise.' },
  { id: 'b2b_case', name: 'Case Study Builder', group: 'Pro', minPlan: 'pro', description: 'Turns a client result into a case study.' },
  { id: 'seo_cluster', name: 'SEO Clusters', group: 'Pro', minPlan: 'pro', description: 'A topic cluster with briefs for each page.' },
  { id: 'lead_magnet', name: 'Lead Funnel', group: 'Pro', minPlan: 'pro', description: 'Lead magnet, landing copy and follow-up sequence.' },
  { id: 'video_script', name: 'Video Scripts', group: 'Pro', minPlan: 'pro', description: 'Short-form scripts with shot-by-shot beats.' },
  { id: 'pr_generator', name: 'Press Release', group: 'Pro', minPlan: 'pro', description: 'A release journalists can lift from.' },
  { id: 'crisis_spin', name: 'Crisis Response', group: 'Pro', minPlan: 'pro', description: 'A calm, honest response to a bad moment.' },
  { id: 'ad_copy', name: 'Ad Variants', group: 'Pro', minPlan: 'pro', description: 'Ad copy variants across angles.' },
  { id: 'war_room', name: 'War Room', group: 'Pro', minPlan: 'pro', description: 'Five roles research, plan, write, attack and fix a campaign.' },
];

export const TOOL_GROUPS: readonly ToolGroup[] = ['Essentials', 'Creator', 'Pro'];

export function toolById(id: string | null | undefined): ChatTool | null {
  return CHAT_TOOLS.find((tool) => tool.id === id) ?? null;
}

export function canUseTool(plan: PlanId | null | undefined, toolId: string): boolean {
  const tool = toolById(toolId);
  if (!tool) return false;
  if (process.env.NEXT_PUBLIC_UNLOCK_ALL_TOOLS === 'true') return true;
  return planAtLeast(plan, tool.minPlan);
}
