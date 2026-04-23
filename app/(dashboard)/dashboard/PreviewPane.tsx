'use client';

import { useAppStore } from '@/lib/store';
import { Copy, Check, FileText } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

export function PreviewPane() {
  const store = useAppStore();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <section className="w-[40%] h-full flex flex-col bg-[#141414]">
      {/* Header */}
      <div className="h-[61px] border-b border-white/5 flex items-center px-6 justify-between">
        <h2 className="text-[14px] font-medium text-white">Live Render</h2>
        {store.outputs.length > 0 && (
          <span className="text-[12px] text-white/50">{store.outputs.reduce((a, b) => a + b.posts.length, 0)} Posts Generated</span>
        )}
      </div>

      {/* Output Stream */}
      <div className="flex-1 p-6 overflow-y-auto space-y-8 custom-scrollbar">
        {store.outputs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
            <FileText className="w-8 h-8 mb-4 text-white" />
            <p className="text-[13px] font-medium text-white">Awaiting Deployment</p>
            <p className="text-[12px] text-white/60 max-w-[200px] mt-1">Generated content will render here in native platform formats.</p>
          </div>
        ) : (
          store.outputs.map((output) => (
            <div key={output.platform} className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
              <h3 className="text-[11px] font-bold text-white/40 uppercase tracking-wider flex items-center gap-2">
                {output.platform.replace('_', ' ')} <span className="h-[1px] flex-1 bg-white/5"></span>
              </h3>
              
              {output.posts.map((post, i) => {
                const id = `${output.platform}-${i}`;
                const isCopied = copiedId === id;
                return (
                  <div key={i} className="group relative bg-[#1A1A1A] border border-white/5 hover:border-white/10 rounded-lg p-5 transition-colors">
                    {/* Mock Native UI Profile Block */}
                    <div className="flex items-center gap-3 mb-4 opacity-70">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-white/10 to-white/5" />
                      <div>
                        <div className="w-20 h-2 bg-white/20 rounded-sm mb-1.5" />
                        <div className="w-12 h-1.5 bg-white/10 rounded-sm" />
                      </div>
                    </div>
                    
                    <pre className="text-[14px] font-body text-white/90 whitespace-pre-wrap leading-relaxed">
                      {post}
                    </pre>

                    <button
                      onClick={() => copyText(post, id)}
                      className="absolute top-4 right-4 p-2 rounded-md bg-white/5 hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all border border-white/10"
                    >
                      {isCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-white/70" />}
                    </button>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </section>
  );
}