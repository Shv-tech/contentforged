export type LLMProvider = 'openai' | 'anthropic';

export type Platform =
  | 'linkedin'
  | 'twitter'
  | 'email_newsletter'
  | 'twitter_thread'
  | 'instagram'
  | 'blog_summary';

export interface PlatformOutput {
  platform: Platform;
  posts: string[];
}

export interface GeneratedContent {
  id: string;
  user_id: string;
  input_content: string;
  input_type: string;
  tone: string;
  voice_reference?: string;
  outputs: PlatformOutput[];
  credits_used: number;
  created_at: string;
}

export interface PricingTier {
  id: string;
  name: string;
  price: number;
  credits: number;
  features: string[];
  highlighted?: boolean;
}

export const PRICING: PricingTier[] = [
  {
    id: 'tier1',
    name: 'Starter',
    price: 19,
    credits: 50,
    features: [
      '50 repurposes per month',
      '3 tools included',
      'Basic Formatter & Splitter',
      'Standard Tone Presets',
      'CSV export',
    ],
  },
  {
    id: 'tier2',
    name: 'Pro',
    price: 49,
    credits: 200,
    highlighted: true,
    features: [
      '200 repurposes per month',
      '10+ creator tools included',
      'PDF Carousel Export',
      'Zero-Cost Outreach Injector',
      'Stop-Scroll Hook Grader',
    ],
  },
  {
    id: 'tier3',
    name: 'Unlimited',
    price: 99,
    credits: -1,
    features: [
      'Unlimited repurposes',
      '30+ creator tools included',
      'Ghostwriter Voice Cloner',
      'Local RAG History Search',
      'Competitor Deconstructor',
    ],
  },
];

export const CREDIT_COSTS: Record<Platform, number> = {
  linkedin: 1,
  twitter: 1,
  email_newsletter: 2,
  twitter_thread: 2,
  instagram: 1,
  blog_summary: 2,
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  linkedin: 'LinkedIn',
  twitter: 'X / Twitter',
  email_newsletter: 'Newsletter',
  twitter_thread: 'Thread',
  instagram: 'Instagram',
  blog_summary: 'Summary',
};