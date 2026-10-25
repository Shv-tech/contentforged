/**
 * app/sitemap.ts, served at /sitemap.xml.
 *
 * Built from the same sources the pages render from (tool configs, team
 * pages, blog posts), so it lists exactly the routes that exist. Private
 * share pages (audits, grade cards, shared chats) are deliberately absent;
 * they are noindex.
 */

import type { MetadataRoute } from 'next';
import { TOOLS } from '@/lib/tools-config';
import { getAllPosts } from '@/lib/blog/posts';
import { TEAMS_DATA } from './(marketing)/lib/teams-data';

const BASE_URL = 'https://forgeyourway.dev';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const pages: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
    { path: '', priority: 1, changeFrequency: 'weekly' },
    { path: '/audit', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/methodology', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/blog', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/tools/image-to-pdf', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/tools/pdf-to-image', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/signup', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/security', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/privacy', priority: 0.2, changeFrequency: 'yearly' },
    { path: '/terms', priority: 0.2, changeFrequency: 'yearly' },
  ];

  return [
    ...pages.map((page) => ({ url: `${BASE_URL}${page.path}`, lastModified: now, changeFrequency: page.changeFrequency, priority: page.priority })),
    ...Object.keys(TEAMS_DATA).map((slug) => ({ url: `${BASE_URL}/teams/${slug}`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.7 })),
    ...getAllPosts().map((post) => ({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.publishedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...TOOLS.map((tool) => ({ url: `${BASE_URL}/tools/${tool.slug}`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.8 })),
  ];
}
