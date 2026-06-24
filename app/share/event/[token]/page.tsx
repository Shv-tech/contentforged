// app/share/event/[token]/page.tsx
import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';

export default async function SharedEventPage({ params }: { params: { token: string } }) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  const { data: ev } = await supabase.from('calendar_events').select('title, description, start_date, type, platform, color').eq('share_token', params.token).eq('is_public', true).single();
  if (!ev) return notFound();

  return (
    <div className="min-h-screen bg-[#000] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#111] border border-[#2a2a2a] rounded-2xl p-8">
        <span className="inline-block text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded mb-4" style={{ background: `${ev.color}26`, color: ev.color }}>{ev.type}</span>
        <h1 className="text-[22px] font-semibold text-white mb-2">{ev.title}</h1>
        <p className="text-[13px] text-[#888] mb-4">{new Date(ev.start_date).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}{ev.platform ? ` · ${ev.platform}` : ''}</p>
        {ev.description && <p className="text-[14px] text-[#ccc] leading-relaxed whitespace-pre-wrap">{ev.description}</p>}
      </div>
    </div>
  );
}