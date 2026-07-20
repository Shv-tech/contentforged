// app/tools/[slug]/page.tsx

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getToolBySlug, getRelatedTools, TOOLS, PLATFORM_LABELS } from "@/lib/tools-config";
import ToolPageClient from "../../../components/tools/ToolsPageClient";
import FAQAccordion from "../../../components/tools/FAQAccordion";
import MoreTools from "../../../components/tools/MoreTools";
import ForgePromoBanner from "../../../components/tools/ForgePromoBanner";
import AdSlot from "../../../components/tools/AdSlot";
import ToolsFooter from "@/components/tools/ToolsFooter";

interface Props {
  params: { slug: string };
}

export function generateStaticParams() {
  return TOOLS.map((tool) => ({ slug: tool.slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const tool = getToolBySlug(params.slug);
  if (!tool) return {};

  const url = `https://forge.theutopianspace.com/tools/${tool.slug}`;

  return {
    title: tool.metaTitle,
    description: tool.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: tool.metaTitle,
      description: tool.metaDescription,
      url,
      siteName: "ContentForge",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: tool.metaTitle,
      description: tool.metaDescription,
    },
  };
}

export default function ToolPage({ params }: Props) {
  const tool = getToolBySlug(params.slug);
  if (!tool) notFound();

  const relatedTools = getRelatedTools(tool);
  const platformLabel = PLATFORM_LABELS[tool.platform];

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: tool.faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: tool.h1,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any (Web)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />

      {/* Pure white, high-end minimalist styling */}
      <main className="min-h-screen bg-white text-neutral-900 selection:bg-neutral-200">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
          
          {/* Hero */}
          <header className="text-center mb-10">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-neutral-400">
              Free {platformLabel} Tool
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">
              {tool.h1}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base text-neutral-500">
              {tool.subhead}
            </p>
          </header>

          <div className="my-8">
            <AdSlot slotId="tool-top" />
          </div>

          {/* Generator Client Component */}
          <div className="my-12">
            <ToolPageClient tool={tool} />
          </div>

          <ForgePromoBanner toolPlatform={platformLabel} />

          {/* How to Use */}
          <section className="mt-20">
            <h2 className="mb-8 text-2xl font-semibold tracking-tight text-neutral-900">
              How to use this {platformLabel} {tool.name.toLowerCase()}
            </h2>
            <ol className="space-y-8">
              {tool.howToUse.map((step, i) => (
                <li key={step.title} className="flex gap-5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium text-neutral-600">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-base font-medium text-neutral-900">{step.title}</h3>
                    <p className="mt-1.5 text-base leading-relaxed text-neutral-500">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="my-16">
            <AdSlot slotId="tool-mid" />
          </div>

          {/* FAQ */}
          <section className="mt-20 border-t border-neutral-100 pt-16">
            <h2 className="mb-8 text-2xl font-semibold tracking-tight text-neutral-900">
              Frequently asked questions
            </h2>
            <FAQAccordion faqs={tool.faq} />
          </section>

          {/* Internal Linking */}
          <section className="mt-20 border-t border-neutral-100 pt-16">
            <h2 className="mb-8 text-2xl font-semibold tracking-tight text-neutral-900">
              More free {platformLabel} tools
            </h2>
            <MoreTools tools={relatedTools} />
          </section>

          <div className="mt-16">
            <AdSlot slotId="tool-bottom" />
          </div>
          
{/* Internal Linking - Only shows if related tools actually exist in the array */}
          {relatedTools.length > 0 && (
            <section className="mt-20 border-t border-neutral-100 pt-16">
              <h2 className="mb-8 text-2xl font-semibold tracking-tight text-neutral-900">
                More free {platformLabel} tools
              </h2>
              <MoreTools tools={relatedTools} />
            </section>
          )}

          <div className="mt-16">
            <AdSlot slotId="tool-bottom" />
          </div>
          
        </div>
      </main>

      {/* The massive tool library footer spans the full width at the very bottom */}
      <ToolsFooter />
    </>
  );
}