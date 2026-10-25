/**
 * The image X, LinkedIn and Slack show when a grade link is shared.
 * 1200x675 (16:9) because that is what X renders largest.
 */

import { ImageResponse } from 'next/og';
import { loadGradeCard } from '@/lib/forge/grade-cards';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 675 };
export const contentType = 'image/png';
export const alt = 'A hook graded by Forge';

function heat(score: number): { glow: string; label: string } {
  if (score >= 40) return { glow: 'rgba(255,138,43,0.55)', label: 'Ready to post' };
  if (score >= 30) return { glow: 'rgba(255,176,103,0.35)', label: 'One fix away' };
  return { glow: 'rgba(154,168,184,0.28)', label: 'Still cold' };
}

export default async function Image({ params }: { params: { id: string } }) {
  const card = await loadGradeCard(params.id);
  const score = card?.score ?? 0;
  const { glow, label } = heat(score);
  const hook = card ? (card.hook.length > 150 ? `${card.hook.slice(0, 147)}...` : card.hook) : 'Grade your hook at forgeyourway.dev';

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
          background: `radial-gradient(circle at 85% 110%, ${glow}, rgba(0,0,0,0) 55%), #050505`,
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 26, letterSpacing: 6, fontWeight: 700 }}>FORGE</div>
          <div style={{ display: 'flex', fontSize: 22, color: 'rgba(255,255,255,0.55)' }}>Stop-Scroll Grade</div>
        </div>

        <div style={{ display: 'flex', fontSize: 46, lineHeight: 1.18, fontWeight: 600, maxWidth: 1000, letterSpacing: -1 }}>&ldquo;{hook}&rdquo;</div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', fontSize: 168, fontWeight: 700, lineHeight: 0.9, letterSpacing: -6 }}>{score}</div>
            <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 18, marginBottom: 12 }}>
              <div style={{ display: 'flex', fontSize: 40, color: 'rgba(255,255,255,0.55)' }}>/50</div>
              <div style={{ display: 'flex', fontSize: 26, color: '#FFB067', marginTop: 6 }}>{label}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', width: 380 }}>
            {(card?.breakdown ?? []).map((d) => (
              <div key={d.key} style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
                <div style={{ display: 'flex', width: 190, fontSize: 19, color: 'rgba(255,255,255,0.65)' }}>{d.label}</div>
                <div style={{ display: 'flex', flex: 1, height: 8, borderRadius: 8, background: 'rgba(255,255,255,0.12)' }}>
                  <div style={{ display: 'flex', width: `${d.score * 10}%`, height: 8, borderRadius: 8, background: 'linear-gradient(90deg, #E0570A, #FFB067)' }} />
                </div>
                <div style={{ display: 'flex', width: 36, justifyContent: 'flex-end', fontSize: 19 }}>{d.score}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size
  );
}
