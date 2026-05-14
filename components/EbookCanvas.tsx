'use client';

import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import { Download, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

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

export default function EbookCanvas({ title, content }: { title: string, content: string }) {
  const printRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    const toastId = toast.loading('Compiling PDF Book...');
    
    try {
      // Dynamic import to prevent Next.js SSR window errors
      const html2pdf = (await import('html2pdf.js')).default;
      
      const element = printRef.current;
      
      if (!element) {
        toast.error('Document is not ready for printing.', { id: toastId });
        setIsDownloading(false);
        return;
      }
      
      // ROOT CAUSE FIX: Using 'as const' locks the types to their exact string literals,
      // perfectly satisfying html2pdf's strict type requirements.
      const opt = {
        margin:       [20, 20, 20, 20] as [number, number, number, number],
        filename:     `${title.replace(/\s+/g, '_')}_Ebook.pdf`,
        image:        { type: 'jpeg' as const, quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { 
          unit: 'mm' as const, 
          format: 'a4' as const, 
          orientation: 'portrait' as const 
        }
      };

      await html2pdf().from(element).set(opt).save();
      toast.success('Ebook downloaded successfully!', { id: toastId });
    } catch (err) {
      toast.error('Failed to compile PDF.', { id: toastId });
      console.error(err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center pb-24">
      {/* Sticky Action Bar */}
      <div className="sticky top-4 z-50 flex items-center justify-between w-full max-w-4xl bg-white/80 backdrop-blur-md px-6 py-4 rounded-2xl border border-gray-200 shadow-sm mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black text-white rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 leading-tight">Compiled Ebook</h3>
            <p className="text-xs text-gray-500 font-medium">Ready for distribution</p>
          </div>
        </div>
        
        <button 
          onClick={handleDownloadPDF}
          disabled={isDownloading}
          className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-50 shadow-md"
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
        <h1 className="text-5xl font-extrabold mb-16 text-center border-b-2 border-gray-100 pb-12 leading-tight">
          {title}
        </h1>
        
        <div className="prose prose-lg max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-blue-600 prose-p:leading-relaxed prose-li:leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code(props) {
                const { children, className, node, ...rest } = props;
                const match = /language-(\w+)/.exec(className || '');
                if (match && match[1] === 'mermaid') {
                  return <MermaidBlock code={String(children).replace(/\n$/, '')} />;
                }
                return <code className={className} {...rest}>{children}</code>;
              }
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}