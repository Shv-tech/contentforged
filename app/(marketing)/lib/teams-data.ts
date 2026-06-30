import { User, Briefcase, Zap, Shield } from 'lucide-react';

export type TeamData = {
  id: string;
  eyebrow: string;
  headline: string;
  subheadline: string;
  icon: any;
  features: { title: string; description: string }[];
};

export const TEAMS_DATA: Record<string, TeamData> = {
  'solo-creators': {
    id: 'solo-creators',
    eyebrow: 'Individual Scale',
    headline: 'Scale your mind. Not your headcount.',
    subheadline: 'ContentForge acts as your localized content infrastructure, allowing a single creator to output at the volume of a media company without sacrificing structural integrity or brand DNA.',
    icon: User,
    features: [
      { title: 'Absolute Recall', description: 'The system remembers every post, hook, and framework you’ve ever used.' },
      { title: 'Performance Autopsy', description: 'It analyzes your analytics to determine exactly why a post succeeded, encoding that data into your next generation of content.' },
      { title: 'Omni-Channel Architecture', description: 'One core idea, structurally adapted for every platform natively.' }
    ]
  },
  'ghostwriters': {
    id: 'ghostwriters',
    eyebrow: 'Agency Infrastructure',
    headline: 'Absolute cognitive separation.',
    subheadline: 'Manage distinct client voices with zero cross-contamination. ContentForge isolates each Brand DNA into secure, partitioned environments, allowing your agency to scale infinitely.',
    icon: Zap,
    features: [
      { title: 'Syntactic Cloning', description: 'Replicates cadence, tone, and specific vocabulary per client, never drifting toward a generic AI voice.' },
      { title: 'Strict Partitioning', description: 'Data and performance metrics are strictly siloed. Client A\'s data will never influence Client B\'s outputs.' },
      { title: 'Automated Calendars', description: 'Generate full 30-day content calendars ready for client review in under ten minutes.' }
    ]
  },
  'founders': {
    id: 'founders',
    eyebrow: 'Executive Authority',
    headline: 'Translate expertise into authority.',
    subheadline: 'You have the domain knowledge; you lack the time for execution. ContentForge is a zero-friction pipeline that transforms your raw ideas into published market dominance.',
    icon: Briefcase,
    features: [
      { title: 'Zero-Friction Input', description: 'Feed the system raw brain-dumps, audio transcripts, or internal memos. It handles the structural formatting.' },
      { title: 'High-Signal Output', description: 'Bypasses generic engagement bait to produce insight-dense writing suitable for an executive.' },
      { title: 'Autonomous Delegation', description: 'Acts as an autonomous content manager, scheduling and planning without requiring your constant oversight.' }
    ]
  },
  'enterprise': {
    id: 'enterprise',
    eyebrow: 'Organizational Scale',
    headline: 'Unified brand intelligence.',
    subheadline: 'Centralize your organization\'s voice. Deploy performance-optimized, meticulously on-brand content across every department with absolute consistency and programmatic oversight.',
    icon: Shield,
    features: [
      { title: 'Centralized Brand DNA', description: 'A single source of truth for your corporate tone, accessible by every team member worldwide.' },
      { title: 'Strict Compliance', description: 'Built-in safety checks ensure no content violates organizational guidelines before it reaches the calendar.' },
      { title: 'Cross-Team Intelligence', description: 'The system learns from the marketing team\'s successes and applies those insights to the sales team\'s outreach.' }
    ]
  }
};