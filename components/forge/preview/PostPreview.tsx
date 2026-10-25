'use client';

/**
 * How a draft will look where it is going, in that platform's own dark
 * theme: X and its thread line, LinkedIn's "see more" fold, Threads,
 * Bluesky, an Instagram caption, a newsletter body.
 *
 * The goal is the moment a user notices that their hook breaks after the
 * fold, or that post three of a thread runs long. Layout values are taken
 * from each platform's current dark UI; the fold positions are heuristics and
 * are labelled as such.
 */

import { useMemo, useState } from 'react';
import { draftText } from '@/lib/forge/draft-text';
import { feedFoldIndex, measure, PLATFORM_LIMITS, splitIntoThread } from '@/lib/forge/text';
import { PLATFORM_NAMES, type DraftPlatform, type DraftRecord } from '@/lib/forge/types';
import { PlatformGlyph } from '../icons';
import { Segmented, cn } from '../ui';

export interface PreviewIdentity {
  name: string;
  handle: string | null;
  initial: string;
}

type Width = 'phone' | 'desktop';

export function PostPreview({ draft, workingText, identity }: { draft: DraftRecord; workingText?: string | null; identity: PreviewIdentity }) {
  const [width, setWidth] = useState<Width>('phone');
  const text = workingText ?? draftText(draft);

  const posts = useMemo(() => {
    if (draft.kind === 'thread') {
      const parts = text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
      return parts.length > 0 ? parts : [''];
    }
    return [text];
  }, [draft.kind, text]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3">
        <div className="flex min-w-0 items-center gap-2 text-[13px] text-white/70">
          <PlatformGlyph platform={draft.platform} className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {PLATFORM_NAMES[draft.platform]}{' '}
            {draft.kind === 'thread' ? `thread, ${posts.length} posts` : draft.kind === 'carousel' ? 'carousel caption' : 'post'}
          </span>
        </div>
        <Segmented
          label="Preview width"
          value={width}
          onChange={setWidth}
          options={[
            { value: 'phone', label: 'Phone' },
            { value: 'desktop', label: 'Desktop' },
          ]}
        />
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-8 sm:px-8">
        <div className={cn('mx-auto transition-[max-width] duration-300', width === 'phone' ? 'max-w-[390px]' : 'max-w-[600px]')}>
          <PlatformFrame platform={draft.platform} posts={posts} identity={identity} kind={draft.kind} />
          <PreviewNotes platform={draft.platform} posts={posts} kind={draft.kind} />
        </div>
      </div>
    </div>
  );
}

function PlatformFrame({
  platform,
  posts,
  identity,
  kind,
}: {
  platform: DraftPlatform;
  posts: string[];
  identity: PreviewIdentity;
  kind: DraftRecord['kind'];
}) {
  switch (platform) {
    case 'x':
      return <XFrame posts={posts} identity={identity} />;
    case 'linkedin':
      return <LinkedInFrame text={posts.join('\n\n')} identity={identity} carousel={kind === 'carousel'} />;
    case 'threads':
      return <ThreadsFrame posts={posts} identity={identity} />;
    case 'bluesky':
      return <BlueskyFrame posts={posts} identity={identity} />;
    case 'instagram':
      return <InstagramFrame text={posts.join('\n\n')} identity={identity} />;
    default:
      return <NewsletterFrame text={posts.join('\n\n')} identity={identity} />;
  }
}

// ---------------------------------------------------------------------------
// Rich text: links, mentions and hashtags coloured the way each feed does.
// ---------------------------------------------------------------------------

const TOKEN = /(https?:\/\/[^\s]+|@[A-Za-z0-9_]{1,30}|#[\p{L}\p{N}_]+)/gu;

function RichText({ text, accent, className }: { text: string; accent: string; className?: string }) {
  const parts = text.split(TOKEN);
  return (
    <p className={cn('whitespace-pre-wrap break-words', className)}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} style={{ color: accent }}>
            {part.startsWith('http') ? part.replace(/^https?:\/\/(www\.)?/, '').slice(0, 28) + (part.length > 36 ? '…' : '') : part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

function Avatar({ identity, size, rounded = 'full', tone }: { identity: PreviewIdentity; size: number; rounded?: 'full' | 'md'; tone: string }) {
  return (
    <div
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center font-semibold text-white', rounded === 'full' ? 'rounded-full' : 'rounded-md')}
      style={{ width: size, height: size, background: tone, fontSize: size * 0.4 }}
    >
      {identity.initial}
    </div>
  );
}

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('h-[18px] w-[18px]', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  reply: 'M4 5h16v11H8l-4 4V5Z',
  repost: 'M7 7h11l-3-3M17 17H6l3 3M18 7v5M6 17v-5',
  like: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z',
  views: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
  share: 'M12 3v13M7 8l5-5 5 5M5 14v6h14v-6',
  comment: 'M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z',
  send: 'M21 3 3 10l7 3 3 7 8-17Z',
  thumbs: 'M7 10v10H4V10h3Zm0 0 4-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 16.8 20H7',
} as const;

// ---------------------------------------------------------------------------
// X
// ---------------------------------------------------------------------------

function XFrame({ posts, identity }: { posts: string[]; identity: PreviewIdentity }) {
  const handle = identity.handle ? `@${identity.handle}` : '@you';
  return (
    <div className="overflow-hidden rounded-2xl border border-[#2F3336] bg-black font-[system-ui]">
      {posts.map((post, index) => {
        const length = measure(post, 'x');
        const over = length > PLATFORM_LIMITS.x;
        const last = index === posts.length - 1;
        return (
          <article key={index} className={cn('flex gap-3 px-4 pt-3', last ? 'pb-2 border-b-0' : 'pb-0')}>
            <div className="flex flex-col items-center">
              <Avatar identity={identity} size={40} tone="#1D9BF0" />
              {!last && <div className="mt-1 w-0.5 flex-1 bg-[#333639]" />}
            </div>
            <div className="min-w-0 flex-1 pb-3">
              <div className="flex min-w-0 items-baseline gap-1 text-[15px]">
                <span className="truncate font-bold text-[#E7E9EA]">{identity.name}</span>
                <span className="truncate text-[#71767B]">{handle} · now</span>
              </div>
              <RichText text={post || ' '} accent="#1D9BF0" className="mt-0.5 text-[15px] leading-[20px] text-[#E7E9EA]" />
              <div className="mt-3 flex items-center justify-between text-[#71767B]">
                <Icon d={ICONS.reply} />
                <Icon d={ICONS.repost} />
                <Icon d={ICONS.like} />
                <Icon d={ICONS.views} />
                <span className="flex items-center gap-3">
                  <Icon d={ICONS.bookmark} />
                  <Icon d={ICONS.share} />
                </span>
              </div>
              <div className={cn('mt-2 text-right text-[11.5px] tabular-nums', over ? 'text-[#F4212E]' : 'text-[#71767B]')}>
                {posts.length > 1 && `${index + 1}/${posts.length} · `}
                {length}/{PLATFORM_LIMITS.x}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LinkedIn
// ---------------------------------------------------------------------------

function LinkedInFrame({ text, identity, carousel }: { text: string; identity: PreviewIdentity; carousel: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const fold = feedFoldIndex(text, 'linkedin');
  const shown = !expanded && fold !== null ? text.slice(0, fold).trimEnd() : text;

  return (
    <div className="overflow-hidden rounded-lg bg-[#1B1F23] font-[system-ui] text-[rgba(255,255,255,0.9)] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
      <div className="flex gap-2 px-4 pt-3">
        <Avatar identity={identity} size={48} tone="#0A66C2" />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[14px] font-semibold">{identity.name}</div>
          <div className="mt-0.5 truncate text-[12px] text-[rgba(255,255,255,0.6)]">Now · Anyone</div>
        </div>
      </div>
      <div className="px-4 pb-3 pt-2 text-[14px] leading-[20px]">
        <RichText text={shown || ' '} accent="#71B7FB" className="inline" />
        {!expanded && fold !== null && (
          <button type="button" onClick={() => setExpanded(true)} className="ml-1 text-[rgba(255,255,255,0.6)] hover:text-[#71B7FB] hover:underline">
            ...more
          </button>
        )}
      </div>
      {carousel && (
        <div className="mx-4 mb-3 flex aspect-[4/5] max-h-[300px] items-center justify-center rounded border border-white/10 bg-[#283036] text-[12px] text-white/50">
          Carousel slides attach here as a PDF
        </div>
      )}
      <div className="mx-4 border-t border-white/10" />
      <div className="flex justify-around px-2 py-1 text-[13px] font-semibold text-[rgba(255,255,255,0.6)]">
        {[
          ['Like', ICONS.thumbs],
          ['Comment', ICONS.comment],
          ['Repost', ICONS.repost],
          ['Send', ICONS.send],
        ].map(([label, d]) => (
          <span key={label} className="flex items-center gap-1.5 rounded px-2 py-2.5">
            <Icon d={d} className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

function ThreadsFrame({ posts, identity }: { posts: string[]; identity: PreviewIdentity }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#323232] bg-[#101010] font-[system-ui]">
      {posts.map((post, index) => {
        const last = index === posts.length - 1;
        const over = measure(post, 'threads') > PLATFORM_LIMITS.threads;
        return (
          <article key={index} className="flex gap-3 px-4 pt-4">
            <div className="flex flex-col items-center">
              <Avatar identity={identity} size={36} tone="#3A3A3A" />
              {!last && <div className="mt-2 w-0.5 flex-1 rounded bg-[#333]" />}
            </div>
            <div className="min-w-0 flex-1 pb-4">
              <div className="flex items-baseline gap-2 text-[15px]">
                <span className="truncate font-semibold text-[#F3F5F7]">{identity.handle ?? identity.name.toLowerCase().replace(/\s+/g, '')}</span>
                <span className="text-[#777]">now</span>
              </div>
              <RichText text={post || ' '} accent="#3D9AF5" className="mt-0.5 text-[15px] leading-[21px] text-[#F3F5F7]" />
              <div className="mt-3 flex items-center gap-4 text-[#F3F5F7]/80">
                <Icon d={ICONS.like} />
                <Icon d={ICONS.comment} />
                <Icon d={ICONS.repost} />
                <Icon d={ICONS.send} />
              </div>
              {over && <p className="mt-2 text-[11.5px] text-[#FF4D4D]">Over the 500 character limit</p>}
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bluesky
// ---------------------------------------------------------------------------

function BlueskyFrame({ posts, identity }: { posts: string[]; identity: PreviewIdentity }) {
  const handle = identity.handle ? `@${identity.handle.includes('.') ? identity.handle : `${identity.handle}.bsky.social`}` : '@you.bsky.social';
  return (
    <div className="overflow-hidden rounded-xl border border-[#2E4052] bg-[#161E27] font-[system-ui]">
      {posts.map((post, index) => {
        const last = index === posts.length - 1;
        const length = measure(post, 'bluesky');
        return (
          <article key={index} className="flex gap-2.5 px-3.5 pt-3">
            <div className="flex flex-col items-center">
              <Avatar identity={identity} size={42} tone="#1083FE" />
              {!last && <div className="mt-1 w-0.5 flex-1 bg-[#2E4052]" />}
            </div>
            <div className="min-w-0 flex-1 pb-3">
              <div className="flex min-w-0 items-baseline gap-1 text-[15px]">
                <span className="truncate font-semibold text-[#F1F3F5]">{identity.name}</span>
                <span className="truncate text-[#AEBBC9]">{handle} · now</span>
              </div>
              <RichText text={post || ' '} accent="#208BFE" className="mt-0.5 text-[15px] leading-[20px] text-[#F1F3F5]" />
              <div className="mt-2.5 flex items-center justify-between pr-8 text-[#788EA5]">
                <Icon d={ICONS.reply} />
                <Icon d={ICONS.repost} />
                <Icon d={ICONS.like} />
                <span className={cn('text-[11.5px] tabular-nums', length > PLATFORM_LIMITS.bluesky ? 'text-[#EC4868]' : '')}>
                  {length}/{PLATFORM_LIMITS.bluesky}
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------

function InstagramFrame({ text, identity }: { text: string; identity: PreviewIdentity }) {
  const [expanded, setExpanded] = useState(false);
  const fold = feedFoldIndex(text, 'instagram');
  const shown = !expanded && fold !== null ? text.slice(0, fold).trimEnd() : text;
  const handle = identity.handle ?? identity.name.toLowerCase().replace(/\s+/g, '');
  return (
    <div className="overflow-hidden rounded-xl border border-[#262626] bg-black font-[system-ui] text-[#F5F5F5]">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar identity={identity} size={32} tone="linear-gradient(45deg,#F9CE34,#EE2A7B,#6228D7)" />
        <span className="text-[13.5px] font-semibold">{handle}</span>
      </div>
      <div className="flex aspect-square items-center justify-center bg-[#121212] px-8 text-center text-[12.5px] text-white/40">
        Your image or carousel. The caption below is what Forge wrote.
      </div>
      <div className="flex items-center gap-4 px-3 pt-3">
        <Icon d={ICONS.like} className="h-6 w-6" />
        <Icon d={ICONS.comment} className="h-6 w-6" />
        <Icon d={ICONS.send} className="h-6 w-6" />
        <Icon d={ICONS.bookmark} className="ml-auto h-6 w-6" />
      </div>
      <div className="px-3 pb-4 pt-2 text-[14px] leading-[18px]">
        <span className="mr-1.5 font-semibold">{handle}</span>
        <RichText text={shown || ' '} accent="#E0F1FF" className="inline" />
        {!expanded && fold !== null && (
          <button type="button" onClick={() => setExpanded(true)} className="ml-1 text-[#A8A8A8]">
            more
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Newsletter
// ---------------------------------------------------------------------------

function NewsletterFrame({ text, identity }: { text: string; identity: PreviewIdentity }) {
  const [subject, ...rest] = text.split('\n');
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111] font-[system-ui]">
      <div className="border-b border-white/[0.06] px-6 py-4">
        <div className="text-[12px] text-white/45">From {identity.name}</div>
        <div className="mt-1 text-[17px] font-semibold text-white">{subject.replace(/^#+\s*/, '') || 'Untitled'}</div>
      </div>
      <div className="px-6 py-5">
        <RichText text={rest.join('\n').trim() || ' '} accent="#FFB067" className="text-[15.5px] leading-[1.65] text-white/85" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notes under the preview
// ---------------------------------------------------------------------------

function PreviewNotes({ platform, posts, kind }: { platform: DraftPlatform; posts: string[]; kind: DraftRecord['kind'] }) {
  const notes: string[] = [];
  const joined = posts.join('\n\n');

  if (platform === 'linkedin' || platform === 'instagram') {
    const fold = feedFoldIndex(joined, platform);
    if (fold !== null) {
      notes.push(`The feed shows about the first ${fold} characters before "more". Everything that earns the click has to be above that line.`);
    } else {
      notes.push('The whole post shows in the feed without a "more" fold.');
    }
  }

  if ((platform === 'x' || platform === 'threads' || platform === 'bluesky') && kind !== 'thread') {
    const limit = PLATFORM_LIMITS[platform];
    const length = measure(joined, platform);
    if (length > limit) {
      const parts = splitIntoThread(joined, platform).length;
      notes.push(`This is ${length} characters, over the ${limit} limit. It would post as a ${parts}-part thread.`);
    }
  }

  if (/https?:\/\//.test(posts[0] ?? '') && (platform === 'x' || platform === 'linkedin')) {
    notes.push('A link in the first post tends to reach fewer people on this platform. Putting it in a reply or the comments is the usual workaround.');
  }

  if (notes.length === 0) return null;
  return (
    <ul className="mt-5 flex flex-col gap-2">
      {notes.map((note) => (
        <li key={note} className="flex gap-2.5 text-[12.5px] leading-relaxed text-white/50">
          <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-white/30" />
          {note}
        </li>
      ))}
    </ul>
  );
}
