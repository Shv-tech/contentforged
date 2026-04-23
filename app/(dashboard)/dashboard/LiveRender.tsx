'use client';

import { useAppStore } from '@/lib/store';
import { FileText, ThumbsUp, MessageSquare, Repeat2, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function LiveRender() {
  // This is where it listens to the store!
  const { renderContent, renderPlatform } = useAppStore();

  if (!renderContent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#F9FAFB] p-8 text-center h-full">
        <FileText className="w-12 h-12 mb-4 opacity-30 text-gray-500" />
        <h3 className="text-[14px] font-semibold text-gray-500 mb-1">Awaiting Deployment</h3>
        <p className="text-[12px] max-w-[250px] leading-relaxed text-gray-400">
          Generated content will render here in native platform formats.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F9FAFB] relative">
      {/* Header */}
      <div className="h-14 border-b border-gray-200 flex items-center px-6 shrink-0 bg-white/80 backdrop-blur-md">
        <h2 className="text-[14px] font-semibold text-gray-900">Live Render</h2>
        <span className="ml-3 text-[10px] font-bold px-2.5 py-1 bg-gray-100 rounded-md text-gray-600 uppercase tracking-wider">
          {renderPlatform} Preview
        </span>
      </div>

      {/* Render Canvas Area */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar flex justify-center items-start">
        
        {/* Mock Social Media Card */}
        <div className="w-full max-w-[500px] bg-white border border-gray-200 rounded-xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
          
          {/* Mock Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-gray-900 to-gray-600 flex items-center justify-center text-white font-bold text-[14px] shadow-sm">
              SV
            </div>
            <div>
              <div className="text-[14px] font-bold text-gray-900 leading-tight">Shaurya Verma</div>
              <div className="text-[12px] text-gray-500">Now • {renderPlatform === 'linkedin' ? 'Edited' : ''}</div>
            </div>
          </div>

          {/* The Actual AI Generated Content */}
          <div className="text-[14px] text-gray-800 leading-relaxed font-sans prose prose-sm max-w-none prose-p:whitespace-pre-wrap prose-strong:font-bold prose-strong:text-gray-900 prose-ul:my-2 prose-li:my-0.5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {renderContent}
            </ReactMarkdown>
          </div>

          {/* Mock Engagement Footer */}
          <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-gray-400">
            <div className="flex items-center gap-6">
              <button className="flex items-center gap-2 hover:text-blue-600 transition">
                <ThumbsUp className="w-4 h-4" /> <span className="text-[12px] font-medium">Like</span>
              </button>
              <button className="flex items-center gap-2 hover:text-gray-900 transition">
                <MessageSquare className="w-4 h-4" /> <span className="text-[12px] font-medium">Comment</span>
              </button>
              <button className="flex items-center gap-2 hover:text-gray-900 transition">
                <Repeat2 className="w-4 h-4" /> <span className="text-[12px] font-medium">Repost</span>
              </button>
            </div>
            <button className="flex items-center gap-2 hover:text-gray-900 transition">
              <Send className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}