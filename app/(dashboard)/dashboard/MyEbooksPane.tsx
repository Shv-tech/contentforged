// MyEbooksPane.tsx
'use client';

import { useEffect, useState } from 'react';
import { Search, BookOpen, Download, Share2, MoreVertical, Trash2, X, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import { useAppStore } from '@/lib/store';
import toast from 'react-hot-toast';
import EbookCanvas from '@/components/EbookCanvas';

interface Ebook {
  id: string; title: string; content: string; word_count: number;
  is_public: boolean; share_token: string; created_at: string;
}

export function MyEbooksPane() {
  const { user } = useAppStore();
  const [ebooks, setEbooks] = useState<Ebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [reading, setReading] = useState<Ebook | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const supabase = createClient();

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from('ebooks').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    setEbooks(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const filtered = ebooks.filter(e => e.title.toLowerCase().includes(query.toLowerCase()));

  const toggleShare = async (ebook: Ebook) => {
    const next = !ebook.is_public;
    const { error } = await supabase.from('ebooks').update({ is_public: next }).eq('id', ebook.id);
    if (error) { toast.error('Could not update sharing.'); return; }
    setEbooks(prev => prev.map(e => e.id === ebook.id ? { ...e, is_public: next } : e));
    if (next) {
      navigator.clipboard.writeText(`${window.location.origin}/share/ebook/${ebook.share_token}`);
      toast.success('Public link copied to clipboard.');
    } else toast.success('Ebook is now private.');
    setMenuOpenId(null);
  };

  const deleteEbook = async (id: string) => {
    await supabase.from('ebooks').delete().eq('id', id);
    setEbooks(prev => prev.filter(e => e.id !== id));
    setMenuOpenId(null);
  };

  if (reading) {
    return (
      <div className="relative w-full h-full">
        <button onClick={() => setReading(null)} className="absolute top-5 left-5 z-[70] flex items-center gap-2 px-4 py-2 rounded-full bg-white/90 backdrop-blur-md shadow-md text-[13px] font-semibold text-gray-800 hover:bg-white transition">
          <X className="w-4 h-4" /> Close
        </button>
        <EbookCanvas title={reading.title} content={reading.content} />
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar bg-[#000] px-8 pt-8 pb-16">
      <div className="max-w-5xl mx-auto">
        <div className="relative max-w-xl mx-auto mb-10">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Ebook..."
            className="w-full bg-[#161616] border border-[#2a2a2a] rounded-full pl-6 pr-14 py-3.5 text-[14px] text-white placeholder:text-[#666] outline-none focus:border-[#444] transition"
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'radial-gradient(circle at center, #bf671d 0%, #3b1803 100%)' }}>
            <Search className="w-4 h-4 text-white" />
          </div>
        </div>

        {loading && <div className="flex justify-center pt-20"><Loader2 className="w-5 h-5 text-[#444] animate-spin" /></div>}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-20 text-center gap-3">
            <BookOpen className="w-9 h-9 text-[#2a2a2a]" />
            <p className="text-[14px] text-[#666]">{query ? `No ebooks match "${query}"` : 'No ebooks yet — use the Ebook Writer tool in chat to create one.'}</p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8">
          {filtered.map(ebook => (
            <div key={ebook.id} className="group relative">
              <button onClick={() => setReading(ebook)} className="w-full aspect-square rounded-2xl flex items-center justify-center text-center p-5 shadow-lg transition-transform group-hover:scale-[1.02]" style={{ background: 'radial-gradient(circle at 30% 20%, #c9711f 0%, #3b1803 70%, #1a0a02 100%)' }}>
                <span className="text-[15px] font-semibold text-white/95 leading-snug line-clamp-4">{ebook.title}</span>
              </button>
              <button onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === ebook.id ? null : ebook.id); }} className="absolute top-2.5 right-2.5 p-1 rounded-md text-white/70 hover:text-white hover:bg-black/30 transition">
                <MoreVertical className="w-4 h-4" />
              </button>
              {menuOpenId === ebook.id && (
                <div className="absolute top-10 right-2.5 z-20 w-[170px] bg-[#1c1c1c] border border-[#2a2a2a] rounded-xl shadow-2xl py-1.5">
                  <button onClick={() => setReading(ebook)} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-[#e0e0e0] hover:bg-[#2a2a2a]"><BookOpen className="w-3.5 h-3.5 text-[#888]" /> Read</button>
                  <button onClick={() => setReading(ebook)} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-[#e0e0e0] hover:bg-[#2a2a2a]"><Download className="w-3.5 h-3.5 text-[#888]" /> Download PDF</button>
                  <button onClick={() => toggleShare(ebook)} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-[#e0e0e0] hover:bg-[#2a2a2a]"><Share2 className="w-3.5 h-3.5 text-[#888]" /> {ebook.is_public ? 'Unshare' : 'Share'}</button>
                  <button onClick={() => deleteEbook(ebook.id)} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-red-400 hover:bg-[#2a2a2a]"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                </div>
              )}
              <p className="mt-3 text-[13px] font-medium text-[#ccc] text-center truncate px-1">{ebook.title}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}