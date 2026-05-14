'use client';

import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import { Download, FileText, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore } from '@/lib/store';

mermaid.initialize({ startOnLoad: false, theme: 'default' });

const MermaidBlock = ({ code }: { code: string }) => {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chartRef.current) {
      mermaid.render(`mermaid-${Math.random().toString(36).substring(7)}`, code).then((result) => {
        chartRef.current!.innerHTML = result.svg;
      });
    }
  }, [code]);

  return <div ref={chartRef} className="flex justify-center my-8 bg-gray-50 p-6 rounded-xl border border-gray-100" />;
};

export default function SwarmCanvas() {
  const messages = useAppStore((state: any) => state.messages || []);
  const printRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // 1. FAILSAFE EXTRACTION: Grab the absolute last thing the AI said.
  const lastAssistantMessage = [...messages].reverse().find((m: any) => m.role === 'assistant')?.content || '';
  
  // 2. CLEANUP: Strip out the Swarm's <think> logic so it doesn't show on the PDF
  let rawContent = lastAssistantMessage.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  // 3. TITLE EXTRACTION: Try to find a markdown header, otherwise use a default
  const titleMatch = rawContent.match(/^#\s+(.*)/m);
  const title = titleMatch ? titleMatch[1] : "Omni-Swarm Strategy Document";
  
  // Remove the title from the body if we extracted it, so it doesn't duplicate
  if (titleMatch) {
    rawContent = rawContent.replace(/^#\s+(.*)/m, '').trim();
  }

  // EMPTY STATE: If nothing is there yet, show the waiting screen
  if (!rawContent) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 font-mono text-xs gap-4 bg-[#F9FAFB]">
        <div className="w-12 h-12 rounded-full border-2 border-dashed border-gray-200 animate-spin" />
        [ WAITING FOR SWARM OUTPUT ]
      </div>
    );
  }

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    const toastId = toast.loading('Compiling Swarm PDF...');
    
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const element = printRef.current;
      
      if (!element) {
        toast.error('Document is not ready for printing.', { id: toastId });
        setIsDownloading(false);
        return;
      }
      
      const opt = {
        margin:       [20, 20, 20, 20] as [number, number, number, number],
        filename:     `${title.replace(/\s+/g, '_')}.pdf`,
        image:        { type: 'jpeg' as const, quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { 
          unit: 'mm' as const, 
          format: 'a4' as const, 
          orientation: 'portrait' as const 
        }
      };

      await html2pdf().from(element).set(opt).save();
      toast.success('Strategy downloaded successfully!', { id: toastId });
    } catch (err) {
      toast.error('Failed to compile PDF.', { id: toastId });
      console.error(err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center bg-[#F3F4F6] overflow-y-auto pb-24 custom-scrollbar">
      
      {/* Sticky Action Bar */}
      <div className="sticky top-4 z-50 flex items-center justify-between w-full max-w-4xl bg-white/90 backdrop-blur-md px-6 py-4 rounded-2xl border border-gray-200 shadow-sm mb-8 mt-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 fill-white" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 leading-tight">Swarm Strategy</h3>
            <p className="text-xs text-gray-500 font-medium">Ready for deployment</p>
          </div>
        </div>
        
        <button 
          onClick={handleDownloadPDF}
          disabled={isDownloading}
          className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-black transition disabled:opacity-50 shadow-md"
        >
          <Download className="w-4 h-4" />
          {isDownloading ? 'Compiling...' : 'Download PDF'}
        </button>
      </div>

      {/* The Printable A4 Page Format */}
      <div 
        ref={printRef}
        className="bg-white w-full max-w-4xl min-h-[297mm] p-12 md:p-24 shadow-2xl rounded-sm text-gray-900 font-serif"
      >
        <div className="flex justify-between items-center mb-12 border-b border-gray-100 pb-4">
          <span className="text-[10px] font-bold text-gray-400 tracking-[0.2em] uppercase font-sans">OmniNode War Room</span>
          <span className="text-[10px] font-bold text-gray-400 uppercase italic font-sans">Confidential</span>
        </div>

        <h1 className="text-4xl md:text-5xl font-extrabold mb-12 text-center border-b-2 border-gray-50 pb-12 leading-tight font-sans tracking-tight">
          {title}
        </h1>
        
        <div className="prose prose-lg max-w-none prose-headings:font-bold prose-headings:font-sans prose-headings:tracking-tight prose-a:text-indigo-600 prose-p:leading-relaxed prose-li:leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code(props: any) {
                const { children, className, node, ...rest } = props;
                const match = /language-(\w+)/.exec(className || '');
                if (match && match[1] === 'mermaid') {
                  return <MermaidBlock code={String(children).replace(/\n$/, '')} />;
                }
                return <code className="bg-gray-100 text-red-500 px-1 rounded" {...rest}>{children}</code>;
              }
            }}
          >
            {rawContent}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}