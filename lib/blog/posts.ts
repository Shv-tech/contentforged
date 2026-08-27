// lib/blog/posts.ts
//
// The registry every blog surface reads from: the index grid, the article
// page, the sitemap, and the JSON-LD. One source, so a post cannot appear in
// the list with one title and render with another.

export interface BlogPost {
  slug: string;
  title: string;
  /** Shown on the card and used as the meta description. Keep under 160 chars. */
  excerpt: string;
  /** ISO date. Drives ordering and datePublished in structured data. */
  publishedAt: string;
  updatedAt?: string;
  /** Rough minutes. Readers use it to decide, so be honest rather than flattering. */
  readingMinutes: number;
  category: 'AI marketing' | 'Content strategy' | 'Tools' | 'Research';
  /** Absolute path under /public. Falls back to the default OG card. */
  image?: string;
  /** Surfaces first on the index. Use sparingly. */
  featured?: boolean;
}

/**
 * Sorted at read time rather than here, so adding a post does not require
 * remembering where in the array it belongs.
 */
export const BLOG_POSTS: BlogPost[] = [
  {
    image: '/card-image/ai-content-paradox.png',
    slug: 'ai-content-engagement-data',
    title: 'The AI content paradox: assisted wins, automated loses',
    excerpt:
      'AI-assisted posts outperform human-written ones. Fully automated posts underperform both. The gap between those two facts is the whole game.',
    publishedAt: '2026-08-28',
    readingMinutes: 11,
    category: 'Research',
    featured: true,
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

export function getAllPosts(): BlogPost[] {
  return [...BLOG_POSTS].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export function formatPostDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}