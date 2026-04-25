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
  originalPrice?: number;
  discount?: string;
  credits: number;
  features: string[];
  highlighted?: boolean;
}

// ==========================================
// UNIFIED ENTERPRISE PRICING SOURCE OF TRUTH
// ==========================================
export const PRICING: PricingTier[] = [
  {
    id: 'basic', // System ID remains 'free' to maintain database continuity
    name: 'Basic',
    price: 5,
    originalPrice: 19,
    discount: '74%',
    credits: 5,
    features: [
      '3 tools access',
      'Strategist Desk',
      'Brand DNA Protocol',
    ],
  },
  {
    id: 'tier1',
    name: 'Starter',
    price: 20,
    originalPrice: 49,
    discount: '59%',
    credits: 100,
    features: [
      '10+ creator tools',
      'Bring Your Own Key',
      'Brand DNA Protocol',
      'Stop-Scroll Grader',
      'Standard Output Trees'
    ],
  },
 
  {
    id: 'tier3',
    name: 'Unlimited',
    price: 39,
    originalPrice: 99,
    discount: '61%',
    credits: 999999, // Represents unlimited in the credit subtraction logic
    highlighted: true,
    features: [
      '35+ creator tools',
      'Multi Agent system',
      'Everything in Starter',
      'Ghostwriter Voice Clone',
      'Zero-Cost Outreach',
      'Multi-Brand Workspace'
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