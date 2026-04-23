'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

const BANNED_WORDS = [
  'link in bio', 'click here', 'buy now', 'crypto', 'giveaway', 'bitch', 'fuck', 'shit', 'discount', 'sale'
];

export function ShadowbanChecker({ text }: { text: string }) {
  const [flags, setFlags] = useState<string[]>([]);

  useEffect(() => {
    if (!text) { setFlags([]); return; }
    const lower = text.toLowerCase();
    const found = BANNED_WORDS.filter(w => lower.includes(w));
    setFlags(found);
  }, [text]);

  return (
    <div className="bg-[#1A1A1A] border border-white/10 rounded-lg p-4 animate-in fade-in">
      <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
        {flags.length > 0 ? <ShieldAlert className="w-4 h-4 text-red-500" /> : <ShieldCheck className="w-4 h-4 text-green-500" />}
        <span className="text-[13px] font-bold text-white">Algorithm Safety</span>
      </div>
      {flags.length > 0 ? (
        <div>
          <p className="text-[12px] text-red-400 mb-2">Warning: Found words that may suppress reach.</p>
          <div className="flex flex-wrap gap-1">
            {flags.map(f => (
              <span key={f} className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-[11px] font-mono">"{f}"</span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-green-400">Content looks clean. No flagged spam/suppression words detected.</p>
      )}
    </div>
  );
}