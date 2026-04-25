import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Shield } from 'lucide-react';

export default function PrivacyPage() {
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
            <Shield className="w-5 h-5 text-gray-900" />
          </div>
          <h1 className="text-[32px] font-semibold tracking-tight">Privacy Policy</h1>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-8 md:p-12 shadow-sm space-y-8 text-[15px] leading-relaxed text-gray-600">
          
          <section>
            <h2 className="text-[18px] font-semibold text-gray-900 mb-4">1. The "Bring Your Own Key" Promise</h2>
            <p>
              ContentForge operates on a Bring Your Own Key (BYOK) architecture. <strong>We do not store your OpenAI or Anthropic API keys on our servers.</strong> Your keys are saved strictly within your browser's local storage (`localStorage`). We cannot access, view, or use your API keys outside of your active, local browser session.
            </p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-gray-900 mb-4">2. Data We Collect</h2>
            <p className="mb-3">We collect minimal data necessary to maintain your workspace subscription:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Account Information:</strong> Your email address and basic authentication data provided via Supabase.</li>
              <li><strong>Billing Information:</strong> Processed securely by Razorpay. We do not store your credit card numbers.</li>
              <li><strong>Usage Analytics:</strong> Basic, anonymized telemetry on tool usage to improve platform performance.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-gray-900 mb-4">3. Content & Output Ownership</h2>
            <p>
              Any text, prompts, or content you input into ContentForge, as well as the resulting outputs, belong entirely to you. Because the generation happens via your personal API keys directly to the LLM providers, ContentForge does not claim ownership, copyright, or training rights over your generated material.
            </p>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-gray-900 mb-4">4. Third-Party Services</h2>
            <p>
              To operate our service, we utilize industry-standard infrastructure:
            </p>
            <ul className="list-disc pl-5 mt-3 space-y-2">
              <li><strong>Supabase:</strong> For secure user authentication and database management.</li>
              <li><strong>Razorpay:</strong> For secure payment processing.</li>
              <li><strong>OpenAI / Anthropic:</strong> For processing your prompts (via your own keys). Please refer to their respective privacy policies regarding data retention.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[18px] font-semibold text-gray-900 mb-4">5. Contact Us</h2>
            <p>
              If you have questions about this privacy policy or your data, please contact us at contact@shvgroups.com.
            </p>
            <p className="mt-4 text-[13px] text-gray-400">Last updated: April 2026</p>
          </section>

        </div>
      </main>
    </div>
  );
}