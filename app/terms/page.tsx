import React from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#FAFAFA] text-gray-900 font-sans pb-24">
      <nav className="w-full h-[72px] flex items-center px-6 md:px-12 bg-white border-b border-gray-200 sticky top-0 z-50">
        <Link href="/" className="flex items-center gap-2 text-[14px] font-medium text-gray-500 hover:text-gray-900 transition">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
      </nav>

      <main className="max-w-[800px] mx-auto px-6 pt-16">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-gray-900" />
          </div>
          <h1 className="text-[32px] font-semibold tracking-tight">Terms of Service</h1>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-8 md:p-12 shadow-sm space-y-8 text-[15px] leading-relaxed text-gray-600">
          
          <section>
            <h2 className="text-[18px] font-semibold text-gray-900 mb-4">1. Acceptance of Terms</h2>
            <p>
              By accessing or using ContentForge (a product of SHV Groups), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our platform.
            </p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-gray-900 mb-4">2. Software Access & Subscriptions</h2>
            <p>
              ContentForge charges a flat fee for access to our software interface. Your subscription tier unlocks specific tools and capabilities within the interface. We reserve the right to modify, suspend, or discontinue parts of the service at any time.
            </p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-gray-900 mb-4">3. User Responsibilities (BYOK)</h2>
            <p>
              Because ContentForge relies on your personal API keys (OpenAI, Anthropic, etc.):
            </p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li>You are solely responsible for any usage charges, token costs, or billing limits incurred on your personal LLM provider accounts.</li>
              <li>ContentForge is not responsible for API downtime, rate limits, or bans imposed by third-party LLM providers.</li>
              <li>You agree not to use the platform to generate illegal, harmful, or explicitly prohibited content as defined by the terms of your LLM provider.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-gray-900 mb-4">4. Refunds and Cancellations</h2>
            <p>
              You may cancel your subscription at any time through the Account settings. Upon cancellation, you will immediately lose access to premium tools. Due to the digital nature of the software, we do not offer prorated refunds for partially used billing periods.
            </p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-gray-900 mb-4">5. Limitation of Liability</h2>
            <p>
              ContentForge provides strategic content generation tools, but we do not guarantee viral success, account growth, or specific financial outcomes. To the maximum extent permitted by law, SHV Groups shall not be liable for any indirect, incidental, or consequential damages resulting from the use or inability to use the service.
            </p>
            <p className="mt-4 text-[13px] text-gray-400">Last updated: April 2026</p>
          </section>

        </div>
      </main>
    </div>
  );
}