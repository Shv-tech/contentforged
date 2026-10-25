// app/page-metadata.ts 
// (or lib/seo-metadata.ts)

import { Metadata } from 'next';

const BASE_URL = 'https://forgeyourway.dev';

export const landingMetadata: Metadata = {
  title: 'Forge: AI content that sounds like you',
  description:
    'Forge learns your voice, writes in it, grades every draft before you post, and plans up to 90 days of content. 24 tools in one workspace for creators, ghostwriters and teams.',
  alternates: {
    canonical: BASE_URL,
  },
  openGraph: {
    title: 'Forge: AI content that sounds like you',
    description:
      'Brand DNA memory, a grader that scores your hook before you post, and a calendar agent that plans 90 days ahead. 24 tools, one workspace.',
    url: BASE_URL,
    type: 'website',
    images: [
      {
        url: `${BASE_URL}/og-image.jpg`,
        width: 1200,
        height: 630,
        alt: 'Forge: AI content that sounds like you',
        type: 'image/jpeg',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Forge: AI content that sounds like you',
    description:
      'Brand DNA memory, a grader that scores your hook before you post, and a calendar agent that plans 90 days ahead. 24 tools, one workspace.',
    images: [`${BASE_URL}/og-image.jpg`],
  },
};

// ── Tool-specific page metadata (for individual tool pages) ─────────────────

export const toolPageMetadata: Record<string, Metadata> = {
  'stop-scroll-grader': {
    title: 'Stop-Scroll Grader — AI Content Scoring Tool | Forge',
    description:
      'Grade your LinkedIn, Twitter, and Instagram content against platform-specific psychological rubrics. Get an exact score out of 50 and a full rewrite with every fix applied. Free to try.',
    alternates: { canonical: `${BASE_URL}/tools/stop-scroll-grader` },
  },
  'brand-dna': {
    title: 'Brand DNA Protocol — Permanent AI Memory for Your Content Voice | Forge',
    description:
      'Forge extracts your complete content identity in one session and remembers it forever. Every post is built around your specific strategic fingerprint — niche, audience triggers, hook style, dead zones.',
    alternates: { canonical: `${BASE_URL}/tools/brand-dna` },
  },
  'calendar-agent': {
    title: 'AI Content Calendar Agent — Plan 90 Days of Content Automatically | Forge',
    description:
      'Tell Forge about your launch or campaign. It reads your existing schedule, computes exact dates, and creates a complete multi-platform content plan. One email. One Google Calendar link.',
    alternates: { canonical: `${BASE_URL}/tools/calendar-agent` },
  },
  'viral-hook-generator': {
    title: 'Viral Hook Generator — 10 Psychological Trigger Types | Forge',
    description:
      'Generate 10 stop-scroll hooks across Identity Threat, Social Proof Inversion, Specificity Bomb, Curiosity Gap, and 6 more proven psychological triggers. Each labeled with mechanism and ranked by stop-scroll probability.',
    alternates: { canonical: `${BASE_URL}/tools/viral-hook-generator` },
  },
  'ghostwriter-clone': {
    title: 'AI Ghostwriter Voice Clone — Syntactic-Level Voice Replication | Forge',
    description:
      'The only AI ghostwriting tool that operates at the syntactic level. Cadence mapping, vocabulary fingerprinting, punchline placement analysis. Produces content indistinguishable from the original voice.',
    alternates: { canonical: `${BASE_URL}/tools/ghostwriter-clone` },
  },
  'ebook-writer': {
    title: 'AI Ebook Writer — Complete Manuscripts, Not Bullet Points | Forge',
    description:
      'Forge writes complete ebooks at the level of a high-end masterclass. Named frameworks, tactical checklists, executable scripts — every chapter. No placeholders. No filler.',
    alternates: { canonical: `${BASE_URL}/tools/ebook-writer` },
  },
};