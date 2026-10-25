import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/service';
import { isUuid } from '@/lib/forge/http';
import type { AuditReport } from '@/lib/x/audit';
import { AuditResult } from './audit-result';

const BASE_URL = 'https://forgeyourway.dev';

export const revalidate = 3600;

async function loadAudit(id: string): Promise<{ report: AuditReport; createdAt: string } | null> {
  if (!isUuid(id)) return null;
  const { data } = await createServiceClient().from('profile_audits').select('report, created_at').eq('id', id).maybeSingle();
  return data ? { report: data.report as AuditReport, createdAt: data.created_at as string } : null;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const audit = await loadAudit(params.id);
  if (!audit) return { title: 'Audit not found | Forge' };
  const { user, narrative } = audit.report;
  const title = `@${user.username}: X profile audit | Forge`;
  const description = narrative.headline || `What is holding @${user.username} back, from their last twenty posts.`;
  return {
    title,
    description,
    alternates: { canonical: `${BASE_URL}/audit/${params.id}` },
    openGraph: { title, description, url: `${BASE_URL}/audit/${params.id}`, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
    robots: { index: false, follow: true },
  };
}

export default async function SharedAuditPage({ params }: { params: { id: string } }) {
  const audit = await loadAudit(params.id);
  if (!audit) notFound();
  return <AuditResult report={audit.report} createdAt={audit.createdAt} />;
}
