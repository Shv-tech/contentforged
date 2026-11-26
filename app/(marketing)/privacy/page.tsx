// app/(marketing)/privacy/page.tsx
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Architecture | Forge',
  description: 'How Forge isolates, processes, and protects your proprietary data.',
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-[#d18a5e]/30 pt-32 pb-32 font-sans relative overflow-hidden">
      {/* Structural Background Graphic */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_20%,#000_70%,transparent_100%)] pointer-events-none -z-10" />

      <main className="max-w-[800px] mx-auto px-6 relative z-10">
        <header className="mb-20">
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#d18a5e] mb-6">
            Data Telemetry & Processing
          </p>
          <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-white mb-6">
            Privacy Architecture
          </h1>
          <p className="text-white/40 text-sm font-mono">
            Effective Date: June 30, 2026
          </p>
        </header>

        <article className="prose prose-invert prose-p:text-white/60 prose-p:leading-relaxed prose-headings:text-white prose-headings:font-medium prose-headings:tracking-tight prose-a:text-[#d18a5e] hover:prose-a:text-white max-w-none">
          
          <section className="mb-12">
            <h2 className="text-2xl mb-4">1. The Principle of Minimal Telemetry</h2>
            <p>
              Forge, operated by SHV Groups Pvt Ltd, is engineered on the principle of data minimalism. We ingest only the exact data vectors required to execute systemic operations and compute your Brand DNA. We do not engage in surveillance capitalism, we do not sell your context to advertisers, and we do not harvest peripheral personal details. 
            </p>
            <p>
              Logging into our application serves as an explicit cryptographic handshake, acknowledging and consenting to the data practices defined in this document.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl mb-4">2. The Data We Process</h2>
            <p>
              To operate the Forge infrastructure, we process specific categories of data:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-white/60 mb-6 marker:text-[#d18a5e]">
              <li><strong>Authentication Data:</strong> OAuth tokens, email addresses, and encrypted password hashes required to secure your workspace.</li>
              <li><strong>Contextual Intelligence (Brand DNA):</strong> The specific text, stylistic guidelines, historical posts, and analytical telemetry you deliberately upload into the system to calibrate the AI model to your voice.</li>
              <li><strong>System Interaction Logs:</strong> API request timestamps, error tracing, and UI interaction telemetry to maintain systemic stability and prevent abuse.</li>
            </ul>
            <p>
              <strong>Zero Payment Data:</strong> SHV Groups Pvt Ltd completely abdicates the processing and storage of financial instruments. All payment processing is routed through Razorpay. We receive only a cryptographic webhook confirming your subscription status; your credit card details never touch our servers.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl mb-4">3. Server Infrastructure and Global Routing</h2>
            <p>
              Forge utilizes Supabase as our primary backend-as-a-service (BaaS) provider. To ensure optimal latency and stringent data protection, our core PostgreSQL databases and vector storage are physically housed in East Asia, specifically within highly secured server clusters located in <strong>Tokyo, Japan</strong>.
            </p>
            <p>
              By utilizing the Service, you consent to the cross-border transfer, processing, and storage of your Brand DNA and contextual data in Tokyo, governed by international data protection protocols and Supabase&apos;s enterprise security architecture.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl mb-4">4. Third-Party Intelligence Models</h2>
            <p>
              Forge operates as a highly specialized intelligence layer. To generate the final output, portions of your Brand DNA and prompts are securely transmitted to Tier-1 foundational model providers (such as OpenAI or Anthropic) via Enterprise APIs. 
            </p>
            <p>
              We maintain strict Data Processing Agreements (DPAs) with these providers, ensuring that your inputs and outputs are explicitly opted-out from being used to train their global foundational models. Your data remains your proprietary asset.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl mb-4">5. Data Retention and Destruction</h2>
            <p>
              Your Brand DNA and generated content persist in our Tokyo servers as long as your workspace remains active. If you initiate an account deletion protocol, the system initiates a hard purge. All vector embeddings, relational database entries, and contextual logic associated with your user ID are cryptographically wiped within 30 days, leaving only anonymized billing receipts for legal compliance.
            </p>
          </section>

        </article>
      </main>
    </div>
  );
}