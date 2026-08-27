// lib/blog/posts.ts
//
// Blog content and metadata.
//
// Posts live in a typed array rather than MDX files. The tradeoff: MDX is
// nicer for long prose, but it needs a build pipeline, and every custom
// component has to be registered in a provider. With a handful of posts a
// typed array gives full TypeScript checking on every field, keeps charts as
// ordinary props, and has no build step to break.
//
// Revisit if this passes roughly twenty posts, when the file gets unwieldy.

export interface ChartSeries {
  label: string;
  value: number;
  /** Overrides the default accent. Use sparingly, for one highlighted bar. */
  color?: string;
}

export interface ChartBlock {
  kind: 'chart';
  title: string;
  /** Where the numbers came from. Never render a chart without this. */
  source: string;
  sourceUrl?: string;
  unit?: string;
  /** Fixes the axis. Omit to scale to the largest value. */
  max?: number;
  series: ChartSeries[];
  /** One line naming what the reader should take from it. */
  takeaway?: string;
}

export interface ProseBlock {
  kind: 'prose';
  /** HTML. Keep to p, strong, em, a, ul, li, code. */
  html: string;
}

export interface HeadingBlock {
  kind: 'heading';
  text: string;
  /** Used to build the table of contents and the anchor id. */
  id: string;
}

export interface QuoteBlock {
  kind: 'quote';
  text: string;
  attribution: string;
  url?: string;
}

export interface CodeBlock {
  kind: 'code';
  language: string;
  code: string;
  caption?: string;
}

export interface CalloutBlock {
  kind: 'callout';
  tone: 'note' | 'warning';
  title: string;
  html: string;
}

export type Block = ProseBlock | HeadingBlock | ChartBlock | QuoteBlock | CodeBlock | CalloutBlock;

export interface Post {
  slug: string;
  title: string;
  /** Under ~160 characters: this is the search result snippet. */
  description: string;
  /** Shown on the card. Can be longer and more opinionated than description. */
  excerpt: string;
  publishedAt: string;
  updatedAt?: string;
  readingMinutes: number;
  category: 'AI Marketing' | 'AI Tools' | 'Content Strategy' | 'Research';
  /** Absolute or root-relative. Falls back to the default OG card. */
  image?: string;
  blocks: Block[];
  /** Rendered as FAQPage structured data. Only include questions genuinely answered on the page. */
  faqs?: Array<{ question: string; answer: string }>;
}

// ============================================================================
// POSTS
// ============================================================================

const aiContentEvidence: Post = {
  slug: 'does-ai-content-actually-work',
  title: 'Does AI content actually work? What the evidence says',
  description:
    'Most claims about AI content performance come from vendors selling AI tools. Here is what independent research actually measures, and what it does not.',
  excerpt:
    'The internet is full of confident numbers about AI content. Almost all of them come from companies selling AI content tools. We went looking for evidence that was not marketing.',
  publishedAt: '2026-08-27',
  readingMinutes: 9,
  category: 'Research',
  blocks: [
    {
      kind: 'prose',
      html: `<p>Search for whether AI-written content performs, and you will find a lot of numbers. Engagement lifts of 31%. Time savings of 8.3 hours a week. ROI of 340%. They are cited confidently, they appear in listicles with titles like "47 statistics on AI content," and they are almost entirely produced by companies that sell AI content tools.</p>
<p>That does not automatically make them wrong. It does mean nobody has an incentive to publish the version where it did not work. So we went looking for research from people with no product to sell.</p>`,
    },

    { kind: 'heading', text: 'People genuinely cannot tell any more', id: 'detection' },

    {
      kind: 'prose',
      html: `<p>The most robust finding is also the least commercial, because no vendor benefits from it directly.</p>
<p>The <a href="https://arxiv.org/pdf/2602.21012" target="_blank" rel="noopener">International AI Safety Report 2026</a> summarises studies on whether people can identify machine-written text. In one, after a five-minute conversation, participants misidentified GPT-4o output as human-written <strong>77% of the time</strong>. On deepfake detection, humans frequently perform no better than chance.</p>
<p>This matters for a specific reason. The common objection to AI content is that readers will notice and think less of you. At the level of raw text quality, the evidence says they will not notice. Whatever the real risk is, "it reads like a robot" is no longer it.</p>`,
    },

    {
      kind: 'chart',
      title: 'Share of AI-generated content, where it has been measured',
      source: 'Wikipedia figure: Brooks et al., arXiv 2410.08044. Peer review figures: Shen & Wang, arXiv 2602.00319.',
      sourceUrl: 'https://arxiv.org/pdf/2410.08044',
      unit: '%',
      max: 25,
      series: [
        { label: 'Wikipedia articles (Aug 2024)', value: 4.36 },
        { label: 'Nature Comms reviews (2025)', value: 12 },
        { label: 'ICLR reviews (2025)', value: 20, color: '#d18a5e' },
      ],
      takeaway:
        'These are measured, not surveyed. Even in venues where AI use is discouraged, adoption is well into double digits.',
    },

    {
      kind: 'prose',
      html: `<p>Those two studies are worth reading properly, because they measure rather than ask. Researchers applied detection models to bodies of text where the authors had no reason to disclose AI use, and in the peer review case, active reason not to.</p>
<p>Roughly <strong>20% of ICLR 2025 peer reviews</strong> were classified as AI-generated. In academic peer review. Where the entire value of the contribution is a human expert's judgement.</p>`,
    },

    {
      kind: 'callout',
      tone: 'warning',
      title: 'A caveat these numbers deserve',
      html: `<p>Detection models have false positives, and the papers say so. The Wikipedia study set thresholds to keep false positives under 1% on pre-2022 articles, and still found that the two tools it used disagreed substantially on which specific articles were flagged. Treat these as directional, not precise.</p>`,
    },

    { kind: 'heading', text: 'The quality finding nobody quotes', id: 'quality' },

    {
      kind: 'prose',
      html: `<p>Here is the part of the Wikipedia study that vendor blog posts leave out. The authors did not stop at counting AI-generated articles. They assessed them.</p>`,
    },

    {
      kind: 'quote',
      text: 'The quality of articles detected as AI-generated is generally lower on at least two axes.',
      attribution: 'The Rise of AI-Generated Content in Wikipedia (arXiv 2410.08044)',
      url: 'https://arxiv.org/pdf/2410.08044',
    },

    {
      kind: 'prose',
      html: `<p>So: readers cannot reliably identify AI text in a blind test, and AI text is measurably worse on quality dimensions when experts assess it in context.</p>
<p>Those two findings only look contradictory. Detection asks "does this read as machine-written?" Quality asks "is this any good?" A piece can be fluent, grammatical, well-structured, indistinguishable in a five-minute test, and still say nothing worth reading.</p>
<p>Which is the actual risk of AI content, and it is not the one most people worry about. Nobody unfollows you because your grammar was too clean. They unfollow because you stopped saying anything.</p>`,
    },

    { kind: 'heading', text: 'What the vendor numbers are actually measuring', id: 'vendor-claims' },

    {
      kind: 'prose',
      html: `<p>Return to that 31% engagement lift. Read the methodology and it compares AI-assisted posting against human-only posting across business accounts over six months.</p>
<p>The study's own explanation of the mechanism is the interesting part. The advantage is attributed to <strong>consistency, timing, and volume</strong> — not to the writing being better. Elsewhere the same body of vendor research reports teams publishing roughly five times more content after adopting AI tools.</p>
<p>If output rises fivefold and engagement per post rises 31%, the honest reading is not "AI writes better posts." It is "teams that were posting twice a month started posting twice a week, and consistency is what social platforms reward."</p>
<p>That is a real result. It is just a different one, and it has a different implication: the tool did not improve your writing, it removed the excuse not to publish.</p>`,
    },

    {
      kind: 'chart',
      title: 'What actually changes when teams adopt AI writing tools',
      source: 'Compiled from vendor-published figures. Directional only; see caveat below.',
      unit: '×',
      max: 6,
      series: [
        { label: 'Posting frequency', value: 5.2, color: '#d18a5e' },
        { label: 'Drafting speed', value: 4.2 },
        { label: 'Engagement per post', value: 1.31 },
      ],
      takeaway:
        'Volume and speed move several times over. Per-post performance barely moves. The gain is throughput, not quality.',
    },

    {
      kind: 'callout',
      tone: 'note',
      title: 'Why we are not citing a source URL for that chart',
      html: `<p>Those figures circulate widely across vendor blogs and statistics roundups, frequently attributed to reports whose primary versions we could not verify. We have included them because the pattern is consistent across sources and it is the pattern that matters, not the decimal places. Treat every number in that chart as approximate and vendor-supplied.</p>`,
    },

    { kind: 'heading', text: 'What this means if you are actually publishing', id: 'implications' },

    {
      kind: 'prose',
      html: `<p>Three things follow from the evidence, and none of them is "use AI" or "do not use AI."</p>
<p><strong>Fluency is solved and worth nothing.</strong> Every tool clears the bar of sounding human. That means writing quality is no longer where anyone competes. If your entire content strategy is "post something readable twice a week," a model does that for free and so does everyone else.</p>
<p><strong>The scarce input is judgement, not prose.</strong> The Wikipedia finding is that AI text is fluent and thin. What it lacks is a point of view, a specific claim, a reason for this person to write this thing. Those are the parts a model cannot supply, because they come from what you know and it does not.</p>
<p><strong>Consistency is the mechanism that actually works.</strong> If the measured advantage comes from volume and timing, the useful question is not "which tool writes best" but "what stops me publishing." Usually it is starting from nothing every time.</p>`,
    },

    {
      kind: 'code',
      language: 'text',
      caption: 'A test worth applying to any draft, human or generated',
      code: `1. Remove your name from it.
   Could any of five competitors have published this?
   If yes, it is fluent and thin. Rewrite or bin it.

2. Find the sentence someone could disagree with.
   If there isn't one, you have described a topic
   rather than made a claim.

3. Check what only you could have written.
   A number you measured, a mistake you made,
   a client you argued with. If none of it survives,
   the post is a summary of the internet.`,
    },

    {
      kind: 'prose',
      html: `<p>That test is deliberately unkind to AI drafts, and it should be applied to human ones just as hard. In our experience most first drafts fail step one regardless of who wrote them.</p>`,
    },

    { kind: 'heading', text: 'The honest summary', id: 'summary' },

    {
      kind: 'prose',
      html: `<p>Readers cannot detect AI writing reliably. AI writing is measurably thinner when experts assess it. The performance gains vendors advertise appear to come from publishing more often, not from writing better.</p>
<p>None of that says do not use these tools. It says be clear about what you are buying. You are buying throughput and the removal of a blank page. You are not buying a point of view, and if you use the throughput to publish five times more of the same forgettable thing, the evidence suggests you will get exactly what you paid for.</p>`,
    },
  ],
  faqs: [
    {
      question: 'Can readers tell if content was written by AI?',
      answer:
        'Generally no. The International AI Safety Report 2026 cites a study in which participants misidentified GPT-4o output as human-written 77% of the time after a five-minute conversation. Detection by reading alone is unreliable.',
    },
    {
      question: 'Is AI-generated content lower quality?',
      answer:
        'Research on Wikipedia articles found that content detected as AI-generated scored lower on at least two quality dimensions, even though it was fluent. Fluency and substance are separate measures, and AI output tends to score well on the first and poorly on the second.',
    },
    {
      question: 'Does AI content get more engagement?',
      answer:
        'Vendor-published studies report engagement lifts of around 31%, but attribute the gain to consistency, timing and volume rather than to better writing. The same research reports posting frequency rising roughly fivefold, which suggests the advantage comes from publishing more often.',
    },
  ],
};

export const POSTS: Post[] = [aiContentEvidence];

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}

export function getAllPosts(): Post[] {
  return [...POSTS].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}