/**
 * lib/forge/labels.ts
 *
 * Vocabulary shared by the server and the browser: the kinds of things
 * Forge captures and suggests, and what to call each. Kept free of server
 * imports so client components can use it without pulling in database or
 * model code.
 */

export type CaptureSource = 'voice' | 'interview' | 'email' | 'share' | 'extension' | 'manual' | 'github' | 'linear' | 'notion' | 'calendar';

export const CAPTURE_SOURCE_LABELS: Record<CaptureSource, string> = {
  voice: 'Voice note',
  interview: 'Interview',
  email: 'Email',
  share: 'Shared',
  extension: 'Saved from the web',
  manual: 'Note',
  github: 'GitHub',
  linear: 'Linear',
  notion: 'Notion',
  calendar: 'Calendar',
};

export type IdeaSource = 'capture' | 'story' | 'pulse' | 'repost' | 'reply_question' | 'manual' | 'format' | 'experiment';
export type IdeaStatus = 'open' | 'planned' | 'drafted' | 'dismissed';

export const IDEA_SOURCE_LABELS: Record<IdeaSource, string> = {
  capture: 'From your week',
  story: 'From your Story Bank',
  reply_question: 'Asked by your audience',
  repost: 'Worth running again',
  pulse: 'Your niche is talking about it',
  format: 'A format to try',
  manual: 'Your idea',
  experiment: 'Experiment',
};

export const STORY_KIND_LABELS = {
  story: 'Story',
  metric: 'Number',
  win: 'Win',
  failure: 'Setback',
  opinion: 'Opinion',
  fact: 'Fact',
} as const;

export type ConnectorProvider = 'github' | 'linear' | 'notion' | 'calendar';

export type WorkspaceRole = 'owner' | 'editor' | 'reviewer' | 'client';
export type WorkspaceKind = 'client' | 'company';

export const WORKSPACE_ROLES: readonly WorkspaceRole[] = ['owner', 'editor', 'reviewer', 'client'];
export const MEMBER_ROLES = ['editor', 'reviewer', 'client'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  reviewer: 'Reviewer',
  client: 'Client',
};

export const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  editor: 'Writes, edits, schedules and publishes.',
  reviewer: 'Reads everything and comments. Cannot change drafts.',
  client: 'Reads drafts and comments on them. Sees reports.',
};
