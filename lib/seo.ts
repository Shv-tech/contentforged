// lib/seo.ts
//
// One place that builds page metadata, so Open Graph, Twitter cards and
// canonical URLs cannot drift apart page by page.

import type { Metadata } from 'next';

export const SITE = {
  name: 'Forge',
  legalName: 'SHV Groups Pvt Ltd',
  url: 'https://forgeyourway.dev',
  // Under ~60 characters, or Google truncates it in results.
  title: 'Forge — AI content that sounds like you',
  description:
    'Forge learns your voice from your best posts, writes in it, plans your calendar, and grades every hook before you publish.',
  twitter: '@forgeyourway', // update or remove if the handle differs
} as const;

/**
 * Default share image.
 *
 * 1200x630 is the size Facebook, LinkedIn, Slack and X all render without
 * re-cropping. The source artwork is 7016x4961 at 3.3 MB, which several
 * scrapers reject outright and the rest are slow to fetch, so a resized copy
 * lives at this path rather than the original.
 */
const OG_IMAGE = {
  url: `${SITE.url}/og/default.png`,
  width: 1200,
  height: 630,
  alt: 'Forge — AI content operating system',
} as const;

interface PageMetaOptions {
  title: string;
  description: string;
  /** Path only, e.g. '/pricing'. Used for the canonical URL. */
  path: string;
  /** Absolute URL. Falls back to the default card. */
  image?: string;
  /** Set for login, signup and anything with no standalone search value. */
  noIndex?: boolean;
}

/**
 * Builds page metadata.
 *
 * Titles arrive without the brand suffix; the template in the root layout
 * appends it. Passing a pre-suffixed title here produces "Pricing | Forge |
 * Forge", which is a common and easy mistake to make page by page.
 */
export function pageMeta({
  title,
  description,
  path,
  image,
  noIndex,
}: PageMetaOptions): Metadata {
  const url = `${SITE.url}${path}`;
  const ogImage = image ? { url: image, width: 1200, height: 630, alt: title } : OG_IMAGE;

  return {
    title,
    description,

    // Canonical on every page. Without it, the same content reachable at a
    // trailing slash, with UTM parameters, or on a Vercel preview domain gets
    // treated as duplicates competing with each other.
    alternates: { canonical: url },

    ...(noIndex ? { robots: { index: false, follow: true } } : {}),

    openGraph: {
      type: 'website',
      siteName: SITE.name,
      title,
      description,
      url,
      images: [ogImage],
    },

    twitter: {
      // summary_large_image renders the full-width card. Plain 'summary'
      // shows a small square thumbnail and wastes the artwork.
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage.url],
      ...(SITE.twitter ? { creator: SITE.twitter, site: SITE.twitter } : {}),
    },
  };
}

/**
 * Root metadata. Spread into app/layout.tsx.
 *
 * metadataBase is the important line: without it Next.js emits relative image
 * paths, and every scraper except a browser fails to resolve them. That is
 * the usual reason a link preview shows text but no image.
 */
export const rootMetadata: Metadata = {
  metadataBase: new URL(SITE.url),

  title: {
    default: SITE.title,
    // Appended to every child page's title.
    template: `%s — ${SITE.name}`,
  },
  description: SITE.description,

  applicationName: SITE.name,
  authors: [{ name: SITE.legalName }],
  creator: SITE.legalName,
  publisher: SITE.legalName,

  alternates: { canonical: SITE.url },

  openGraph: {
    type: 'website',
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
    url: SITE.url,
    locale: 'en_US',
    images: [OG_IMAGE],
  },

  twitter: {
    card: 'summary_large_image',
    title: SITE.title,
    description: SITE.description,
    images: [OG_IMAGE.url],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Lets Google show full-length snippets, large image previews and full
      // video previews. Defaults are more conservative and produce smaller,
      // less clickable results.
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },

  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

// ============================================================================
// STRUCTURED DATA
//
// JSON-LD is how Google understands what a page IS rather than only what it
// says. It is what makes a result eligible for rich presentation, and it is
// read by AI answer engines deciding whether to cite a source.
// ============================================================================

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE.name,
    legalName: SITE.legalName,
    url: SITE.url,
    logo: `${SITE.url}/logos/forge.svg`,
    description: SITE.description,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'New Delhi',
      addressCountry: 'IN',
    },
  };
}

/**
 * @param offers Include only plans that are genuinely self-serve. Listing a
 *               price for something that actually requires a sales call is
 *               the kind of mismatch Google penalizes rather than rewards.
 */
export function softwareApplicationSchema(offers: Array<{ name: string; price: number; currency: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: SITE.description,
    url: SITE.url,
    offers: offers.map((o) => ({
      '@type': 'Offer',
      name: o.name,
      price: String(o.price),
      priceCurrency: o.currency,
    })),
    // aggregateRating is deliberately omitted. Marking up ratings you do not
    // have is a manual-action risk, and it is trivially checkable.
  };
}

/**
 * FAQ schema.
 *
 * Only use where the questions genuinely appear on the page. Marking up
 * content a visitor cannot see is against Google's structured data policy.
 */
export function faqSchema(faqs: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

/** Renders a schema object as a script tag. */
export function jsonLd(schema: object): string {
  return JSON.stringify(schema);
}