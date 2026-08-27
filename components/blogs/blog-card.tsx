// components/blog/blog-card.tsx
import Link from 'next/link';
import Image from 'next/image';
import { formatPostDate } from '@/lib/blog/posts';

export interface BlogPost {
  slug: string;
  title: string;
  excerpt?: string;
  category?: string;
  publishedAt: string;
  readingMinutes?: number | string;
  image?: string;
}

export function BlogCard({ post }: { post: BlogPost }) {
  return (
    <Link href={`/blog/${post.slug}`} className="group block w-full">
      {/* 5:6 Ratio Image Container */}
      <div className="relative w-full aspect-[5/6] rounded-[14px] overflow-hidden bg-[#0a0a0a] border border-white/[0.06] group-hover:border-white/[0.12] transition-colors duration-300 mb-5">
        <Image
          src={post.image ?? '/og/default.png'}
          alt={post.title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px"
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
      </div>

      {/* Meta */}
      <div className="flex items-center gap-2.5 mb-2.5 text-[12px] text-white/30">
        {post.category && (
          <>
            <span className="text-[#d18a5e]/80">{post.category}</span>
            <span>·</span>
          </>
        )}
        <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>
        {post.readingMinutes && (
          <>
            <span>·</span>
            <span>{post.readingMinutes} min</span>
          </>
        )}
      </div>

      {/* Title */}
      <h3 className="text-[20px] md:text-[22px] leading-[1.28] tracking-[-0.02em] font-medium text-white/90 group-hover:text-white transition-colors mb-2">
        {post.title}
      </h3>

      {/* Excerpt */}
      {post.excerpt && (
        <p className="text-[14px] leading-[1.6] text-white/45 font-light line-clamp-2">
          {post.excerpt}
        </p>
      )}
    </Link>
  );
}