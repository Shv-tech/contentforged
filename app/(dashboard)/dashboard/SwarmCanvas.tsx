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

  // Mermaid emits a fixed-width SVG. Without the scroll container a wide
  // diagram widened the whole document on a phone.
  return (
    <div className="my-6 sm:my-8 bg-gray-50 p-3 sm:p-6 rounded-xl border border-gray-100 overflow-x-auto">
      <div ref={chartRef} className="flex justify-center min-w-min [&_svg]:max-w-none" />
    </div>
  );
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
      <div className="h-full flex flex-col items-center justify-center text-gray-400 font-mono text-xs gap-4 bg-[#F9FAFB] px-6 text-center">
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
        // windowWidth pins the render to a desktop width. Without it the PDF
        // generated on a phone captured the narrow mobile layout.
        html2canvas:  { scale: 2, useCORS: true, windowWidth: 1024 },
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
    <div className="w-full h-full min-w-0 flex flex-col items-center bg-[#F3F4F6] overflow-y-auto overflow-x-hidden pb-24 custom-scrollbar px-3 sm:px-4">

      {/* Sticky Action Bar */}
      <div className="sticky top-3 sm:top-4 z-50 flex items-center justify-between gap-3 w-full max-w-4xl bg-white/90 backdrop-blur-md px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border border-gray-200 shadow-sm mb-6 sm:mb-8 mt-3 sm:mt-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 fill-white" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 leading-tight text-[14px] sm:text-[16px] truncate">Swarm Strategy</h3>
            <p className="text-xs text-gray-500 font-medium truncate">Ready for deployment</p>
          </div>
        </div>

        <button
          onClick={handleDownloadPDF}
          disabled={isDownloading}
          className="flex items-center gap-2 bg-gray-900 text-white px-4 sm:px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-black transition disabled:opacity-50 shadow-md shrink-0"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">{isDownloading ? 'Compiling...' : 'Download PDF'}</span>
          <span className="sm:hidden">{isDownloading ? '...' : 'PDF'}</span>
        </button>
      </div>

      {/*
        The A4 sheet is a desktop conceit. min-h-[297mm] is 1123px tall and the
        p-24 padding left roughly 40px of usable width on a phone, so both are
        now scoped to md and up.
      */}
      <div
        ref={printRef}
        className="bg-white w-full min-w-0 max-w-4xl md:min-h-[297mm] p-5 sm:p-10 md:p-24 shadow-2xl rounded-sm text-gray-900 font-serif"
      >
        <div className="flex justify-between items-center gap-3 mb-8 sm:mb-12 border-b border-gray-100 pb-4">
          <span className="text-[9px] sm:text-[10px] font-bold text-gray-400 tracking-[0.15em] sm:tracking-[0.2em] uppercase font-sans">OmniNode War Room</span>
          <span className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase italic font-sans shrink-0">Confidential</span>
        </div>

        <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold mb-8 sm:mb-12 text-center border-b-2 border-gray-50 pb-8 sm:pb-12 leading-tight font-sans tracking-tight break-words">
          {title}
        </h1>

        <div className="prose prose-sm sm:prose-base md:prose-lg max-w-none break-words prose-headings:font-bold prose-headings:font-sans prose-headings:tracking-tight prose-a:text-indigo-600 prose-a:break-all prose-p:leading-relaxed prose-li:leading-relaxed prose-pre:overflow-x-auto prose-table:block prose-table:overflow-x-auto">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code(props: any) {
                const { children, className, node, ...rest } = props;
                const match = /language-(\w+)/.exec(className || '');
                if (match && match[1] === 'mermaid') {
                  return <MermaidBlock code={String(children).replace(/\n$/, '')} />;
                }
                return <code className="bg-gray-100 text-red-500 px-1 rounded break-words" {...rest}>{children}</code>;
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