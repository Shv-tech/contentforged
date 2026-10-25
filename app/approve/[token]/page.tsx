import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadApproval } from '@/lib/forge/approvals';
import { ApprovalClient } from './approval-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Approve a post | Forge',
  robots: { index: false, follow: false },
};

export default async function ApprovalPage({ params }: { params: { token: string } }) {
  const approval = await loadApproval(params.token);
  if (!approval) notFound();
  // Only what the client needs; internal ids stay on the server.
  const { id: _id, userId: _userId, draftId: _draftId, ...view } = approval;
  return <ApprovalClient approval={view} />;
}
