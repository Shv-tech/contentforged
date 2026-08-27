// app/(marketing)/blog/page.tsx

import Link from 'next/link';
import { getAllPosts } from '@/lib/blog/posts';
import { pageMeta } from '@/lib/seo';

export const metadata = pageMeta({
  title: 'Writing',
  description:
    'Research and argument on AI content, brand voice, and what actually moves the needle on a content operation. From the team building Forge.',
  path: '/blog',
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function BlogIndex() {
  const posts = getAllPosts();

  return (
    <main className="min-h-screen bg-black text-white font-sans selection:bg-[#d18a5e]/30">
      <div className="max-w-[760px] mx-auto px-6 pt-32 pb-32">

        <header className="mb-20">
          <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#d18a5e]">
            Writing
          </span>
          <h1 className="mt-6 text-[40px] md:text-[52px] font-medium tracking-[-0.03em] leading-[1.1] text-white/95">
            Notes on content that
            <br />
            <span className="text-white/30">has something to say.</span>
          </h1>
          <p className="mt-8 text-[17px] leading-[1.7] text-white/45 font-light max-w-[560px]">
            Research, arguments and the occasional uncomfortable finding. Written by the people building Forge, which means we have opinions and a product. We try to keep those separate.
          </p>
        </header>

        {posts.length === 0 ? (
          <p className="text-[15px] text-white/30 font-light">Nothing published yet.</p>
        ) : (
          <div className="space-y-px">
            {posts.map((post) => (
              <article key={post.slug} className="group">
                <Link
                  href={`/blog/${post.slug}`}
                  className="block py-10 border-t border-white/[0.06] transition-colors hover:border-white/[0.14]"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#d18a5e]/70">
                      {post.category}
                    </span>
                    <span className="text-[11px] text-white/20">
                      {formatDate(post.publishedAt)}
                    </span>
                    <span className="text-[11px] text-white/20">
                      {post.readingMinutes} min read
                    </span>
                  </div>

                  <h2 className="text-[24px] md:text-[28px] font-medium tracking-[-0.02em] leading-[1.25] text-white/90 group-hover:text-white transition-colors mb-3">
                    {post.title}
                  </h2>

                  <p className="text-[16px] leading-[1.7] text-white/45 font-light max-w-[620px]">
                    {post.excerpt}
                  </p>

                  <span className="inline-flex items-center gap-2 mt-6 text-[13px] text-white/40 group-hover:text-white/70 transition-colors">
                    Read
                    <span className="transition-transform duration-300 group-hover:translate-x-1">
                      &rarr;
                    </span>
                  </span>
                </Link>
              </article>
            ))}
            <div className="border-t border-white/[0.06]" />
          </div>
        )}

      </div>
    </main>
  );
}