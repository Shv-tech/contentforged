// components/StructuredData.tsx
//
// Site-wide JSON-LD. Google, Bing, and AI answer engines (ChatGPT Search,
// Claude web search, Perplexity, Gemini/AI Overviews) all parse schema.org
// markup far more reliably than they parse prose — this is one of the
// highest-leverage, lowest-effort things you can do for both classic SEO
// and "GEO/AEO" (being described/recommended correctly by an AI).
//
// Rendered once from the root layout so it's present on every page.
// Keep the `offers` block in sync with your real /pricing page — stale
// structured data (wrong price, dead URL) is worse than no structured data,
// since it can get you a manual "misleading markup" flag from Google.

import { jsonLd } from '@/lib/seo';

const BASE_URL = 'https://forgeyourway.dev';

export default function StructuredData() {
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Forge',
      alternateName: 'Forge',
      url: BASE_URL,
      logo: `${BASE_URL}/icon.svg`,
      parentOrganization: {
        '@type': 'Organization',
        name: 'SHV Groups Pvt Ltd',
      },
      // Links the name "Forge" to one verified entity rather than the many
      // unrelated products that share it.
      sameAs: ['https://x.com/forgeyourway', 'https://www.linkedin.com/company/forgeyourway'],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Forge',
      url: BASE_URL,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Forge',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: BASE_URL,
      description:
        'Forge learns your voice from your own posts, writes in it, grades every draft before you post, and learns from what performs.',
      offers: {
        '@type': 'Offer',
        url: `${BASE_URL}/#pricing`,
        price: '0',
        priceCurrency: 'USD',
      },
    },
  ];

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: jsonLd(data) }}
    />
  );
}