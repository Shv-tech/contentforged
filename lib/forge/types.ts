/**
 * lib/forge/types.ts
 *
 * Shared shapes for the intelligence layer. These mirror the tables in
 * supabase/migrations/20261025000000_forge_intelligence.sql; when a column
 * changes there, the matching type changes here.
 */

import type { WritingLanguage } from './languages';

export const DRAFT_PLATFORMS = ['x', 'linkedin', 'threads', 'bluesky', 'instagram', 'newsletter'] as const;
export type DraftPlatform = (typeof DRAFT_PLATFORMS)[number];

export function isDraftPlatform(value: unknown): value is DraftPlatform {
  return typeof value === 'string' && (DRAFT_PLATFORMS as readonly string[]).includes(value);
}

export const PLATFORM_NAMES: Record<DraftPlatform, string> = {
  x: 'X',
  linkedin: 'LinkedIn',
  threads: 'Threads',
  bluesky: 'Bluesky',
  instagram: 'Instagram',
  newsletter: 'Newsletter',
};

export type DraftKind = 'post' | 'thread' | 'carousel';
export type { WritingLanguage } from './languages';
export { LANGUAGE_NAMES } from './languages';
export type ReviewStatus = 'pending' | 'approved' | 'skipped';
export type DraftStatus = 'draft' | 'scheduled' | 'posted' | 'archived';
export type ApprovalStatus = 'pending' | 'approved' | 'changes_requested';

export interface GradeDimension {
  key: GradeDimensionKey;
  label: string;
  score: number;
}

export const GRADE_DIMENSIONS = [
  { key: 'pattern_interrupt', label: 'Pattern interrupt' },
  { key: 'curiosity_gap', label: 'Curiosity gap' },
  { key: 'emotional_charge', label: 'Emotional charge' },
  { key: 'specificity', label: 'Specificity' },
  { key: 'shareability', label: 'Shareability' },
] as const;

export type GradeDimensionKey = (typeof GRADE_DIMENSIONS)[number]['key'];

export type GradeVerdict = 'ready' | 'revise' | 'rethink';

export interface Grade {
  /** Sum of the five dimensions, 0 to 50. */
  score: number;
  verdict: GradeVerdict;
  dimensions: GradeDimension[];
  /** The single weakest thing, in one sentence. */
  weakest: string;
  /** A rewritten opening line that fixes the weakest thing. */
  rewrite: string | null;
  gradedAt: string;
}

export const VERDICT_LABELS: Record<GradeVerdict, string> = {
  ready: 'Ready to post',
  revise: 'Needs one fix',
  rethink: 'Rethink the angle',
};

export interface DraftRecord {
  id: string;
  user_id: string;
  workspace_id: string | null;
  session_id: string | null;
  campaign_id: string | null;
  parent_draft_id: string | null;
  platform: DraftPlatform;
  kind: DraftKind;
  title: string | null;
  body: string;
  segments: string[];
  notes: string | null;
  grade: Grade | null;
  voice_score: number | null;
  status: DraftStatus;
  scheduled_for: string | null;
  /** Publish automatically at scheduled_for through the connected account. */
  auto_publish: boolean;
  /** Why the last automatic publish failed, shown on the card. */
  publish_error: string | null;
  calendar_event_id: string | null;
  posted_at: string | null;
  post_url: string | null;
  external_id: string | null;
  approval_status: ApprovalStatus | null;
  /** Who created it; differs from user_id only in older rows. */
  created_by: string | null;
  /** The weekly plan that proposed it, and whether it was approved in review. */
  plan_id: string | null;
  review_status: ReviewStatus | null;
  /** Lineage: the idea, capture or long-form source it was written from. */
  idea_id: string | null;
  capture_id: string | null;
  source_id: string | null;
  experiment_id: string | null;
  experiment_arm: 'a' | 'b' | null;
  format_id: string | null;
  language: WritingLanguage;
  /** The rendered visual's layout and slides, when the draft has one. */
  visual: DraftVisual | null;
  /** When the extension last placed it in a platform composer. */
  composer_filled_at: string | null;
  /** The slot the weekly plan proposes; it becomes scheduled_for on approval. */
  suggested_for: string | null;
  comments_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export type VisualLayout = 'quote' | 'carousel' | 'statement' | 'list';

export interface DraftVisual {
  layout: VisualLayout;
  /** Slide texts for carousels and lists; a single entry for quote and statement cards. */
  slides: string[];
  /** Square for feeds, portrait for LinkedIn documents and Instagram. */
  aspect: 'square' | 'portrait';
  updatedAt: string;
}

export type StoryKind = 'story' | 'metric' | 'win' | 'failure' | 'opinion' | 'fact';

export const STORY_KIND_LABELS: Record<StoryKind, string> = {
  story: 'Story',
  metric: 'Number',
  win: 'Win',
  failure: 'Failure',
  opinion: 'Belief',
  fact: 'Fact',
};

export interface StoryItem {
  id: string;
  user_id: string;
  workspace_id: string | null;
  kind: StoryKind;
  title: string;
  body: string;
  occurred_on: string | null;
  tags: string[];
  source: 'manual' | 'chat' | 'import' | 'onboarding' | 'capture' | 'interview';
  capture_id: string | null;
  quote: string | null;
  quote_start_seconds: number | null;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export type LearnedRuleKind = 'preference' | 'banned_phrase' | 'structure' | 'format';
export type LearnedRuleStatus = 'suggested' | 'accepted' | 'rejected';

export interface LearnedRule {
  id: string;
  user_id: string;
  workspace_id: string | null;
  rule: string;
  kind: LearnedRuleKind;
  signal_key: string | null;
  evidence_count: number;
  status: LearnedRuleStatus;
  source: 'chat' | 'edits' | 'manual';
  created_at: string;
}

export type MetricCheckpoint = '1h' | '24h' | '7d' | 'manual';

export interface PostMetrics {
  id: string;
  draft_id: string;
  platform: string;
  checkpoint: MetricCheckpoint;
  impressions: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  bookmarks: number | null;
  clicks: number | null;
  followers_gained: number | null;
  source: string;
  captured_at: string;
}

/** A clarifying question the model asks before drafting. */
export interface ClarifyingQuestion {
  id: string;
  question: string;
  /** Single choice shows chips; free shows a text field. */
  mode: 'single' | 'multi' | 'free';
  options: string[];
  /** Placeholder for the free-text field, or for "Type your own". */
  placeholder?: string;
}

/** A plan the user approves before a long generation runs. */
export interface PlanProposal {
  title: string;
  kind: 'ebook' | 'thread' | 'campaign' | 'series';
  items: string[];
  note?: string;
}

/**
 * Events streamed from /api/chat to the client, one JSON object per line.
 * The order is: any number of `step`, `text`, `draft`, `memory`, `questions`,
 * `plan` and `grade` events, then exactly one `done` or `error`. A `draft`
 * event can repeat for the same id: the second carries its grade.
 */
export type ChatStreamEvent =
  | { type: 'step'; id: string; label: string; state: 'active' | 'done' }
  | { type: 'text'; delta: string }
  | { type: 'draft'; draft: DraftRecord }
  | { type: 'memory'; kind: 'rule' | 'story'; id: string; label: string }
  | { type: 'questions'; intro: string | null; questions: ClarifyingQuestion[] }
  | { type: 'plan'; plan: PlanProposal }
  | { type: 'grade'; grade: Grade; text: string; cardId: string | null }
  | { type: 'done'; reply: string; userContent?: string; quota?: unknown }
  | { type: 'error'; message: string; status?: number; reason?: string; quota?: unknown; upgradeRequired?: boolean };

/**
 * Fenced-block languages used to persist rich assistant content inside the
 * plain-text chat_messages.content column. The client renders each as a card,
 * and the chat route expands them back into text the model can read.
 */
export const MARKER = {
  draft: 'forge-draft',
  questions: 'forge-questions',
  plan: 'forge-plan',
  memory: 'forge-memory',
  grade: 'forge-grade',
} as const;

export function markerBlock(language: (typeof MARKER)[keyof typeof MARKER], payload: unknown): string {
  return `\n\n\`\`\`${language}\n${JSON.stringify(payload)}\n\`\`\`\n\n`;
}

/** The Forge settings kept on the profile row. */
export interface ForgeProfile {
  niche: string | null;
  x_handle: string | null;
  /** Opt-in to contributing anonymised patterns to niche insights. */
  share_anonymous_insights: boolean;
  onboarded_at: string | null;
  /** The language the personal brand writes in. */
  writing_language: WritingLanguage;
}
