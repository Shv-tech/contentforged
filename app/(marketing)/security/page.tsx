// app/(marketing)/security/page.tsx
import { Metadata } from 'next';
import { Shield, Lock, Server, Cpu } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Security Posture | ContentForge',
  description: 'Enterprise-grade security, isolation, and infrastructure resilience.',
};

export default function SecurityCenter() {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-[#d18a5e]/30 pt-32 pb-32 font-sans relative overflow-hidden">
      
      {/* Ambient Copper Light */}
      <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(209,138,94,0.05)_0%,transparent_70%)] pointer-events-none blur-[80px] -z-10" />

      <main className="max-w-[800px] mx-auto px-6 relative z-10">
        <header className="mb-20">
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#d18a5e] mb-6">
            Enterprise Integrity
          </p>
          <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-white mb-6">
            Security Posture
          </h1>
          <p className="text-white/40 text-sm font-mono max-w-xl leading-relaxed">
            ContentForge is not a wrapper. It is a highly engineered operating system. We treat your Brand DNA as critical infrastructure, protected by multi-layered cryptographic isolation and world-class server architecture.
          </p>
        </header>

        {/* Security Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-20">
          <div className="bg-white/[0.02] border border-white/[0.05] p-6 rounded-[20px]">
            <Lock className="w-5 h-5 text-[#d18a5e] mb-4" />
            <h3 className="text-lg font-medium text-white mb-2 tracking-tight">Encryption at Rest & Transit</h3>
            <p className="text-sm text-white/40 leading-relaxed">
              All data transmitted between your local client and our Tokyo infrastructure is secured via TLS 1.3. At rest, your Brand DNA and vector embeddings are encrypted using AES-256 standard encryption on Supabase databases.
            </p>
          </div>
          
          <div className="bg-white/[0.02] border border-white/[0.05] p-6 rounded-[20px]">
            <Server className="w-5 h-5 text-[#d18a5e] mb-4" />
            <h3 className="text-lg font-medium text-white mb-2 tracking-tight">Tokyo Server Clusters</h3>
            <p className="text-sm text-white/40 leading-relaxed">
              Our core logic and database architecture are hosted on Supabase servers physically located in Tokyo, ensuring rapid East-Asian latency, stringent environmental security, and robust disaster recovery protocols.
            </p>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] p-6 rounded-[20px]">
            <Shield className="w-5 h-5 text-[#d18a5e] mb-4" />
            <h3 className="text-lg font-medium text-white mb-2 tracking-tight">Zero Financial Storage</h3>
            <p className="text-sm text-white/40 leading-relaxed">
              Our infrastructure is entirely decoupled from financial processing. All token purchases and subscriptions are handled via Razorpay’s PCI-DSS Level 1 compliant gateways. We store absolutely zero payment data locally.
            </p>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] p-6 rounded-[20px]">
            <Cpu className="w-5 h-5 text-[#d18a5e] mb-4" />
            <h3 className="text-lg font-medium text-white mb-2 tracking-tight">Cryptographic Workspace Isolation</h3>
            <p className="text-sm text-white/40 leading-relaxed">
              For teams and agencies managing multiple clients, Brand DNA is isolated at the database layer utilizing strict Row Level Security (RLS) policies. Cross-contamination of voice or data is mathematically impossible.
            </p>
          </div>
        </div>

        <article className="prose prose-invert prose-p:text-white/60 prose-p:leading-relaxed prose-headings:text-white prose-headings:font-medium prose-headings:tracking-tight max-w-none">
          <section className="mb-12">
            <h2 className="text-2xl mb-4">Vulnerability Management & Uptime</h2>
            <p>
              SHV Groups Pvt Ltd employs continuous integration and continuous deployment (CI/CD) pipelines with automated dependency scanning to detect and patch vulnerabilities in real-time. Our reliance on Supabase architecture provides us with point-in-time recovery, automated backups, and a 99.9% uptime SLA guarantee for our database layer. 
            </p>
            <p>
              In the event of an anomaly or localized outage, our systems automatically implement failover strategies to maintain read-access to your content calendars while compute layers are restored.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl mb-4">Authentication & Authorization</h2>
            <p>
              Access to the ContentForge backend is strictly regulated. We utilize JSON Web Tokens (JWT) for session management, coupled with Supabase Auth. Any attempt to modify data across tenant boundaries is rejected at the API gateway layer before it can even reach our logic processing nodes.
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}