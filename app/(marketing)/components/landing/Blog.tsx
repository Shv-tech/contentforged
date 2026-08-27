// components/landing/Blog.tsx
import Link from 'next/link';
import Image from 'next/image';

export interface BlogPost {
  slug: string;
  title: string;
  excerpt?: string;
  category?: string;
  publishedAt: string;
  readingMinutes?: number | string;
  image?: string;
}

interface LandingBlogSectionProps {
  posts?: BlogPost[];
}

export function LandingBlogSection({ posts = [] }: LandingBlogSectionProps) {
  if (!posts || posts.length === 0) return null;

  return (
    <section className="w-full py-24 px-6 md:px-12 border-t border-white/[0.04]">
      <div className="max-w-[1080px] mx-auto">
        {/* Section Header */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <span className="text-[12px] uppercase tracking-wider text-[#d18a5e] font-mono">
              Writing
            </span>
            <h2 className="text-[28px] md:text-[36px] font-medium text-white tracking-[-0.03em] mt-1.5">
              Latest from the lab
            </h2>
          </div>
          <Link
            href="/blog"
            className="text-[13px] text-white/50 hover:text-white transition-colors duration-200"
          >
            All articles →
          </Link>
        </div>

        {/* 3-Column Compact Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.slice(0, 3).map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex flex-col w-full"
            >
              {/* Image Container (5:6 Ratio) */}
              <div className="relative w-full aspect-[5/6] rounded-[12px] overflow-hidden bg-[#0a0a0a] border border-white/[0.06] group-hover:border-[#d18a5e]/30 transition-all duration-300 mb-4">
                <Image
                  src={post.image ?? '/og/default.png'}
                  alt={post.title}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
                  className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
              </div>

              {/* Meta */}
              <div className="flex items-center gap-2 mb-2 text-[12px] text-white/35">
                {post.category && (
                  <>
                    <span className="text-[#d18a5e]/90 font-medium">{post.category}</span>
                    <span>·</span>
                  </>
                )}
                <span>{post.publishedAt}</span>
                {post.readingMinutes && (
                  <>
                    <span>·</span>
                    <span>{post.readingMinutes} min</span>
                  </>
                )}
              </div>

              {/* Title */}
              <h3 className="text-[18px] leading-[1.3] font-medium text-white/90 group-hover:text-white transition-colors mb-2 line-clamp-2">
                {post.title}
              </h3>

              {/* Excerpt */}
              {post.excerpt && (
                <p className="text-[14px] leading-[1.55] text-white/40 font-light line-clamp-2">
                  {post.excerpt}
                </p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}