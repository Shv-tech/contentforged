// app/blog/ai-content-engagement-data/page.tsx

import type { Metadata } from 'next';
import Link from 'next/link';
import { AnimatedBars, StatCallout } from '@/components/blogs/AnimatedBars';
import { getPost, formatPostDate } from '@/lib/blog/posts';
import { pageMeta, SITE } from '@/lib/seo';

const post = getPost('ai-content-engagement-data')!;

export const metadata: Metadata = pageMeta({
  title: post.title,
  description: post.excerpt,
  path: `/blog/${post.slug}`,
});

/**
 * Article JSON-LD.
 *
 * Separate from the page metadata because Google reads them differently: the
 * meta tags decide how the result looks, this decides what Google thinks the
 * page IS. Articles without it are much less likely to appear in Top Stories
 * or to be cited by AI answer engines.
 */
function articleSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    author: { '@type': 'Organization', name: SITE.name, url: SITE.url },
    publisher: {
      '@type': 'Organization',
      name: SITE.legalName,
      logo: { '@type': 'ImageObject', url: `${SITE.url}/logos/forge.svg` },
    },
    mainEntityOfPage: `${SITE.url}/blog/${post.slug}`,
  };
}

export default function Page() {
  return (
    <article className="min-h-screen bg-black">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema()) }}
      />

      <div className="max-w-[680px] mx-auto px-6 py-24 md:py-32">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="mb-16">
          <Link
            href="/blog"
            className="inline-block text-[13px] text-white/40 hover:text-white/70 transition-colors mb-10"
          >
            ← All writing
          </Link>

          <div className="flex items-center gap-3 mb-6 text-[12px] text-white/35">
            <span className="text-[#d18a5e]">{post.category}</span>
            <span>·</span>
            <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>
            <span>·</span>
            <span>{post.readingMinutes} min read</span>
          </div>

          <h1 className="text-[38px] md:text-[46px] leading-[1.12] tracking-[-0.03em] font-medium text-white mb-6">
            The AI content paradox: assisted wins, automated loses
          </h1>

          <p className="text-[19px] leading-[1.6] text-white/55 font-light">
            Two findings from 2026 platform data point in opposite directions. Read together, they
            explain why most teams using AI for content are getting worse results than teams who
            never adopted it.
          </p>
        </div>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div className="prose-forge">

          <p>
            There is a number that gets quoted in every pitch deck for an AI writing tool: AI-assisted
            posts perform better than human-written ones. It is true. LinkedIn Marketing Solutions
            data shows AI-assisted posts receiving roughly 23% more impressions than fully manual
            posts on similar topics, and across platforms AI-assisted social posts generate about
            3.1% higher engagement than fully human-written content.
          </p>

          <p>
            There is a second number that appears in almost none of those decks. On LinkedIn,
            AI-assisted posts increased engagement by 5%, while <em>fully</em> AI-generated posts saw
            a 2% decline. Ahrefs and SEMrush data puts it more bluntly: AI-generated content without
            human editing scores an average of 23% lower on engagement than human-written content.
          </p>

          <p>
            Same technology. Opposite outcomes. The variable is not whether AI was involved, it is
            how much of the human was left in.
          </p>

          <AnimatedBars
            caption="Engagement change versus fully manual posts, by how much human involvement remained."
            data={[
              { label: 'AI-assisted, human-edited', value: 5, display: '+5%', highlight: true },
              { label: 'Fully human-written', value: 0, display: 'baseline' },
              { label: 'Fully AI-generated', value: -2, display: '−2%' },
              { label: 'AI, no human editing at all', value: -23, display: '−23%' },
            ]}
            source="LinkedIn Marketing Solutions (2025–26); Ahrefs / SEMrush (2026). Figures are from separate studies with different methodologies and are directionally comparable, not strictly like-for-like."
          />

          <h2>Why the middle outperforms both ends</h2>

          <p>
            The obvious reading is that AI is a decent writer and a bad editor. That is close, but it
            misses the mechanism.
          </p>

          <p>
            A fully manual post is limited by the writer's energy on the day. Most people write their
            best hook on their third attempt and publish their first, because attempts two and three
            cost twenty minutes they do not have. The average AI-assisted LinkedIn post takes around
            3.2 minutes to produce, against 18 minutes manually. The gain is not that the machine
            writes better sentences. It is that iteration becomes cheap enough to actually happen.
          </p>

          <p>
            A fully automated post loses the thing that made the assisted version work: someone who
            knows the audience deciding what to keep. And readers notice. Roughly 67% of consumers say
            they can identify purely AI-generated content, and while 56% say they do not mind AI
            content if it is useful and well-made, that qualifier is doing enormous work. The
            tolerance is for usefulness, not for volume.
          </p>

          <StatCallout
            value="67%"
            label="of consumers say they can identify purely AI-generated content. The question is not whether they can tell. It is whether what they find is worth reading anyway."
            source="Cited in industry aggregation of 2026 content marketing data."
          />

          <h2>Google is not penalising AI. It is penalising the failure mode.</h2>

          <p>
            The most persistent myth in this space is that Google penalises AI content. It does not.
            Google's stated position is that E-E-A-T (experience, expertise, authoritativeness,
            trustworthiness) remains the standard, and that content is judged on quality regardless of
            how it was produced.
          </p>

          <p>
            What has changed is enforcement of the failure mode. Google has ramped up manual actions
            for "scaled content abuse" since June 2025. The trigger is not the tool. It is publishing
            a large volume of low-value pages, which is precisely what happens when a team discovers
            they can generate forty articles in an afternoon.
          </p>

          <p>
            This is the trap the productivity gain sets. AI makes producing content roughly 65% faster
            on average. If the only thing that scales is output, the speed becomes a liability: more
            pages, each slightly less considered, until the domain itself is classified as low value.
            The teams doing well are the ones who spent the time saved on judgement rather than volume.
          </p>

          <AnimatedBars
            caption="What AI actually changes about the production process."
            data={[
              { label: 'Time per LinkedIn post, manual', value: 18, display: '18 min' },
              { label: 'Time per LinkedIn post, AI-assisted', value: 3.2, display: '3.2 min', highlight: true },
            ]}
            source="Industry data cited in 2026 AI social media statistics compilations. Self-reported production times."
          />

          <h2>What separates assisted from automated in practice</h2>

          <p>
            The distinction is not a slider you set once. It is a set of decisions that either happen
            or do not.
          </p>

          <p>
            <strong>Context the model could not have guessed.</strong> Personalised AI posts, tailored
            to a specific audience segment, outperform generic AI posts by roughly 47% in engagement.
            That gap is not a prompt engineering trick. It is the difference between a model writing
            about your industry and a model writing about your readers.
          </p>

          <p>
            <strong>A judgement about the hook before publishing.</strong> Posts using AI-suggested
            hooks show around 34% higher click-through on the first line, which sounds like an argument
            for letting the model choose. It is closer to the opposite: the gain comes from having
            several hooks to choose between, and someone choosing.
          </p>

          <p>
            <strong>Knowing what you already published.</strong> The failure mode nobody measures is
            repetition. A model with no memory of last week's post will happily make the same argument
            again in different words, and the audience reads it as thinness even if each individual
            post is fine.
          </p>

          <h2>The uncomfortable version</h2>

          <p>
            If your workflow is prompt, copy, publish, the data says you are doing worse than if you
            had written it yourself, slowly, badly, on a Sunday night. The 23% penalty for unedited AI
            content is larger than the 5% gain for assisted content. The downside is bigger than the
            upside, and it is easier to reach.
          </p>

          <p>
            That is not an argument against AI in content. It is an argument that the tool has to know
            something about you, and that a person has to stay in the loop at the decision points. The
            teams getting the 5% are not using better models than the teams getting the −23%. They are
            using the same models and doing more work.
          </p>

          <div className="mt-16 pt-10 border-t border-white/[0.06]">
            <p className="text-[15px] text-white/50 leading-relaxed">
              Forge is built around this distinction. It learns your voice from posts that already
              performed, grades every hook before you publish, and remembers what you have already
              said so it does not say it again.{' '}
              <Link href="/signup" className="text-[#d18a5e] hover:text-[#e39a6e] transition-colors">
                Try it free
              </Link>
              .
            </p>
          </div>

          <div className="mt-12 pt-8 border-t border-white/[0.06]">
            <h3 className="text-[13px] uppercase tracking-[0.14em] text-white/35 mb-4 font-medium">
              Sources
            </h3>
            {/*
              Cited explicitly, with the caveat stated.
              Much of the 2026 figures in circulation come from aggregator
              posts rather than primary research, and several are self-reported.
              Naming that is more credible than presenting the numbers as
              settled, and it is what separates this from the posts it is
              competing with.
            */}
            <ul className="text-[13px] text-white/40 leading-relaxed space-y-2">
              <li>LinkedIn Marketing Solutions, AI-assisted post performance (2025–26)</li>
              <li>Ahrefs / SEMrush, unedited AI content engagement analysis (2026)</li>
              <li>Google Search Central, guidance on AI-generated content and E-E-A-T</li>
              <li>Salesforce, personalised versus generic AI content performance (2026)</li>
              <li>Edelman Trust Barometer, consumer attitudes to AI content (2026)</li>
            </ul>
            <p className="mt-4 text-[12px] text-white/25 leading-relaxed">
              Several figures above circulate primarily through industry aggregators rather than
              published primary research, and some are self-reported. They are directionally
              consistent across sources but should be read as indicative rather than precise.
            </p>
          </div>

        </div>
      </div>
    </article>
  );
}