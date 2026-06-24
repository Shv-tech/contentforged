// CalendarPane.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, ChevronLeft, ChevronRight, X, Share2, Loader2, Trash2, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import { useAppStore } from '@/lib/store';
import toast from 'react-hot-toast';

interface CalEvent {
  id: string; title: string; description: string | null; start_date: string;
  type: string; platform: string | null; color: string; is_public: boolean;
  share_token: string; reminder_minutes_before: number | null;
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const TYPES = [
  { value: 'post', label: 'Post', color: '#d18a5e' },
  { value: 'deadline', label: 'Deadline', color: '#e05555' },
  { value: 'meeting', label: 'Meeting', color: '#5588e0' },
  { value: 'task', label: 'Task', color: '#55aa77' },
];

export function CalendarPane() {
  const { user } = useAppStore();
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [form, setForm] = useState({ title: '', description: '', time: '09:00', type: 'post', platform: '', reminder_minutes_before: 60 });
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const rangeStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString();
    const rangeEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const { data } = await supabase.from('calendar_events').select('*').eq('user_id', user.id).gte('start_date', rangeStart).lte('start_date', rangeEnd).order('start_date');
    setEvents(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user, cursor.getMonth(), cursor.getFullYear()]);

  const cells = useMemo(() => {
    const firstWeekday = monthStart.getDay();
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const out: (number | null)[] = Array(firstWeekday).fill(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const eventsOnDay = (day: number) => {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter(e => e.start_date.startsWith(key) && e.title.toLowerCase().includes(query.toLowerCase()));
  };

  const today = new Date();
  const weekEvents = useMemo(() => {
    const start = new Date(today); start.setDate(today.getDate() - today.getDay()); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(start.getDate() + 7);
    return events.filter(e => { const d = new Date(e.start_date); return d >= start && d < end; })
      .sort((a,b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  }, [events]);

  const openNewEvent = (day: number) => {
    setModalDate(new Date(cursor.getFullYear(), cursor.getMonth(), day));
    setEditing(null);
    setForm({ title: '', description: '', time: '09:00', type: 'post', platform: '', reminder_minutes_before: 60 });
  };

  const openEditEvent = (ev: CalEvent) => {
    const d = new Date(ev.start_date);
    setModalDate(d);
    setEditing(ev);
    setForm({ title: ev.title, description: ev.description || '', time: d.toTimeString().slice(0,5), type: ev.type, platform: ev.platform || '', reminder_minutes_before: ev.reminder_minutes_before ?? 60 });
  };

  const saveEvent = async () => {
    if (!modalDate || !form.title.trim() || !user) return;
    setSaving(true);
    const [hh, mm] = form.time.split(':').map(Number);
    const startDate = new Date(modalDate);
    startDate.setHours(hh, mm, 0, 0);

    const payload = {
      user_id: user.id, title: form.title, description: form.description || null,
      start_date: startDate.toISOString(), type: form.type, platform: form.platform || null,
      color: TYPES.find(t => t.value === form.type)?.color || '#d18a5e',
      reminder_minutes_before: form.reminder_minutes_before,
    };

    if (editing) await supabase.from('calendar_events').update(payload).eq('id', editing.id);
    else await supabase.from('calendar_events').insert(payload);

    setSaving(false); setModalDate(null); setEditing(null); load();
    toast.success(editing ? 'Event updated.' : 'Scheduled — confirmation email on its way.');
  };

  const deleteEvent = async () => {
    if (!editing) return;
    await supabase.from('calendar_events').delete().eq('id', editing.id);
    setModalDate(null); setEditing(null); load();
  };

  const shareEvent = async (ev: CalEvent) => {
    const next = !ev.is_public;
    await supabase.from('calendar_events').update({ is_public: next }).eq('id', ev.id);
    if (next) { navigator.clipboard.writeText(`${window.location.origin}/share/event/${ev.share_token}`); toast.success('Public link copied.'); }
    load();
  };

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar bg-[#000] flex flex-col lg:flex-row gap-8 px-6 md:px-10 pt-8 pb-16">
      <div className="flex-1 max-w-3xl mx-auto lg:mx-0 w-full">
        <div className="relative max-w-xl mx-auto mb-8">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Schedule..." className="w-full bg-[#161616] border border-[#2a2a2a] rounded-full pl-6 pr-14 py-3.5 text-[14px] text-white placeholder:text-[#666] outline-none focus:border-[#444] transition" />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'radial-gradient(circle at center, #bf671d 0%, #3b1803 100%)' }}>
            <Search className="w-4 h-4 text-white" />
          </div>
        </div>

        <div className="flex items-center justify-between mb-6">
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1))} className="p-1.5 text-[#666] hover:text-white transition"><ChevronLeft className="w-4 h-4" /></button>
          <h2 className="font-serif text-[15px] text-[#ddd] tracking-wide">{monthLabel}</h2>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1))} className="p-1.5 text-[#666] hover:text-white transition"><ChevronRight className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-7 mb-3">
          {DAYS.map(d => <div key={d} className="font-serif text-[12px] text-[#888] tracking-[2px] text-center">{d}</div>)}
        </div>

        {loading ? (
          <div className="flex justify-center pt-16"><Loader2 className="w-5 h-5 text-[#444] animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-7 gap-y-6">
            {cells.map((day, i) => {
              const dayEvents = day ? eventsOnDay(day) : [];
              const isToday = day === today.getDate() && cursor.getMonth() === today.getMonth() && cursor.getFullYear() === today.getFullYear();
              return (
                <div key={i} className="flex flex-col items-center gap-1.5 min-h-[64px]">
                  {day && (
                    <>
                      <button onClick={() => openNewEvent(day)} className={`font-serif text-[18px] w-8 h-8 rounded-full flex items-center justify-center transition ${isToday ? 'bg-[#bf671d] text-white' : 'text-[#ccc] hover:bg-[#1a1a1a]'}`}>{day}</button>
                      <div className="flex flex-col gap-1 w-full px-1">
                        {dayEvents.slice(0, 2).map(ev => (
                          <button key={ev.id} onClick={() => openEditEvent(ev)} className="text-[10px] font-medium text-white/90 truncate px-1.5 py-0.5 rounded" style={{ background: `${ev.color}33` }}>{ev.title}</button>
                        ))}
                        {dayEvents.length > 2 && <span className="text-[9px] text-[#666] text-center">+{dayEvents.length - 2}</span>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="w-full lg:w-[300px] shrink-0 pt-2">
        <h3 className="text-[14px] text-[#bbb] mb-5">Hey {(user as any)?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'}, your schedule for this week</h3>
        <div className="space-y-4">
          {weekEvents.length === 0 && <p className="text-[13px] text-[#555]">Nothing scheduled this week.</p>}
          {weekEvents.map(ev => {
            const d = new Date(ev.start_date);
            return (
              <div key={ev.id} className="flex items-start gap-3 group">
                <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl shrink-0 text-white" style={{ background: ev.color }}>
                  <span className="text-[14px] font-bold leading-none">{d.getDate()}</span>
                  <span className="text-[9px] uppercase tracking-wider leading-none mt-0.5">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-white truncate">{ev.title}</p>
                  <button onClick={() => openEditEvent(ev)} className="text-[11px] text-[#888] hover:text-[#bbb] transition">view details</button>
                </div>
                <button onClick={() => shareEvent(ev)} className="opacity-0 group-hover:opacity-100 transition text-[#666] hover:text-[#d18a5e]"><Share2 className="w-3.5 h-3.5" /></button>
              </div>
            );
          })}
        </div>
      </div>

      {modalDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setModalDate(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-[#111] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-white">{editing ? 'Edit Event' : 'New Event'} · {modalDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</h3>
              <button onClick={() => setModalDate(null)} className="text-[#666] hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Event title" className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-[14px] text-white placeholder:text-[#666] outline-none focus:border-[#444]" />
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Notes (optional)" rows={2} className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-[13px] text-white placeholder:text-[#666] outline-none focus:border-[#444] resize-none" />
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map(t => (
                <button key={t.value} onClick={() => setForm(f => ({ ...f, type: t.value }))} className="py-2 rounded-lg text-[12px] font-medium border transition" style={form.type === t.value ? { background: `${t.color}26`, borderColor: t.color, color: t.color } : { borderColor: '#2a2a2a', color: '#777' }}>{t.label}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} placeholder="Platform (optional)" className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-[13px] text-white placeholder:text-[#666] outline-none focus:border-[#444]" />
              <input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#444] [color-scheme:dark]" />
            </div>
            <div className="flex items-center gap-2 text-[12px] text-[#888]">
              <Mail className="w-3.5 h-3.5" /> Email reminder
              <select value={form.reminder_minutes_before} onChange={e => setForm(f => ({ ...f, reminder_minutes_before: Number(e.target.value) }))} className="ml-auto bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1 text-[12px] text-white outline-none">
                <option value={0}>At time of event</option>
                <option value={30}>30 min before</option>
                <option value={60}>1 hour before</option>
                <option value={1440}>1 day before</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              {editing && <button onClick={deleteEvent} className="px-4 py-2.5 rounded-xl text-[13px] font-medium text-red-400 border border-red-500/20 hover:bg-red-500/10 transition flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Delete</button>}
              <button onClick={saveEvent} disabled={saving || !form.title.trim()} className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold text-white transition disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'radial-gradient(circle at center, #bf671d 0%, #3b1803 100%)' }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'Save Changes' : 'Schedule It'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}