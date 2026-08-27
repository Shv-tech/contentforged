// app/blog/page.tsx

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { getAllPosts, formatPostDate } from '@/lib/blog/posts';
import { pageMeta } from '@/lib/seo';

export const metadata: Metadata = pageMeta({
  title: 'Writing',
  description:
    'Research and argument on AI content, brand voice, and what actually moves engagement. From the team building Forge.',
  path: '/blog',
});

export default function BlogIndex() {
  const posts = getAllPosts();

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-[1080px] mx-auto px-6 py-24 md:py-32">

        <header className="mb-20 max-w-[560px]">
          <h1 className="text-[40px] md:text-[52px] leading-[1.1] tracking-[-0.03em] font-medium text-white mb-5">
            Writing
          </h1>
          <p className="text-[18px] leading-[1.65] text-white/50 font-light">
            Research and argument on AI content, brand voice, and what actually moves engagement.
            Fewer posts, each worth the time.
          </p>
        </header>

        {posts.length === 0 ? (
          <p className="text-[15px] text-white/40">Nothing published yet.</p>
        ) : (
          /*
            Two columns from md up, one below.
            Not three: at this width a third column pushes each card under
            ~300px, where the title wraps to four lines and the artwork is too
            small to read. Two gives the cards room to carry a real image.
          */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
            {posts.map((post) => (
              <Link key={post.slug} href={`/blog/${post.slug}`} className="group block">

                {/*
                  16:9 rather than the OG card's 1.91:1. Close enough that the
                  same artwork works for both, and it is the ratio the eye
                  reads as "image" rather than "banner".

                  overflow-hidden plus a scale on the inner image gives the
                  hover a subtle push-in without the container edges moving,
                  which would shift the text below it.
                */}
                <div className="relative w-full aspect-[5/6] rounded-[14px] overflow-hidden bg-[#0a0a0a] border border-white/[0.06] group-hover:border-white/[0.12] transition-colors duration-300 mb-6">
                  <Image
                    src={post.image ?? '/og/default.png'}
                    alt={post.title}
                    fill
                    sizes="(max-width: 50px) 100vw, 50vw"
                    className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                  />
                  {/*
                    Gradient over the base of the image. The artwork is dark at
                    the top and brighter at the bottom, so without this the
                    card's lower edge competes with the title beneath it.
                  */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                </div>

                <div className="flex items-center gap-3 mb-3 text-[12px] text-white/30">
                  <span className="text-[#d18a5e]/80">{post.category}</span>
                  <span>·</span>
                  <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>
                  <span>·</span>
                  <span>{post.readingMinutes} min</span>
                </div>

                <h2 className="text-[22px] md:text-[24px] leading-[1.28] tracking-[-0.02em] font-medium text-white/90 group-hover:text-white transition-colors mb-3">
                  {post.title}
                </h2>

                <p className="text-[15px] leading-[1.65] text-white/45 font-light">
                  {post.excerpt}
                </p>
              </Link>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}