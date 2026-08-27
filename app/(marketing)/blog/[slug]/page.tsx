import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPost, getAllPosts } from '@/lib/blog/posts';
import { BlogBlocks } from '@/components/blogs/BlogBlocks';
import { pageMeta } from '@/lib/seo';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);

  if (!post) return {};

  return pageMeta({
    title: post.title,
    description: post.description,
    path: `/blog/${post.slug}`,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);

  if (!post) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-black text-white font-sans selection:bg-[#d18a5e]/30">
      <article className="max-w-[760px] mx-auto px-6 pt-32 pb-32">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-[13px] text-white/40 hover:text-white/70 transition-colors mb-12"
        >
          &larr; Back to writing
        </Link>

        <header className="mb-16">
          <div className="flex items-center gap-4 mb-6">
            <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#d18a5e]">
              {post.category}
            </span>
            <span className="text-[11px] text-white/20">
              {formatDate(post.publishedAt)}
            </span>
            <span className="text-[11px] text-white/20">
              {post.readingMinutes} min read
            </span>
          </div>

          <h1 className="text-[36px] md:text-[48px] font-medium tracking-[-0.03em] leading-[1.15] text-white/95 mb-6">
            {post.title}
          </h1>

          <p className="text-[18px] leading-[1.7] text-white/50 font-light">
            {post.description}
          </p>
        </header>

        {/* Content Blocks */}
        <div className="border-t border-white/[0.08] pt-10">
          <BlogBlocks blocks={post.blocks} />
        </div>
      </article>
    </main>
  );
}