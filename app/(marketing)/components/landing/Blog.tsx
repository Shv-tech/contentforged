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
    <section className="mx-auto max-w-[1240px] px-5 sm:px-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-[40px] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-[56px]">From the lab.</h2>
        <Link href="/blog" className="text-[15px] text-white/60 underline decoration-white/25 underline-offset-4 transition hover:text-white hover:decoration-white">
          All articles
        </Link>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {posts.slice(0, 3).map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className="group flex flex-col overflow-hidden rounded-[28px] bg-[#0E0E0E]">
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#121212]">
              <Image
                src={post.image ?? '/og/default.png'}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
              />
            </div>
            <div className="flex flex-1 flex-col p-6">
              <div className="text-[13px] text-white/40">
                {[post.category, post.publishedAt, post.readingMinutes ? `${post.readingMinutes} min read` : null].filter(Boolean).join(', ')}
              </div>
              <h3 className="mt-3 line-clamp-2 text-[20px] font-semibold leading-[1.25] tracking-[-0.02em] text-white">{post.title}</h3>
              {post.excerpt && <p className="mt-2 line-clamp-2 text-[15px] leading-[1.55] text-white/50">{post.excerpt}</p>}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
