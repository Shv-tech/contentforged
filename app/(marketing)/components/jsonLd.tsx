// app/(marketing)/components/jsonLd.tsx
//
// Structured data for the landing page.
//
// Everything here is derived from the same sources the page renders (plans
// from lib/billing/plans.ts, FAQs from landing-data.ts), so the markup cannot
// drift from what a visitor sees. The previous version carried an
// aggregateRating and review markup with no reviews behind them, and prices
// that did not match the pricing page. Google treats both as misleading
// markup and can issue a manual action for it; both are gone.

import { PLANS, PAID_PLANS } from '@/lib/billing/plans';
import { FAQS } from '../lib/landing-data';
import { jsonLd } from '@/lib/seo';

const BASE_URL = 'https://forgeyourway.dev';

function centsToDollars(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

const softwareApp = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Forge',
  url: BASE_URL,
  description:
    'Forge learns your voice from your own posts, writes in it, grades every draft before you post, schedules it, and learns from what performs. For X, LinkedIn, Threads and Bluesky.',
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Content Marketing Software',
  operatingSystem: 'Web',
  provider: {
    '@type': 'Organization',
    name: 'SHV Groups Pvt Ltd',
    url: 'https://shvgroups.com',
  },
  offers: [
    {
      '@type': 'Offer',
      name: PLANS.free.name,
      price: '0',
      priceCurrency: 'USD',
      url: `${BASE_URL}/#pricing`,
    },
    ...PAID_PLANS.map((id) => ({
      '@type': 'Offer',
      name: PLANS[id].name,
      price: centsToDollars(PLANS[id].pricing.USD.amountMinor),
      priceCurrency: 'USD',
      url: `${BASE_URL}/#pricing`,
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: centsToDollars(PLANS[id].pricing.USD.amountMinor),
        priceCurrency: 'USD',
        billingIncrement: 1,
        unitCode: 'MON',
      },
    })),
  ],
  featureList: [
    'Voice Fingerprint measured from your own posts',
    'Story Bank: drafts only use facts you have given',
    'Stop-Scroll Grader for opening lines',
    'Scheduling and posting to X, LinkedIn, Threads and Bluesky',
    'Results tracking and a personal Playbook',
    'Reply Radar and niche pulse from live X data',
  ],
  screenshot: `${BASE_URL}/og-image.jpg`,
};

const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Forge',
  url: BASE_URL,
  logo: `${BASE_URL}/icon.svg`,
  parentOrganization: {
    '@type': 'Organization',
    name: 'SHV Groups Pvt Ltd',
    url: 'https://shvgroups.com',
  },
  sameAs: ['https://x.com/forgeyourway', 'https://www.linkedin.com/company/forgeyourway', 'https://www.youtube.com/@Forgedyourway'],
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'support@forgeyourway.dev',
    contactType: 'customer support',
    availableLanguage: 'English',
  },
};

const faqPage = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((faq) => ({
    '@type': 'Question',
    name: faq.q,
    acceptedAnswer: { '@type': 'Answer', text: faq.a },
  })),
};

export function JsonLd() {
  const schemas = [softwareApp, organization, faqPage];
  return (
    <>
      {schemas.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: jsonLd(schema) }}
        />
      ))}
    </>
  );
}
