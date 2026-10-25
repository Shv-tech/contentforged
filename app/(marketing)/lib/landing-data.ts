// lib/landing-data.ts
// Copy and content for the Forge landing page.
//
// Editorial rules for this file:
//   - Say it once, plainly. Calm and certain beats loud and clever.
//   - Every number must be true today (the tool count, real prices, real users).
//   - No quotes, logos or results that didn't happen.

import { CHAT_TOOLS, TOOL_GROUPS, type ToolGroup } from '@/lib/forge/entitlements';

export interface HeroData {
  headlineLines: string[];
  subheadline: string;
  ctaPrimary: string;
  ctaSecondary: string;
  /** Set to a real screen recording (e.g. '/assets/forge-demo.mp4') to replace the coded demo. */
  recordingSrc?: string;
  // Kept optional so older imports keep compiling; intentionally empty.
  eyebrow?: string;
  trustStrip?: string[];
  socialProofLabel?: string;
  logos?: { name: string; src: string; displayName: string }[];
}

export const HERO: HeroData = {
  headlineLines: ['AI content that', 'actually sounds like you.'],
  subheadline: 'Forge learns your voice, writes in it, and tells you when a post isn’t ready yet.',
  ctaPrimary: 'Start free',
  ctaSecondary: 'Grade a hook',
  recordingSrc: undefined,
};

/** What the coded hero demo types and writes. Replace with a real recording when you have one. */
export const HERO_DEMO = {
  prompt: 'A LinkedIn post about getting our first 60 users',
  response: [
    'Two Product Hunt launches. 900 ad views. Zero signups.',
    'Then we stopped explaining the product and started showing it.',
    'Here’s what got our first 60 users, and what didn’t.',
  ],
  score: 42,
  verdict: 'Ready to post',
  scheduled: 'Scheduled for Thursday, 9:00',
};

// ─── The difference (replaces the old Problem + Architecture sections) ───

export interface Pillar {
  label: string;
  instead: string;
  title: string;
  body: string;
}

export const PRODUCT_SECTION = {
  heading: ['Most AI writes for everyone.', 'Forge writes for you.'],
  subheading: 'Three things general-purpose AI doesn’t do. They’re why your fiftieth session is better than your first.',
};

export const PILLARS: Pillar[] = [
  {
    label: 'Memory',
    instead: 'Other tools start from zero every time.',
    title: 'It remembers you.',
    body: 'Your first session builds your Brand DNA: your niche, your audience, the hooks that work for you and the ones that don’t. Every session after starts from there.',
  },
  {
    label: 'Honesty',
    instead: 'Other tools agree with everything you write.',
    title: 'It tells you the truth.',
    body: 'Forge grades a draft before you publish and says what’s weak, with the fix. It won’t polish a weak idea into a confident one.',
  },
  {
    label: 'Learning',
    instead: 'Other tools are the same on day 300 as on day one.',
    title: 'It learns what works.',
    body: 'Share your analytics and Forge works out why your best post landed and your worst one didn’t, then writes with that in mind.',
  },
];

// ─── Live grader ───

export const LIVE_GRADER = {
  heading: ['Paste a hook.', 'See what Forge thinks.'],
  subheading: 'The first line decides whether anyone reads the rest. Try the Stop-Scroll Grader on yours. No account needed.',
  placeholder: 'Paste the first line of your next post',
  cta: 'Grade it',
  fallbackHref: '/tools/tweet-hook-generator',
  /**
   * POST { hook: string } → { score: number (0-50), verdict: string,
   *   weakest?: string, rewrite?: string, breakdown?: { label: string; score: number (0-10) }[] }
   * Return 429 when a visitor hits the free limit. See app/api/public/grade-hook/route.ts.
   */
  endpoint: '/api/public/grade-hook',
};

export const GRADER_DEMO = {
  cardLabel: 'Stop-Scroll Grader',
  hookText:
    'The model scored 94% on the benchmark. The benchmark was designed by the same lab that built the model. I’ll leave the rest to you.',
  badge: 'Curiosity gap',
  scores: [
    { label: 'Pattern interrupt', score: '9/10', width: '90%' },
    { label: 'Curiosity gap', score: '9.5/10', width: '95%' },
    { label: 'Emotional charge', score: '8/10', width: '80%' },
    { label: 'Specificity', score: '8.5/10', width: '85%' },
    { label: 'Shareability', score: '9/10', width: '90%' },
  ],
  verdict: 'Ready to post',
  caption: 'An example: 44 out of 50. For a 31, Forge shows you exactly what has to change.',
};

// ─── Voice (the light section) ───

export const VOICE_SECTION = {
  heading: 'Same idea. Your voice.',
  subheading: 'An example of one idea written twice: once by a general-purpose assistant, once by Forge with a Brand DNA.',
  before: {
    label: 'General-purpose AI',
    text: 'In today’s fast-paced digital landscape, consistency is the key to unlocking your brand’s full potential. Here are 5 tips to help you stay consistent and grow your audience!',
  },
  after: {
    label: 'Forge, with your Brand DNA',
    text: 'I posted every day for a month and gained twelve followers. Then I posted three times a week, only when I had something to say. Here’s what changed.',
  },
};

// ─── Tools ───

export interface Tool {
  number: string;
  name: string;
  description: string;
}

export interface ToolCategory {
  name: string;
  tools: Tool[];
}

export const TOOL_ARSENAL_SECTION = {
  heading: [`${CHAT_TOOLS.length + 1} tools.`, 'One workspace.'],
  subheading: 'Each one does a single job well, and every one of them already knows your voice.',
};

/**
 * The landing page's tool list is generated from the same table the app's
 * tool menu and the chat route's plan gates use (lib/forge/entitlements), so
 * the marketing page can never list a tool the product does not have, or
 * put one on the wrong plan. The Calendar Agent works in every chat rather
 * than as a menu tool, so it is added here.
 */
const CALENDAR_AGENT = {
  id: 'calendar_agent',
  name: 'Calendar Agent',
  description: 'Reads your calendar, picks the dates and plans the next 90 days of posts.',
};

const CATEGORY_LABELS: Record<ToolGroup, string> = {
  Essentials: 'Free',
  Creator: 'Starter',
  Pro: 'Pro',
};

const ORDERED = [
  ...CHAT_TOOLS.filter((t) => t.group === 'Essentials').map((t) => ({ id: t.id, name: t.name, description: t.description, group: t.group })),
  { ...CALENDAR_AGENT, group: 'Essentials' as ToolGroup },
  ...CHAT_TOOLS.filter((t) => t.group !== 'Essentials').map((t) => ({ id: t.id, name: t.name, description: t.description, group: t.group })),
];

const NUMBERED = ORDERED.map((tool, index) => ({ ...tool, number: String(index + 1).padStart(2, '0') }));

export const TOOL_CATEGORIES: ToolCategory[] = TOOL_GROUPS.map((group) => ({
  name: CATEGORY_LABELS[group],
  tools: NUMBERED.filter((tool) => tool.group === group).map(({ number, name, description }) => ({ number, name, description })),
}));

/** Shown first on the landing page; the rest sit behind "See all". */
export const FEATURED_TOOLS = ['hook_grader', 'viral_hook', 'ghostwriter', 'omni_channel', 'calendar_agent', 'war_room']
  .map((id) => NUMBERED.find((tool) => tool.id === id)?.number)
  .filter((n): n is string => Boolean(n));

export const TOOL_COUNT = NUMBERED.length;

// ─── Who it's for ───

export interface UseCaseTab {
  id: string;
  audience: string;
  headline: string;
  body: string;
  features: string[];
}

export const USE_CASES_SECTION = {
  heading: ['Built for people', 'who post for a living.'],
};

export const USE_CASES: UseCaseTab[] = [
  {
    id: 'creators',
    audience: 'Creators',
    headline: 'You have the ideas. Forge helps them land.',
    body: 'Your Brand DNA is set up in the first session. Every post is graded before it goes out, and your calendar is planned ahead.',
    features: ['Brand DNA from session one', 'Every draft graded before posting', 'Up to 90 days planned ahead'],
  },
  {
    id: 'ghostwriters',
    audience: 'Ghostwriters and agencies',
    headline: 'Eight clients. Eight voices. None of them yours.',
    body: 'Each client gets a separate Brand DNA, so voices never bleed into each other and drafts need fewer revisions.',
    features: ['Separate Brand DNA per client', 'Voice matching down to sentence rhythm', 'Flags off-voice drafts before delivery'],
  },
  {
    id: 'founders',
    audience: 'Founders',
    headline: 'Your content is your distribution.',
    body: 'Turn what you already know into posts that explain it well, and plan launch content months ahead.',
    features: ['Technical depth without the jargon', 'Launch campaigns planned 90 days out', 'Competitor and trend analysis'],
  },
  {
    id: 'enterprise',
    audience: 'Teams',
    headline: 'Many writers. One voice.',
    body: 'A shared Brand DNA keeps every team member on-voice, and what works for one team is learned by all of them.',
    features: ['Shared Brand DNA across the team', 'Shared performance learning', 'Campaigns planned up to 12 months ahead'],
  },
];

// ─── How it works ───

export interface HowItWorksStep {
  number: string;
  title: string;
  body: string;
  timeLabel: string;
}

export const HOW_IT_WORKS_SECTION = {
  heading: ['Three steps.', 'The first takes ten minutes.'],
};

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    number: '01',
    title: 'Tell Forge who you are',
    body: 'Five questions build your Brand DNA: your niche, what you believe, who you admire, what flopped, and what worked.',
    timeLabel: 'About 10 minutes, once.',
  },
  {
    number: '02',
    title: 'Write with it',
    body: 'Every tool starts from your Brand DNA, so the first draft already sounds like you.',
    timeLabel: 'First draft in under a minute.',
  },
  {
    number: '03',
    title: 'Let it learn',
    body: 'Bring your analytics now and then. Forge works out what landed and writes with it from then on.',
    timeLabel: 'About 5 minutes each time.',
  },
];

// ─── Built in public ───

export const FOUNDER_NOTE = {
  text:
    'I built Forge because every AI tool I tried made me sound like everyone else. It has 60 users today. I’m giving it 30 days, in public, to find out whether it deserves more. If you try it, tell me what’s wrong with it. That’s the most useful thing you can do.',
  signature: 'Senku, founder',
  handle: 'https://x.com/senkuisme',
};

// ─── Methodology (kept for the /methodology page; not shown on the landing page) ───

export interface PsychologyCard {
  name: string;
  description: string;
}

export const PSYCHOLOGY_SECTION = {
  heading: 'Content either stops people or it doesn’t exist.',
  subheading: 'Forge writes with nine well-known principles of attention, and names the one it used in every draft.',
};

export const PSYCHOLOGY_MECHANISMS: PsychologyCard[] = [
  { name: 'Open loops', description: 'People want to finish what they start. A good hook opens a question the post answers.' },
  { name: 'Identity', description: 'Posts that speak to who someone is stop them faster than posts about what they do.' },
  { name: 'Honest failure', description: 'Admitting what went wrong builds more trust than announcing what went right.' },
  { name: 'Specificity', description: '“Three years and two months” is more believable than “a long time.”' },
  { name: 'Future pacing', description: 'Let the reader picture the outcome before you explain how.' },
  { name: 'Contrast', description: 'A clear before makes the after feel earned.' },
  { name: 'Status', description: 'People share what makes them look thoughtful. Write for the person who shares.' },
  { name: 'Belonging', description: 'Naming a specific group makes its members feel seen.' },
  { name: 'Curiosity', description: 'Give enough to make them need the rest, never the whole answer up front.' },
];

// ─── FAQ ───

export interface FAQItem {
  q: string;
  a: string;
}

export const FAQ_SECTION = {
  heading: ['Questions', 'worth asking.'],
};

export const FAQS: FAQItem[] = [
  {
    q: 'Is this just a prompt on top of ChatGPT or Claude?',
    a: 'No. The model is the engine. Forge is everything around it: memory that persists between sessions, 24 purpose-built tools, a calendar agent, and a learning loop that uses your analytics.',
  },
  {
    q: 'How is it different from asking ChatGPT?',
    a: 'ChatGPT doesn’t know your audience, your best hooks or what happened to your last ten posts. Forge does, and uses it every time.',
  },
  {
    q: 'Does my Brand DNA really persist?',
    a: 'Yes. It’s built once and stays, and it updates whenever you share new results. It never resets.',
  },
  {
    q: 'Can it keep several clients’ voices separate?',
    a: 'Yes. Each workspace has its own Brand DNA, and nothing crosses between them.',
  },
  {
    q: 'Is my data private?',
    a: 'Your Brand DNA, drafts and analytics are isolated to your account with database-level security. Your data isn’t used for training.',
  },
  {
    q: 'What happens if I cancel?',
    a: 'Cancel from settings in one click. You keep access until the end of the period you’ve paid for, and your data stays available for 30 days.',
  },
];

// ─── Pricing ───

export interface PricingTier {
  id: string;
  name: string;
  tagline: string;
  price: number | string;
  billingNote: string;
  badge?: string;
  highlighted?: boolean;
  features: string[];
  ctaLabel: string;
  ctaType: 'checkout' | 'contact';
  finePrint: string;
}

export const PRICING_SECTION = {
  heading: ['Simple pricing.', 'Upgrade when it’s working.'],
  subheading: 'Every plan has a short-term allowance and a monthly total. No overage charges.',
  saleBanner: 'Launch pricing, kept for as long as you stay subscribed.',
  guarantee: {
    title: 'Cancel in one click',
    body: 'Cancel any time from your account. You keep full access until the end of the period you’ve paid for.',
  },
};

export const PRICING_TIERS: PricingTier[] = [
  {
    // Must match PlanId in lib/billing/plans.ts and the plan_id enum in Postgres.
    id: 'starter',
    name: 'Starter',
    tagline: 'For getting started.',
    price: 9,
    billingNote: 'a month',
    features: ['About 210 generations a month', 'Allowance resets every 4 hours', '2 ebooks a month', 'Brand DNA up to 20,000 characters'],
    ctaLabel: 'Choose Starter',
    ctaType: 'checkout',
    finePrint: 'Cancel anytime from settings.',
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For posting every week.',
    price: 20,
    billingNote: 'a month',
    highlighted: true,
    features: ['About 1,050 generations a month', 'Allowance resets every 5 hours', '12 ebooks a month', 'Full Brand DNA memory', 'Profile sync and analytics learning', 'Calendar agent and War Room'],
    ctaLabel: 'Choose Pro',
    ctaType: 'checkout',
    finePrint: 'Cancel anytime from settings.',
  },
  {
    id: 'agency',
    name: 'Agency',
    tagline: 'For teams posting daily.',
    price: 39,
    billingNote: 'a month',
    features: ['About 1,890 generations a month', 'Allowance resets every 5 hours', '25 ebooks a month', 'Everything in Pro', 'Priority queue'],
    ctaLabel: 'Choose Agency',
    ctaType: 'checkout',
    finePrint: 'Volume and annual terms on request.',
  },
  {
    // No matching PlanId on purpose: Enterprise never reaches checkout.
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    billingNote: 'Built around your volume',
    tagline: 'For organisations with custom needs.',
    features: ['Custom volume', 'A dedicated contact', 'Custom Brand DNA models', 'Private deployment', 'SLA and priority support'],
    ctaLabel: 'Talk to us',
    ctaType: 'contact',
    finePrint: 'Annual contracts.',
  },
];

// ─── Final call to action ───

export const FINAL_CTA = {
  heading: ['Make your next post', 'sound like you.'],
  subheading: 'Free to start. Your Brand DNA is ready after the first session. Cancel anytime.',
  ctaPrimary: 'Start free',
};
