"use client";

import { useState } from "react";
import type { FaqItem } from "@/lib/tools-config";

export default function FAQAccordion({ faqs }: { faqs: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {faqs.map((faq, i) => {
        const isOpen = openIndex === i;
        return (
          <div
            key={faq.q}
            className="overflow-hidden rounded-xl border border-neutral-200 bg-white transition-colors hover:border-neutral-300 shadow-sm"
          >
            <button
              onClick={() => setOpenIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between px-5 py-4 text-left text-sm sm:text-base font-medium text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            >
              {faq.q}
              <svg
                className={`ml-4 h-5 w-5 shrink-0 text-neutral-400 transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isOpen && (
              <div className="px-5 pb-5 animate-in fade-in slide-in-from-top-1 duration-200">
                <p className="text-sm sm:text-base leading-relaxed text-neutral-600">
                  {faq.a}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}