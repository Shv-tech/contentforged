// lib/landing-data.ts
// Static copy + content for the ContentForge landing page.
// Pulled out of JSX so components stay focused on layout/motion, not strings.
// Icon fields reference lucide-react export names — components resolve them
// via the ICONS map pattern (see components/landing/icon-map.ts).

export interface HeroData {
  eyebrow: string;
  headlineLines: string[]; // rendered line by line, last line gets accent color
  subheadline: string;
  ctaPrimary: string;
  ctaSecondary: string;
  trustStrip: string[];
  socialProofLabel: string;
  logos: { name: string; src: string; displayName: string }[];
  proofQuote: { quote: string; name: string; title: string };
  floatingCards: { label: string; quote: string; tone: 'warn' | 'flag' | 'pattern' }[];
}

export const HERO: HeroData = {
  eyebrow: '',
  headlineLines: ['Your AI validates your ideas.', 'Forge fixes them.'],
  subheadline:
    "ContentForge is content intelligence that remembers your Brand DNA, learns from your performance data, plans your next 90 days of content, and tells you when something is weak before you publish it.",
  ctaPrimary: 'Start Forging Free',
  ctaSecondary: 'See how it works',
  trustStrip: [
    '26 Specialized Tools',
    'Brand DNA Memory',
    'Calendar Agent',
    'Performance Intelligence',
    '40+ Countries',
  ],
  socialProofLabel: 'Creators and teams from companies like these use ContentForge',
   
  logos: [
    { name: 'Notion', src: '/logos/notion.svg', displayName: 'Notion' },
    { name: 'Beehiiv', src: '/logos/beehiive.svg', displayName: 'Beehiiv' },
    { name: 'Webflow', src: '/logos/webflow.svg', displayName: 'Webflow' },
    { name: 'Gumroad', src: '/logos/gumroad.svg', displayName: 'Gumroad' },
    { name: 'Lemon Squeezy', src: '/logos/lemon-squeezy.svg', displayName: 'Lemon Squeezy' },
    { name: '', src: '', displayName: 'Morning Brew' },
    { name: 'IndieHackers', src: '/logos/indiehackers.svg', displayName: 'IndieHackers' },
    { name: 'Product Hunt', src: '/logos/product-hunt.svg', displayName: 'Product Hunt' },
  ],

  proofQuote: {
    quote: 'The tool that actually pushed back and made the post better.',
    name: 'Marcus Webb',
    title: 'Growth Consultant',
  },
  floatingCards: [
    {
      label: 'HOOK ANALYSIS',
      quote:
        'That hook is weak. It takes too long to get to the point. Cut the first sentence entirely and start directly with the core conflict.',
      tone: 'warn',
    },
    {
      label: 'RULE VIOLATED',
      quote: 'Using profanity as a gimmick signals weak content. Virality comes from tension, not cheap tricks.',
      tone: 'flag',
    },
    {
      label: 'PATTERN DETECTED',
      quote: 'Your last 4 posts opened with a question. Your audience has been trained past it. Switch to a declaration.',
      tone: 'pattern',
    },
  ],
};

export interface ProblemCard {
  num: string;
  title: string;
  body: string;
}

export const PROBLEM_SECTION = {
  eyebrow: 'THE PROBLEM',
  heading: ["The tool you're using right now", 'is making you generic.'],
  subheading:
    'ChatGPT, Gemini, every major AI writer they were built to be helpful to everyone. That makes them useless for anyone who needs to stand out.',
};

export const PROBLEMS: ProblemCard[] = [
  {
    num: '01',
    title: 'It forgets you. Every single time.',
    body: 'Every session starts from zero. No memory of your brand voice, your best-performing hooks, what resonated last month, or what your audience actually responds to. You spend 20% of every conversation re-explaining who you are. Then you do it again tomorrow.',
  },
  {
    num: '02',
    title: 'It tells you what you want to hear.',
    body: 'ChatGPT and Gemini were trained to validate, agree, and polish. They make your weak ideas sound professional. That is the most dangerous thing a content tool can do. A bad idea delivered with confidence still performs like a bad idea.',
  },
  {
    num: '03',
    title: 'Generic content is invisible content.',
    body: 'When every creator uses the same model with the same prompts, every creator produces the same content. Same hooks. Same structures. Same strategic advice. The output is indistinguishable which means it is skipped.',
  },
  {
    num: '04',
    title: 'It has no memory of what worked.',
    body: 'Your last post hit 40,000 impressions. Your AI does not know. Your next post will be built exactly like every post before it no data, no pattern recognition, no learning. The tool is the same on day one as it is on day three hundred.',
  },
];

export interface ArchitecturePillar {
  iconLabel: string;
  icon: 'Fingerprint' | 'TrendingUp' | 'GitBranch';
  title: string;
  body: string;
  proofLine: string;
}

export const ARCHITECTURE_SECTION = {
  eyebrow: 'THE DIFFERENCE',
  heading: ['ContentForge is not an AI writer.', 'It is a content operating system.'],
  subheading:
    'Three architectural decisions that no other tool has made. Each one is the reason your 50th session with Forge is measurably better than your first.',
};

export const ARCHITECTURE_PILLARS: ArchitecturePillar[] = [
  {
    iconLabel: 'MEMORY',
    icon: 'Fingerprint',
    title: 'Forge knows who you are.',
    body: 'On your first session, Forge runs a Brand DNA extraction 5 questions that build your permanent strategic fingerprint. Your niche. Your audience\u2019s proven emotional triggers. Your highest-converting hook style. Your dead zones. Every session after that is built on this foundation. It never starts from zero. It compounds.',
    proofLine: 'Unlike ChatGPT, Forge never asks who you are twice.',
  },
  {
    iconLabel: 'INTELLIGENCE',
    icon: 'TrendingUp',
    title: 'Forge learns what works for you.',
    body: 'Feed Forge your analytics. It runs a full Performance Autopsy isolating exactly why your best post won, why your worst post died, and what the replication pattern looks like. Those findings are encoded into every future piece of content it generates for you. Your performance data becomes your competitive advantage.',
    proofLine: 'The tool gets measurably better the longer you use it.',
  },
  {
    iconLabel: 'AGENCY',
    icon: 'GitBranch',
    title: 'Forge acts on your behalf.',
    body: 'Tell Forge you have a product launch in three months. It reads your calendar, checks what is already scheduled, computes every date, and builds a complete 90-day content plan across every platform. Everything is scheduled. You receive a confirmation email with the full plan and a Google Calendar link.',
    proofLine: 'This is not a chatbot. This is an agent.',
  },
];

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
  eyebrow: 'THE ARSENAL',
  heading: ['26 precision-built tools.', 'One workspace.'],
  subheading:
    "Every tool engineered for a specific job at a level of depth that general-purpose AI cannot match. This is what $40 a month buys. Not access to a model. Access to a system.",
};

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    name: 'ESSENTIALS',
    tools: [
      {
        number: '01',
        name: 'Native Formatter',
        description:
          'Platform-specific visual architecture. Cognitive load theory applied to every paragraph. Produces the reading experience, not just the words.',
      },
      {
        number: '02',
        name: 'Shadowban Checker',
        description:
          'Reach suppression forensics. Every flagged phrase, every NLP trigger, every algorithm penalty identified and replaced with a bypass that preserves your meaning without losing your reach.',
      },
      {
        number: '03',
        name: 'Readability Simplifier',
        description:
          'The Hemingway-Ogilvy distillation engine. Removes 40% of the word count without losing a single unit of meaning. Used by executives who need their ideas to land, not impress.',
      },
    ],
  },
  {
    name: 'PRO CREATOR',
    tools: [
      {
        number: '04',
        name: 'Stop-Scroll Grader',
        description:
          'Algorithm simulator. Grades your content against the exact psychological and structural demands of your platform. Score of 4 or below means the algorithm will not push it. You get the exact fix, not a suggestion.',
      },
      {
        number: '05',
        name: 'Image-to-Text (OCR)',
        description:
          'Signal extraction from raw visual data. Transcribes, synthesizes, finds the three highest-leverage angles buried in any screenshot, document, or image then writes the hook.',
      },
      {
        number: '06',
        name: 'Zero-Cost Outreach',
        description:
          'The $100K cold email architecture. Triad Protocol: Non-obvious observation, value bridge, curiosity close. Three complete sequences per session. Tested against the seven reasons cold emails fail.',
      },
      {
        number: '07',
        name: 'Viral Hook Generator',
        description:
          'Ten psychological trigger types per session. Identity Threat. Social Proof Inversion. Specificity Bomb. Curiosity Gap. Contrarian Declaration. Every hook labeled with its mechanism and ranked by estimated stop-scroll probability.',
      },
      {
        number: '08',
        name: 'A/B Test Simulator',
        description:
          'Audience tension mapping. Two psychographic personas The Believer and The Skeptic run against your content simultaneously. Identifies the exact sentence that will generate the most controversy.',
      },
      {
        number: '09',
        name: 'Tone Calibrator',
        description:
          'Four emotional frequencies per piece. Aggressive and Contrarian. Vulnerable and Authentic. Analytical and Data-driven. Satirical and Mocking. Full rewrites in all four.',
      },
    ],
  },
  {
    name: 'Pro Plus',
    tools: [
      {
        number: '10',
        name: 'Agentic Ebook Writer',
        description:
          'Complete manuscripts, not bullet points. Writes at the level of a $2,000 masterclass every chapter containing at least one proprietary named framework, one tactical checklist, and one executable script.',
      },
      {
        number: '11',
        name: 'Ghostwriter Clone',
        description:
          'Voice replication at syntactic level. Cadence mapping. Lexicon fingerprinting. Punchline placement analysis. Tested against the exact question: "Would their most observant follower notice a difference?"',
      },
      {
        number: '12',
        name: 'Brand DNA Enforcer',
        description:
          'Reputation risk and identity drift detection. Five threat vectors: Legal liability, PR misinterpretation, audience mismatch, brand DNA drift, competitor ammunition. Every piece scored and cleared.',
      },
      {
        number: '13',
        name: 'Competitor Gap Analyzer',
        description:
          'Narrative void detection. Five-layer autopsy of competitor content to find the emotional and intellectual territory they are leaving undefended. Delivers a three-post kill-shot sequence.',
      },
      {
        number: '14',
        name: 'Trend Forecaster',
        description:
          'Lifecycle positioning and contrarian timing. Identifies where a trend sits on its curve Emergence, Early Adoption, Peak, Saturation, Backlash, Rebound and which position to take.',
      },
      {
        number: '15',
        name: 'B2B Case Study Builder',
        description:
          'The Revenue Dramatist framework. Transforms client data into a narrative arc the bleeding neck, the architecture, the ROI explosion. Every metric bolded. The math made emotional.',
      },
      {
        number: '16',
        name: 'SEO Content Clusters',
        description:
          'Topical authority and semantic dominance. Pillar keyword, ten hyper-specific long-tail questions, and the internal linking narrative that connects all eleven pieces into one system.',
      },
      {
        number: '17',
        name: 'Lead Funnel Architect',
        description:
          'Full-stack conversion pipeline. Content attractor, lead magnet, five-email conversion sequence, and sales page architecture written completely, not outlined.',
      },
      {
        number: '18',
        name: 'Video Script Storyboarder',
        description:
          'Retention engineering by timestamp. Two-column storyboard: visual direction and audio script. Hook, retention hook, credibility moment, core content, pattern interrupt, payoff, CTA.',
      },
      {
        number: '19',
        name: 'Press Release Generator',
        description:
          'Institutional authority format. Inverted pyramid structure. The lead, the visionary CEO quote, the industry context. Zero marketing hype.',
      },
      {
        number: '20',
        name: 'Crisis Spindoctor',
        description:
          'Reputational surgery protocol. Immediate radical ownership. Error reframed as operational learning. Three structural changes announced. Zero defensiveness.',
      },
      {
        number: '21',
        name: 'Ad Copy Multi-Variate',
        description:
          'Ten psychological variants per run. Pain Avoidance. Status Seeking. Curiosity. Loss Aversion. Social Proof. FOMO. Identity Alignment. Authority Transfer. Scarcity. Aspiration.',
      },
      {
        number: '22',
        name: 'Omni-Channel Repurposer',
        description:
          'One idea, five platforms, zero repetition. LinkedIn gets the narrative. Twitter gets the friction. Instagram gets the emotion. Newsletter gets the depth. Reels get the hook.',
      },
    ],
  },
  {
    name: 'Enterprise',
    tools: [
      {
        number: '23',
        name: 'Calendar Agent',
        description:
          'Full read/write access to your content schedule. Brief Forge on any goal and it reads your existing schedule, computes every specific date, and creates a complete plan across every platform.',
      },
      {
        number: '24',
        name: 'War Room (Omni-Swarm Terminal)',
        description:
          'Multi-agent strategy mode. Four specialized intelligences The Architect, The Viralist, The Ghostwriter, The Logistician — executing simultaneously on your most complex strategic brief.',
      },
    ],
  },
];

export interface UseCaseTab {
  id: string;
  audience: string;
  headline: string;
  body: string;
  features: string[];
}

export const USE_CASES_SECTION = {
  eyebrow: "WHO IT'S BUILT FOR",
  heading: ['Built for the people', 'the algorithm actually rewards.'],
};

export const USE_CASES: UseCaseTab[] = [
  {
    id: 'creators',
    audience: 'Solo Creators',
    headline:
      "You have the ideas. You've been losing to people with worse ones because they have better execution.",
    body: 'Forge builds your Brand DNA in session one. Every post is scored before you publish. Your calendar is managed so you never miss a content window. The gap between what you think and what you publish closes permanently.',
    features: [
      'Brand DNA built and stored in session one',
      'Every post scored against platform algorithm before publishing',
      'Content calendar planned up to 90 days in advance',
      'Performance Autopsy after every analytics report',
      'Hook alternatives generated on every piece',
    ],
  },
  {
    id: 'ghostwriters',
    audience: 'Ghostwriters and Agencies',
    headline: 'You are managing eight clients. You cannot be eight different people. Forge can.',
    body: 'Each workspace stores a separate Brand DNA. The Voice Clone tool operates at syntactic level cadence ratios, lexicon fingerprinting, punchline placement. Your clients stop asking for revisions because the content sounds like them.',
    features: [
      'Separate Brand DNA per client, never contaminated',
      'Voice Clone at syntactic level, not just tone',
      'Bulk content calendar planning per client',
      'Brand DNA Enforcer flags identity drift before delivery',
      'Omni-Channel Repurposer multiplies every approved idea',
    ],
  },
  {
    id: 'founders',
    audience: 'Founders and Startups',
    headline: 'You are building a company and an audience at the same time. Most founders treat these as separate.',
    body: 'Your content is your distribution. Forge understands technical depth and knows the founders who win are the ones who can translate ideas into content that stops scrolls. Your launch content is planned months in advance.',
    features: [
      'Technical authority without academic tone',
      'Launch campaigns planned 90 days out',
      'Competitor Gap analysis before entering any conversation',
      'Trend Forecasting to position ahead of the narrative',
      'Brand DNA Enforcer keeps voice consistent across growth',
    ],
  },
  {
    id: 'enterprise',
    audience: 'Enterprise and Marketing Teams',
    headline: 'Your team produces a large volume of content. Very little of it compounds.',
    body: 'Centralized Brand DNA across the entire team means every piece sounds like it came from one coherent voice. Performance intelligence is shared, not siloed. The calendar agent handles campaign planning.',
    features: [
      'Centralized Brand DNA across all team members',
      'Shared performance intelligence the team learns together',
      'Campaign calendar planning for up to 12 months',
      'Brand DNA Enforcer with legal and PR risk scanning',
      'Multi-client workspace management',
    ],
  },
];

export interface HowItWorksStep {
  number: string;
  title: string;
  body: string;
  timeLabel: string;
}

export const HOW_IT_WORKS_SECTION = {
  eyebrow: 'HOW IT WORKS',
  heading: ['Three sessions.', 'You will never work the same way again.'],
};

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    number: '01',
    title: 'Brand DNA Extraction',
    body: 'Your first session is different from every other AI tool you have ever used. Forge asks five questions to build your permanent strategic fingerprint. Niche. Contrarian belief. Benchmark account. Biggest failure. Your best-performing content.',
    timeLabel: 'Takes about 10 minutes. Lasts forever.',
  },
  {
    number: '02',
    title: 'Produce at Precision',
    body: 'Twenty-six specialized tools, each built for a specific job at a depth general-purpose AI cannot reach. Forge already knows who you are, what your audience responds to, and what your dead zones are.',
    timeLabel: 'First output in under 60 seconds.',
  },
  {
    number: '03',
    title: 'Feed It. Watch It Learn.',
    body: 'Bring Forge your analytics. It runs the Performance Autopsy, updates your Brand DNA, and encodes the new patterns into every future generation. The tool you have in six months is materially better than the one you start with.',
    timeLabel: 'Performance loop takes 5 minutes. Gains are permanent.',
  },
];

export interface Testimonial {
  metric: string;
  quote: string;
  name: string;
  title: string;
}

export const TESTIMONIALS_SECTION = {
  eyebrow: 'REAL RESULTS',
  heading: 'They stopped asking for permission.',
};

export const TESTIMONIALS: Testimonial[] = [
  {
    metric: '22K → 34K',
    quote:
      'I gave Forge my last six posts with their analytics. It identified two structural dead zones I was repeating in every piece and told me my highest-converting hook style was appearing in only 15% of my content. I fixed it. My next six posts averaged 34,000 impressions. It is not a writing tool. It is an audit system that also writes.',
    name: 'Arjun Mehta',
    title: 'SaaS Founder, 22K LinkedIn followers',
  },
  {
    metric: '11 clients. Zero voice drift.',
    quote:
      'I manage 11 ghostwriting clients. Before Forge, my clients were getting my voice on a bad day, not their voice on a good one. The Voice Clone feature is the only tool I have found that works at the syntactic level. My clients stopped asking me to revise.',
    name: 'Clara Novak',
    title: 'Independent Ghostwriter',
  },
  {
    metric: '400 → 51,000 impressions',
    quote:
      'Forge told me not to post something. Flagged it as validation-seeking with no friction in the hook. I posted it anyway. It got 400 impressions. My next Forge-approved post got 51,000. I have not overridden it since.',
    name: 'Marcus Webb',
    title: 'Growth Consultant',
  },
  {
    metric: '3 tools replaced. 2 roles eliminated.',
    quote:
      'Our agency runs content for 40 brands across six industries. ContentForge replaced three separate tools and two freelance roles. We brief Forge on a launch and receive a complete three-month plan the same day.',
    name: 'Priya Sharma',
    title: 'Content Director, Webb Creative Agency',
  },
  {
    metric: '4 months. 0 → 18K followers.',
    quote:
      'I had zero social presence and a product to launch. Forge extracted my Brand DNA in session one and built my first 90-day content calendar. Four months later I have 18,000 followers and a waitlist. I did not change the ideas. I changed the execution.',
    name: 'Kenji Watanabe',
    title: 'Indie Founder, ProductHunt #1 Launch',
  },
];

export interface PsychologyCard {
  name: string;
  description: string;
}

export const PSYCHOLOGY_SECTION = {
  eyebrow: 'THE METHODOLOGY',
  heading: "Content either stops people or it doesn't exist.",
  subheading:
    'Forge is built on nine psychological weapons deployed explicitly, labeled by name, in every piece of content it generates.',
};

export const PSYCHOLOGY_MECHANISMS: PsychologyCard[] = [
  {
    name: 'Zeigarnik Effect',
    description:
      'Open loops the brain is physiologically compelled to close. Deployed in every hook Forge writes. The reader cannot leave without finishing.',
  },
  {
    name: 'Identity Threat',
    description:
      'Content that challenges who someone thinks they are stops scrolls completely. Forge identifies when to deploy it and when it crosses into damaging.',
  },
  {
    name: 'Social Proof Inversion',
    description:
      'Admitting failure publicly builds more trust than claiming success ever will. The most underused mechanism in professional content.',
  },
  {
    name: 'Specificity Bias',
    description:
      '"3 years, 2 months, and 12 days" is more credible than "a long time." Forge eliminates vagueness at the sentence level.',
  },
  {
    name: 'Future Pacing',
    description:
      'Letting the reader feel the outcome before they receive the insight. The structure that makes content convert, not just engage.',
  },
  {
    name: 'Contrast Principle',
    description:
      'Show the before state vividly enough that the after state feels transformative. Mapped into every case study and story-based post.',
  },
  {
    name: 'Status Signaling',
    description:
      'People share content that makes them look intelligent, insightful, or ahead of the curve. Forge designs for the sharer, not just the reader.',
  },
  {
    name: 'Tribal Identity',
    description:
      'Content that names a specific ingroup creates instant belonging and sharing velocity. Forge identifies your tribe and writes directly to it.',
  },
  {
    name: 'Curiosity Gap',
    description:
      'Reveal enough to make them need the rest. Never front-load the insight. If the hook gives away the answer, Forge rewrites the hook.',
  },
];

export const GRADER_DEMO = {
  cardLabel: 'STOP-SCROLL GRADER · LIVE SAMPLE',
  hookText:
    "The model scored 94% on the benchmark. The benchmark was designed by the same lab that built the model. I'll leave the rest to you.",
  badge: 'IDENTITY THREAT + CURIOSITY GAP',
  scores: [
    { label: 'Pattern Interrupt', score: '9/10', width: '90%' },
    { label: 'Curiosity Gap', score: '9.5/10', width: '95%' },
    { label: 'Emotional Charge', score: '8/10', width: '80%' },
    { label: 'Tribal Signal', score: '8.5/10', width: '85%' },
    { label: 'Retweetability', score: '9/10', width: '90%' },
  ],
  verdict: 'PUBLISH',
  caption: 'This is what a 44/50 looks like. Forge tells you what a 31/50 needs to become before you publish it.',
};

export interface FAQItem {
  q: string;
  a: string;
}

export const FAQ_SECTION = {
  eyebrow: 'COMMON QUESTIONS',
  heading: ['The questions skeptics ask.', 'Answered honestly.'],
};

export const FAQS: FAQItem[] = [
  {
    q: 'Is this just a system prompt on top of Claude or GPT?',
    a: 'No. ContentForge is a content operating system with persistent cross-session memory, 26 purpose-built tools with specialized deep prompt architecture, a calendar agent with full database read/write access, RAG-powered Brand DNA recall, and a performance intelligence layer that updates with every analytics input. The model is the engine. The infrastructure around it is the product.',
  },
  {
    q: 'How is this different from asking ChatGPT the same question?',
    a: 'ChatGPT has no memory of who you are, your audience, your proven hook styles, your dead zones, or what happened to your analytics last month. ContentForge does. The model is identical. The context is everything.',
  },
  {
    q: 'Does the Brand DNA actually persist across sessions?',
    a: 'Yes. Permanently. Every session after your first is built on your complete strategic fingerprint niche, audience emotional triggers, highest-converting hook styles, dead zones, and Performance Autopsy findings. It updates when you bring new data, it never resets.',
  },
  {
    q: 'Can the calendar agent actually manage my content schedule?',
    a: 'Yes. Full read and write access. Brief Forge on any goal and it reads what is already on your calendar, computes exact dates, and creates a complete content plan across every platform with a confirmation email and a one-click Google Calendar link.',
  },
  {
    q: 'I manage multiple clients as a ghostwriter. Can it keep their voices completely separate?',
    a: 'Yes. Every workspace maintains a completely isolated Brand DNA. The Ghostwriter Clone tool operates at the syntactic level cadence ratios, vocabulary fingerprinting, punchline placement, structural default detection not just tone adjustments.',
  },
  {
    q: 'What platforms does Forge write for?',
    a: 'LinkedIn, Twitter/X, Instagram, TikTok and short-form video, Newsletter and long-form email, and Podcast and YouTube scripts. Platform DNA is baked structurally into every tool, enforced at the system level, not left to the model\u2019s judgment.',
  },
  {
    q: 'Is my Brand DNA and content data private?',
    a: 'Yes. Your Brand DNA, chat history, performance data, and calendar are isolated to your account using row-level security at the database level. No training occurs on your data, and no other user can access your workspace without an explicit invitation.',
  },
  {
    q: 'What happens if I cancel?',
    a: 'Cancel in settings, any time, in one click. No email required, no cancellation form. Your data remains accessible for 30 days after cancellation.',
  },
  {
    q: 'Why does Forge push back on my ideas?',
    a: 'Because that is the job. The most dangerous thing a content tool can do is make a weak idea sound professional. Forge is designed to disagree with you when disagreement is correct and to tell you exactly why, with the precise fix.',
  },
  {
    q: 'What makes the Stop-Scroll Grader different from other AI graders?',
    a: 'The Grader operates from platform-specific rubrics and grades against the actual psychological and structural demands of each algorithm. A score of 4/10 means the algorithm will not push it. The lowest-scoring element gets an exact rewrite, then a Content Tree is generated from the corrected piece.',
  },
];

export const FINAL_CTA = {
  eyebrow: 'START NOW',
  heading: ['Your next post is either', "forgettable or it isn't."],
  subheading:
    'The creators who compound are not smarter than you. They stopped asking their AI to validate their ideas and started using one that tells them the truth. That gap closes today.',
  ctaPrimary: 'Start Forging Free',
  belowCta: 'No card required · Brand DNA built in your first session · Cancel anytime',
  trustSignals: ['26 Specialized Tools', 'Permanent Brand DNA Memory', 'Calendar Agent', '14-Day Money-Back Guarantee'],
};

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
  eyebrow: 'PRICING',
  heading: ['Start forging.', "Scale when it's working."],
  subheading: 'No hidden limits. No surprise usage caps. No "contact sales" for the features you actually need.',
  saleBanner: 'LAUNCH WEEK PRICING · LOCKED IN FOR LIFE ON ANNUAL PLANS',
  guarantee: {
    title: '.',
    body: '.',
  },
};

export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'See what precision feels like.',
    price: 5,
    billingNote: '/ month',
    features: [
      '3 specialized tools: Formatter, Hook Grader, Simplifier',
      'Brand DNA extraction (stored for 7 days)',
      'Platform-native output for LinkedIn and Twitter',
      'No calendar agent',
    ],
    ctaLabel: 'Start for $5',
    ctaType: 'checkout',
    finePrint: 'Cancel anytime in settings. No card lock-in.',
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For creators who are serious about compounding.',
    price: 20,
    billingNote: '/ month',
    badge: 'MOST POPULAR',
    highlighted: true,
    features: [
      'All 24 specialized tools, unlocked',
      'Unlimited chat sessions',
      'Brand DNA memory, permanent and compounding',
      'Performance Intelligence and autopsy reports',
      'Calendar agent up to 100 events per month',
      'All platform outputs: LinkedIn, Twitter, Instagram, Newsletter, Video, TikTok',
      'Priority generation speed',
    ],
    ctaLabel: 'Start Pro — $20/mo',
    ctaType: 'checkout',
    finePrint: 'Cancel anytime in settings. One click. No email required.',
  },
  {
    id: 'Pro Plus',
    name: 'Agency',
    tagline: 'For teams and ghostwriters managing multiple clients.',
    price: 39,
    billingNote: '/ month per seat',
    features: [
      'Everything in Pro',
      'Separate Brand DNA per client up to 25 clients',
      'Voice Clone tool with client fingerprint storage',
      'Shared performance intelligence across team',
      'Unlimited calendar events',
      'Brand DNA Enforcer with legal and PR risk scanning',
      'Team collaboration and session sharing',
      'Priority support with guaranteed response time',
    ],
    ctaLabel: 'Star Pro Plus',
    ctaType: 'contact',
    finePrint: 'Also available: Enterprise contracts, SLA, GDPR DPA, dedicated onboarding.',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    billingNote: 'Tailored to your scale',
    tagline: 'For large organizations requiring custom models, high volume, and dedicated support.',
    features: [
      'Unlimited custom seats',
      'Dedicated Account Manager',
      'Custom Brand DNA models',
      'On-premise / VPC deployment',
      'SLA & Priority Support'
    ],
    ctaLabel: 'Contact Sales',
    ctaType: 'contact',
    finePrint: 'Annual contracts only.',
    highlighted: false,
  }
];
