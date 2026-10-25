/**
 * Share image for an audit result: the account, its headline finding, and
 * three of its own numbers.
 */

import { ImageResponse } from 'next/og';
import { isUuid } from '@/lib/forge/http';
import { createServiceClient } from '@/lib/supabase/service';
import type { AuditReport } from '@/lib/x/audit';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 675 };
export const contentType = 'image/png';
export const alt = 'An X profile audit by Forge';

function compact(value: number | null): string {
  if (value === null) return 'n/a';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export default async function Image({ params }: { params: { id: string } }) {
  let report: AuditReport | null = null;
  if (isUuid(params.id)) {
    const { data } = await createServiceClient().from('profile_audits').select('report').eq('id', params.id).maybeSingle();
    report = (data?.report as AuditReport | undefined) ?? null;
  }

  const headline = report?.narrative.headline || 'Why is your X account quiet? Find out in thirty seconds.';
  const stats: Array<[string, string]> = report
    ? [
        ['posts a week', String(report.stats.postsPerWeek)],
        ['median likes', compact(report.stats.medianLikes)],
        ['longest silence', `${report.stats.longestGapDays}d`],
      ]
    : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          background: 'radial-gradient(circle at 10% 120%, rgba(154,168,184,0.35), rgba(0,0,0,0) 55%), #050505',
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 26, letterSpacing: 6, fontWeight: 700 }}>FORGE</div>
          <div style={{ display: 'flex', fontSize: 22, color: 'rgba(255,255,255,0.55)' }}>X profile audit</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {report && <div style={{ display: 'flex', fontSize: 30, color: 'rgba(255,255,255,0.6)', marginBottom: 18 }}>@{report.user.username}</div>}
          <div style={{ display: 'flex', fontSize: 54, lineHeight: 1.12, fontWeight: 600, letterSpacing: -1.5, maxWidth: 1040 }}>{headline}</div>
        </div>
        <div style={{ display: 'flex' }}>
          {stats.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', marginRight: 72 }}>
              <div style={{ display: 'flex', fontSize: 56, fontWeight: 700 }}>{value}</div>
              <div style={{ display: 'flex', fontSize: 22, color: 'rgba(255,255,255,0.5)' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
