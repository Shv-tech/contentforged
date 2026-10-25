import type { Metadata } from 'next';
import Link from 'next/link';
import { GRADE_DIMENSIONS } from '@/lib/forge/types';
import { SiteFooter, SiteNav } from '../components/site-chrome';

const BASE_URL = 'https://forgeyourway.dev';

export const metadata: Metadata = {
  title: 'How Forge measures a post | Methodology',
  description: 'How the Stop-Scroll Grader scores an opening, how the Voice Fingerprint is measured, and how the Playbook decides what works for you. With the limits of each.',
  alternates: { canonical: `${BASE_URL}/methodology` },
};

const DIMENSION_NOTES: Record<(typeof GRADE_DIMENSIONS)[number]['key'], string> = {
  pattern_interrupt: 'Does the first line break the rhythm of a feed: an unexpected claim, a concrete scene, a number where a platitude was expected.',
  curiosity_gap: 'Does it open a question the reader needs the next line to close, without withholding so much that it reads as bait.',
  emotional_charge: 'Is there something at stake for a person: a cost, a fear, a win, a mistake. Neutral information scores low here by design.',
  specificity: 'Names, numbers, dates and places. "I lost a client" scores lower than "I lost our biggest client on a Tuesday call".',
  shareability: 'Would a reader send it to someone, or repost it to say something about themselves.',
};

export default function MethodologyPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-black font-sans text-white antialiased">
      <SiteNav links={[{ label: 'Grader', href: '/#try' }, { label: 'Free audit', href: '/audit' }, { label: 'Pricing', href: '/#pricing' }]} />

      <article className="mx-auto max-w-[760px] px-5 pb-10 pt-32 sm:px-8 sm:pt-40">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/45">Methodology</p>
        <h1 className="mt-4 text-[42px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[60px]">How Forge measures a post.</h1>
        <p className="mt-6 text-[18px] leading-[1.6] text-white/60">
          Every score in Forge is either computed from your own data or produced by a fixed rubric. This page says which is which, what each one can and cannot tell you, and how we keep them honest.
        </p>

        <Section title="The Stop-Scroll Grader">
          <p>
            The grader reads the opening of a post (the first line, or the first post of a thread) and scores five dimensions from 0 to 10, for a total out of 50. It returns the single weakest thing and one rewritten opening that fixes it.
          </p>
          <ul className="mt-6 flex flex-col gap-4">
            {GRADE_DIMENSIONS.map((d) => (
              <li key={d.key} className="rounded-[20px] border border-white/[0.07] bg-[#0B0B0B] p-5">
                <h3 className="text-[16px] font-semibold text-white">{d.label}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-white/60">{DIMENSION_NOTES[d.key]}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6">
            40 and above reads as ready, 30 to 39 needs one fix, below 30 needs a different angle. The grader runs at temperature zero with a fixed rubric, so the same line scores the same way twice.
          </p>
          <Limit>
            A grade is a judgement about an opening line, not a prediction of reach. Timing, audience size and the platform&apos;s distribution decide more than any line. That is why Forge measures how well the grade has tracked your own results and tells you, in your Playbook, whether to trust it for you.
          </Limit>
        </Section>

        <Section title="The Voice Fingerprint">
          <p>
            Forge measures how you write from posts you wrote yourself: sentence length and its spread, line breaks per hundred words, how often you use dashes, exclamation marks, questions and semicolons, emoji and hashtags per post, how your posts open, and the words you use more than most people do. Five posts are enough to start; it sharpens up to about forty.
          </p>
          <p>
            A draft is scored against those numbers line by line. Lines that drift (a sentence far longer than you write, punctuation you never use, phrases that read as machine-written) are marked with the reason. The scoring is deterministic and runs in your browser as you type.
          </p>
          <Limit>The fingerprint describes form, not substance. A post can match your rhythm and still say something you would not. Only you can judge that.</Limit>
        </Section>

        <Section title="The Playbook">
          <p>
            When you link a draft to the live post, Forge collects its results at one hour, 24 hours and seven days. Each post is compared with the median of your own posts on the same platform, so a LinkedIn post is never measured against an X post.
          </p>
          <p>
            Findings compare groups of your posts: openings by type, length, format, ending, links, time of day. A finding needs at least three posts on each side and a difference of at least one and a half times, and every finding shows the sample it rests on. Medians are used throughout so one viral post cannot become a strategy.
          </p>
          <Limit>With a few dozen posts these are tendencies, not laws. Forge says so, and shows nothing until there is enough data to say anything.</Limit>
        </Section>

        <Section title="Niche insights">
          <p>
            Creators can opt in to contributing patterns, never text, to what their niche sees: which bucket a post fell in and how it did against that creator&apos;s own median. Each creator counts once per pattern, and a pattern is shown only when at least five creators contribute to it.
          </p>
        </Section>

        <Section title="What Forge will not do">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>Invent statistics, studies, client results or quotes. Where a specific is needed and unknown, drafts use a [bracketed placeholder] for you to fill.</li>
            <li>Post to X for you, or reply on your behalf. X drafts open in X&apos;s own composer and you press Post.</li>
            <li>Show benchmarks like &ldquo;accounts like yours average&rdquo;. Audits and the Playbook use only your own numbers.</li>
          </ul>
        </Section>

        <div className="mt-16 flex flex-wrap gap-3">
          <Link href="/#try" className="inline-flex h-12 items-center rounded-full bg-white px-6 text-[15px] font-medium text-black hover:bg-white/85">
            Grade a hook
          </Link>
          <Link href="/audit" className="inline-flex h-12 items-center rounded-full border border-white/15 px-6 text-[15px] font-medium text-white hover:bg-white/[0.04]">
            Audit an X account
          </Link>
        </div>
      </article>

      <SiteFooter />
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-16">
      <h2 className="text-[26px] font-semibold tracking-[-0.03em] text-white sm:text-[30px]">{title}</h2>
      <div className="mt-4 flex flex-col gap-4 text-[16.5px] leading-[1.7] text-white/70">{children}</div>
    </section>
  );
}

function Limit({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[18px] border-l-2 border-[#FF8A2B]/60 bg-[#FF8A2B]/[0.06] px-5 py-4 text-[15px] leading-relaxed text-white/75">
      <span className="font-semibold text-white">The limit. </span>
      {children}
    </p>
  );
}
