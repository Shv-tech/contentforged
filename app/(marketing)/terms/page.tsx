// app/(marketing)/terms/page.tsx
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | Forge',
  description: 'The legal terms and conditions governing your use of the Forge operating system.',
};

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-[#d18a5e]/30 pt-32 pb-32 font-sans relative overflow-hidden">
      {/* Structural Background Graphic */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_20%,#000_70%,transparent_100%)] pointer-events-none -z-10" />

      <main className="max-w-[800px] mx-auto px-6 relative z-10">
        <header className="mb-20">
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#d18a5e] mb-6">
            Legal Infrastructure
          </p>
          <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-white mb-6">
            Terms of Service
          </h1>
          <p className="text-white/40 text-sm font-mono">
            Effective Date: June 30, 2026
          </p>
        </header>

        <article className="prose prose-invert prose-p:text-white/60 prose-p:leading-relaxed prose-headings:text-white prose-headings:font-medium prose-headings:tracking-tight prose-a:text-[#d18a5e] hover:prose-a:text-white max-w-none">
          
          <section className="mb-12">
            <h2 className="text-2xl mb-4">1. Acceptance of Terms</h2>
            <p>
              By accessing, registering for, or utilizing the Forge platform (&quot;Service&quot;), operated by SHV Groups Pvt Ltd (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). Logging into the platform, creating an account, or executing any authentication sequence constitutes your explicit, irrevocable consent to these Terms, our Privacy Policy, and our Security Protocols. If you do not agree to these Terms in their entirety, you are strictly prohibited from accessing or utilizing the Service.
            </p>
            <p>
              These Terms establish a legally binding agreement between you (the &quot;User&quot;) and SHV Groups Pvt Ltd. The Service is classified as enterprise-grade software infrastructure; accordingly, these terms reflect a commercial relationship governing software-as-a-service (SaaS) architecture.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl mb-4">2. Description of the Operating System</h2>
            <p>
              Forge is an artificial intelligence-driven content operating system designed to analyze, structure, and generate text based on specific user-provided heuristics, historical performance data, and localized stylistic guidelines (collectively referred to as &quot;Brand DNA&quot;).
            </p>
            <p>
              The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. While our underlying models undergo rigorous training and structural fine-tuning, SHV Groups Pvt Ltd does not guarantee the factual accuracy, platform compliance, or absolute algorithmic performance of the generated output. The User retains ultimate editorial control and liability for any content published using the Service.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl mb-4">3. Financial Architecture and Payment Delegation</h2>
            <p>
              SHV Groups Pvt Ltd maintains a strict zero-knowledge architecture regarding your financial data. We do not collect, process, or store credit card numbers, bank account details, or any localized payment information on our servers.
            </p>
            <p>
              All financial transactions, subscription billing, and token purchases are securely delegated to and processed entirely by our authorized payment gateway partner, <strong>Razorpay</strong>. By initiating a subscription, you are bound by Razorpay&apos;s Terms of Service and Privacy Policy. Your obligation to pay for the Service continues until your subscription is actively terminated via the billing portal. Failure to complete payment via Razorpay will result in the immediate automated suspension of API access and computation rights.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl mb-4">4. Data Sovereignty and Brand DNA</h2>
            <p>
              <strong>Your Input, Your Output:</strong> You retain full intellectual property ownership of the raw data, stylistic guidelines, and historical content you upload into the Service to generate your &quot;Brand DNA.&quot; Furthermore, you own the finalized, user-approved outputs generated by the Service during your active subscription.
            </p>
            <p>
              <strong>Infrastructure Ownership:</strong> SHV Groups Pvt Ltd retains exclusive, unrestricted ownership of the underlying machine learning architectures, weights, fine-tuning protocols, user interface, source code, and the proprietary methodological frameworks (e.g., &quot;Performance Autopsy&quot;) that power Forge.
            </p>
            <p>
              <strong>Data Isolation:</strong> We process your Brand DNA exclusively to serve your account. We do not aggregate your proprietary strategic data into a global pool to train base foundational models accessible by other users. Your competitive advantage remains cryptographically isolated.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl mb-4">5. Acceptable Use and System Integrity</h2>
            <p>
              You agree not to utilize Forge for any activity that compromises the integrity of the infrastructure or violates applicable law. Prohibited conduct includes, but is not limited to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-white/60 mb-6 marker:text-[#d18a5e]">
              <li>Attempting to reverse-engineer, decompile, or extract the source code or model weights of the Service.</li>
              <li>Deploying automated extraction systems (scraping) against our frontend or backend APIs.</li>
              <li>Generating content that violates the terms of service of target platforms (e.g., LinkedIn, X, Meta) through malicious prompt injection.</li>
              <li>Utilizing the system to generate unlawful, defamatory, or highly sensitive restricted material.</li>
              <li>Attempting to bypass the token limitations or organizational seat limits defined by your billing tier.</li>
            </ul>
            <p>
              Violation of these systemic constraints will result in immediate, non-refundable termination of your workspace.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl mb-4">6. Limitation of Liability and Indemnification</h2>
            <p>
              <strong>NO WARRANTIES:</strong> TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICE IS PROVIDED WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED. SHV GROUPS PVT LTD EXPLICITLY DISCLAIMS ANY WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
            </p>
            <p>
              <strong>LIMITATION OF LIABILITY:</strong> IN NO EVENT SHALL SHV GROUPS PVT LTD, ITS DIRECTORS, EMPLOYEES, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM (A) YOUR ACCESS TO OR USE OF OR INABILITY TO ACCESS OR USE THE SERVICE; (B) ANY CONDUCT OR CONTENT OF ANY THIRD PARTY ON THE SERVICE; (C) ANY CONTENT OBTAINED FROM THE SERVICE; AND (D) UNAUTHORIZED ACCESS, USE, OR ALTERATION OF YOUR TRANSMISSIONS OR CONTENT, WHETHER BASED ON WARRANTY, CONTRACT, TORT (INCLUDING NEGLIGENCE), OR ANY OTHER LEGAL THEORY, WHETHER OR NOT WE HAVE BEEN INFORMED OF THE POSSIBILITY OF SUCH DAMAGE.
            </p>
            <p>
              <strong>INDEMNIFICATION:</strong> You agree to defend, indemnify, and hold harmless SHV Groups Pvt Ltd against any claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees resulting from your violation of these Terms or your use of the Service.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl mb-4">7. Governing Law and Dispute Resolution</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of India, without regard to its conflict of law provisions. Any dispute arising from or relating to the subject matter of these Terms shall be subject to the exclusive jurisdiction of the competent courts located in New Delhi, India.
            </p>
          </section>

        </article>
      </main>
    </div>
  );
}