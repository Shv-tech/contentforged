import type { Metadata } from 'next';
import { AuditClient } from './audit-client';

const BASE_URL = 'https://forgeyourway.dev';

export const metadata: Metadata = {
  title: 'Free X profile audit: why your account is quiet | Forge',
  description:
    'Paste an X handle. In about thirty seconds Forge reads the last twenty posts and shows what is holding the account back, with three fixes for this week. No sign-up.',
  alternates: { canonical: `${BASE_URL}/audit` },
  openGraph: {
    title: 'Why is your X account quiet?',
    description: 'A free, thirty-second audit from your own last twenty posts. No sign-up.',
    url: `${BASE_URL}/audit`,
    type: 'website',
    images: [{ url: `${BASE_URL}/og-image.jpg`, width: 1200, height: 630, alt: 'Forge X profile audit' }],
  },
  twitter: { card: 'summary_large_image', title: 'Why is your X account quiet?', description: 'A free, thirty-second audit. No sign-up.' },
};

export default function AuditPage() {
  return <AuditClient />;
}
