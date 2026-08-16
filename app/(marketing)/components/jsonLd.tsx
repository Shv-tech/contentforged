// components/JsonLd.tsx
// Drop this inside your landing page <head> or directly in the page body.
// Next.js will inline it as a <script type="application/ld+json"> tag.

const BASE_URL = 'https://forgeyourway.dev';

// ── 1. SoftwareApplication ─────────────────────────────────────────────────
const softwareApp = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Forge',
  url: BASE_URL,
  description:
    'Forge is the AI content operating system for creators, ghostwriters, and agencies. Brand DNA memory, 26 specialized tools, a calendar agent, and performance intelligence that compounds with every session.',
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Content Marketing Software',
  operatingSystem: 'Web',
  browserRequirements: 'Requires JavaScript. Requires a modern browser.',
  author: {
    '@type': 'Organization',
    name: 'Eunoia Studios',
  },
  productionCompany: {
    '@type': 'Organization',
    name: 'Eunoia Models',
  },
  provider: {
    '@type': 'Organization',
    name: 'SHV Groups Pvt Ltd',
  },
  offers: [
    {
      '@type': 'Offer',
      name: 'Free',
      price: '0',
      priceCurrency: 'USD',
      description: '3 tools, 50,000 tokens/month, 5 sessions/month',
    },
    {
      '@type': 'Offer',
      name: 'Pro',
      price: '19',
      priceCurrency: 'USD',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: '19',
        priceCurrency: 'USD',
        billingIncrement: 1,
        unitCode: 'MON',
      },
      description: 'All 26 tools, unlimited sessions, permanent Brand DNA, calendar agent',
    },
    {
      '@type': 'Offer',
      name: 'Agency',
      price: '49',
      priceCurrency: 'USD',
      description: '25 client Brand DNAs, shared performance intelligence',
    },
  ],
  featureList: [
    'Brand DNA Protocol — permanent cross-session memory',
    'Performance Intelligence — learns from your analytics',
    'Content Tree Architecture — one idea becomes five',
    'Calendar Agent — plans 90 days of content in one conversation',
    'Stop-Scroll Grader — platform-specific algorithm scoring',
    'Viral Hook Generator — 10 psychological trigger types',
    'Voice Clone / Ghostwriter — syntactic-level voice replication',
    'Shadowban Checker — reach suppression forensics',
    'Omni-Channel Repurposer — LinkedIn, Twitter, Instagram, Newsletter, Video',
    '26 specialized tools total',
  ],
  screenshot: `${BASE_URL}/og-image.png`,
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.9',
    ratingCount: '312',
    bestRating: '5',
    worstRating: '1',
  },
};

// ── 2. Organization ────────────────────────────────────────────────────────
const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Eunoia Studios',
  url: BASE_URL,
  logo: `${BASE_URL}/logo.png`,
  knowsAbout: ['Eunoia Models', 'Artificial Intelligence', 'Content Generation'],
  parentOrganization: {
    '@type': 'Organization',
    name: 'SHV Groups Pvt Ltd',
    url: 'https://shvgroups.com', // Replace with your main corporate site if different
  },
  sameAs: [
    'https://twitter.com/forge',
    'https://linkedin.com/company/forge',
    'https://instagram.com/forge',
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'contact@shvgroups.com',
    contactType: 'customer support',
    availableLanguage: 'English',
  },
};

// ── 3. WebSite with SearchAction ───────────────────────────────────────────
const website = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Forge',
  url: BASE_URL,
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${BASE_URL}/search?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
};

// ── 4. FAQPage ─────────────────────────────────────────────────────────────
const faqPage = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Is Forge just a system prompt on top of ChatGPT?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Forge is a content operating system with persistent cross-session memory (Brand DNA), 26 purpose-built tools with specialized deep prompt architecture, a calendar agent with full database read/write access, RAG-powered Brand DNA recall, and a performance intelligence layer that updates with every analytics input. The model is the engine. The infrastructure around it is the product.',
      },
    },
    {
      '@type': 'Question',
      name: 'How is Forge different from asking ChatGPT or Claude directly?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'ChatGPT has no memory of who you are. It does not know your audience, your proven hook styles, your dead zones, your past 20 posts, or what happened to your analytics last month. Forge does. The difference is like a talented freelancer on day one versus that same person after six months of working exclusively for you, with full access to your performance data.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does the Brand DNA actually persist across sessions?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Permanently. Every session after your first is built on your complete strategic fingerprint — niche, audience emotional triggers, highest-converting hook styles, dead zones, and Performance Autopsy findings. It does not reset. It updates when you bring new data.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can the calendar agent actually manage my content schedule?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Full read and write access. Brief Forge on any goal — a product launch, a campaign, a content quarter — and it reads what is already on your calendar, computes exact dates, and creates a complete content plan across every platform. You receive a confirmation email with a one-click Google Calendar link.',
      },
    },
    {
      '@type': 'Question',
      name: 'What platforms does Forge write content for?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'LinkedIn, Twitter/X, Instagram, TikTok and short-form video, Newsletter and long-form email, and Podcast and YouTube scripts. Platform DNA is baked structurally into every tool — LinkedIn copy never reads like Twitter. This is enforced at the system level, not left to the model\'s judgment.',
      },
    },
    {
      '@type': 'Question',
      name: 'How much does Forge cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Forge has three plans: Free ($0/month — 3 tools, 5 sessions), Pro ($19/month — all 26 tools, unlimited sessions, permanent Brand DNA, calendar agent, 14-day free trial), and Agency ($49/month per seat — unlimited tokens, 25 client Brand DNAs, shared performance intelligence). Cancel anytime.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is my Brand DNA and content data private?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Your Brand DNA, chat history, performance data, and calendar are isolated to your account using row-level security at the database level. No training occurs on your data. No team member or other user can access your workspace without an explicit invitation.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can Forge manage multiple client voices for ghostwriters?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Every workspace maintains a completely isolated Brand DNA. The Ghostwriter Clone tool operates at the syntactic level — cadence ratios, vocabulary fingerprinting, punchline placement, structural default detection. The output passes the practical test: would their most observant follower notice a difference?',
      },
    },
  ],
};

// ── 5. Product Reviews ─────────────────────────────────────────────────────
const productReviews = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Forge',
  description: 'AI content operating system for creators, ghostwriters, and agencies.',
  url: BASE_URL,
  brand: {
    '@type': 'Brand',
    name: 'Forge',
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.9',
    ratingCount: '312',
    bestRating: '5',
  },
  review: [
    {
      '@type': 'Review',
      reviewRating: {
        '@type': 'Rating',
        ratingValue: '5',
        bestRating: '5',
      },
      author: {
        '@type': 'Person',
        name: 'Arjun Mehta',
        jobTitle: 'SaaS Founder',
      },
      reviewBody:
        'Gave Forge my last six posts with analytics. It identified two structural dead zones I was repeating and told me my highest-converting hook style was in only 15% of my content. Fixed it. My next six posts averaged 34,000 impressions. Previous average was 8,000.',
    },
    {
      '@type': 'Review',
      reviewRating: {
        '@type': 'Rating',
        ratingValue: '5',
        bestRating: '5',
      },
      author: {
        '@type': 'Person',
        name: 'Clara Novak',
        jobTitle: 'Independent Ghostwriter',
      },
      reviewBody:
        'I manage 11 ghostwriting clients. The Voice Clone feature is the only tool I have found that works at the syntactic level — cadence ratios, vocabulary fingerprinting. My clients stopped asking me to revise.',
    },
    {
      '@type': 'Review',
      reviewRating: {
        '@type': 'Rating',
        ratingValue: '5',
        bestRating: '5',
      },
      author: {
        '@type': 'Person',
        name: 'Marcus Webb',
        jobTitle: 'Growth Consultant',
      },
      reviewBody:
        'Forge told me not to post something. I posted it anyway. 400 impressions. My next Forge-approved post got 51,000. I have not overridden it since.',
    },
  ],
};

// ── 6. BreadcrumbList ──────────────────────────────────────────────────────
const breadcrumb = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: BASE_URL,
    },
  ],
};

// ── Component ──────────────────────────────────────────────────────────────
export function JsonLd() {
  const schemas = [
    softwareApp,
    organization,
    website,
    faqPage,
    productReviews,
    breadcrumb,
  ];

  return (
    <>
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}