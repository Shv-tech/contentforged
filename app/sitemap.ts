// app/sitemap.ts
// Next.js auto-serves this at /sitemap.xml

import { MetadataRoute } from 'next';

// ⚠️ ADJUST THIS IMPORT to point at your actual config-driven tools list
// (the one that powers app/tools/[slug]/page.tsx). It just needs to export
// an array where each entry has at least a `slug`, e.g.:
//   export const tools = [{ slug: 'linkedin-post-generator', updatedAt: '...' }, ...]
//
// This was the biggest gap in the old sitemap: it only listed the generic
// /tools index page, so Google had no direct, guaranteed path to any of
// your individual tool pages — it could only find them by crawling links
// on the /tools page itself, which is slower and less reliable, especially
// for a brand-new domain with almost no crawl history yet.
import { TOOLS } from '@/lib/tools-config';

const BASE_URL = 'https://forge.theutopianspace.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/pricing`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      // Bumped priority + crawl frequency: this is your main growth surface
      // right now and it's about to gain 20+ child pages.
      url: `${BASE_URL}/tools`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/for-agencies`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/methodology`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/signup`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/login`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
  ];

  // One entry per tool page — this is what lets each of the 26 tools get
  // discovered, crawled, and ranked independently instead of riding on the
  // homepage's coattails.
  const toolRoutes: MetadataRoute.Sitemap = TOOLS.map((tool) => ({
    url: `${BASE_URL}/tools/${tool.slug}`,
    // ToolConfig may not declare `updatedAt` on the type, so access it
    // via a safe any-cast to avoid a TS error while still using the value
    // when present.
    lastModified: (tool as any).updatedAt ? new Date((tool as any).updatedAt) : now,
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  return [...staticRoutes, ...toolRoutes];
}