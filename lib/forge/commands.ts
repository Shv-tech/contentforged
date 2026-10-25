/**
 * lib/forge/commands.ts
 *
 * Composer shortcuts: slash commands and @story mentions.
 *
 * Both are resolved on the client into an ordinary message before it is
 * sent. The model and the stored transcript therefore see a plain,
 * readable request ("Write an X thread about ..."), never an opaque token
 * that only this UI understands, and nothing on the server has to know the
 * shortcuts exist.
 */

import type { StoryItem } from './types';

export type SlashCommandName = 'grade' | 'thread' | 'carousel' | 'story' | 'variants';

export interface SlashCommand {
  name: SlashCommandName;
  /** Shown in the menu. */
  label: string;
  description: string;
  /** Placeholder for what follows the command. */
  argument: string;
  /** Chat tool the message runs under, when the command selects one. */
  tool?: string;
  /** Builds the message sent for the command's argument. */
  expand: (argument: string) => string;
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    name: 'grade',
    label: '/grade',
    description: 'Score an opening line on five dimensions',
    argument: 'your hook',
    tool: 'hook_grader',
    expand: (argument) => argument,
  },
  {
    name: 'thread',
    label: '/thread',
    description: 'Write an X thread, one post per card',
    argument: 'topic or story',
    expand: (argument) =>
      `Write an X thread about: ${argument}\n\nFive to nine posts. The first post must stand alone as a hook. Present it as a thread draft.`,
  },
  {
    name: 'carousel',
    label: '/carousel',
    description: 'Write a LinkedIn carousel, slide by slide',
    argument: 'topic or story',
    expand: (argument) =>
      `Write a LinkedIn carousel about: ${argument}\n\nSix to ten slides. A cover slide with a hook, one idea per slide in under 30 words, and a closing slide. Then the caption post that goes with it. Present the caption as a LinkedIn draft and the slides as a numbered list.`,
  },
  {
    name: 'variants',
    label: '/variants',
    description: 'Five openings for the same idea, graded',
    argument: 'idea',
    expand: (argument) => `Give me five different opening lines for this idea, each a different hook type, and present the strongest as a draft: ${argument}`,
  },
  {
    name: 'story',
    label: '/story',
    description: 'Save something true to your Story Bank',
    argument: 'what happened',
    expand: (argument) => `Save this to my Story Bank. Pick the right kind and a short title, and do not write a post: ${argument}`,
  },
];

/** Commands matching what has been typed so far, for the menu. */
export function matchSlashCommands(input: string): SlashCommand[] {
  const match = input.match(/^\/(\w*)$/);
  if (!match) return [];
  const typed = match[1].toLowerCase();
  return SLASH_COMMANDS.filter((command) => command.name.startsWith(typed));
}

/** A complete command at the start of the input, with its argument. */
export function resolveSlashCommand(input: string): { command: SlashCommand; argument: string } | null {
  const match = input.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const command = SLASH_COMMANDS.find((c) => c.name === match[1].toLowerCase());
  if (!command) return null;
  return { command, argument: (match[2] ?? '').trim() };
}

// ---------------------------------------------------------------------------
// @story mentions
// ---------------------------------------------------------------------------

export interface StoryMention {
  id: string;
  title: string;
  body: string;
}

const STORY_BLOCK = /\n*\[STORY: (.+?)\]\n[\s\S]*?\n\[\/STORY\]/g;

/**
 * The partial mention being typed at the caret, if any: "@lau" while typing
 * returns { query: "lau", start }. A mention starts at the beginning of the
 * text or after whitespace, so email addresses never open the picker.
 */
export function activeMention(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const match = before.match(/(^|\s)@([\p{L}\p{N}_-]{0,40})$/u);
  if (!match) return null;
  return { query: match[2], start: caret - match[2].length - 1 };
}

/** Replaces the partial mention with the story's handle. */
export function insertMention(text: string, start: number, caret: number, story: Pick<StoryItem, 'title'>): { text: string; caret: number } {
  const handle = `@${mentionHandle(story.title)} `;
  const next = text.slice(0, start) + handle + text.slice(caret);
  return { text: next, caret: start + handle.length };
}

export function mentionHandle(title: string): string {
  return title.trim().replace(/\s+/g, '-').slice(0, 48);
}

/**
 * Appends the full text of every mentioned story that is still referenced in
 * the message. Mentions the user deleted from the text are dropped.
 */
export function attachMentionedStories(text: string, mentions: StoryMention[]): { text: string; storyIds: string[] } {
  const used = mentions.filter((m, i, all) => text.includes(`@${mentionHandle(m.title)}`) && all.findIndex((o) => o.id === m.id) === i);
  if (used.length === 0) return { text, storyIds: [] };
  const blocks = used.map((m) => `[STORY: ${m.title}]\n${m.body}\n[/STORY]`).join('\n\n');
  return {
    text: `${text}\n\nUse these true stories from my Story Bank. Do not change the facts in them.\n\n${blocks}`,
    storyIds: used.map((m) => m.id),
  };
}

/** Strips story blocks for display, returning the titles. */
export function extractStoryBlocks(content: string): { text: string; titles: string[] } {
  const titles: string[] = [];
  const stripped = content
    .replace(STORY_BLOCK, (_full, title: string) => {
      titles.push(title);
      return '';
    })
    .replace(/\n*Use these true stories from my Story Bank\. Do not change the facts in them\.\s*$/, '');
  return { text: stripped, titles };
}
