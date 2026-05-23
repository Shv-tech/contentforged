'use client';

import { useAppStore } from '@/lib/store';
import { FileText, ThumbsUp, MessageSquare, Repeat2, Send, Share2, Heart, MessageCircle, Bookmark } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import EbookCanvas from '@/components/EbookCanvas'; 

export function LiveRender() {
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

  // --- EBOOK DOUBLE-TITLE FIX & EXTRACTION PIPELINE ---
  let displayTitle = "Strategic Masterclass";
  let displayContent = renderContent;

  if (renderPlatform === 'ebook') {
    // 1. Extract the absolute first overarching title to use as the Ebook Cover Title
    const firstTitleMatch = displayContent.match(/^(?:#|##)\s+(.*)/m);
    if (firstTitleMatch) {
      displayTitle = firstTitleMatch[1].trim();
      displayContent = displayContent.replace(firstTitleMatch[0], '').trim();
    }

    // 2. THE DEDUPLICATION ENGINE: 
    // Fixes the issue where the API injects "## Chapter X" and the LLM also generates "## Chapter X".
    // This regex finds back-to-back headers and strips the redundant one.
    displayContent = displayContent.replace(/^(#{1,3}\s+[^\n]+)\n+(#{1,3}\s+[^\n]+)/gm, (match, h1, h2) => {
      const t1 = h1.replace(/^#+\s*/, '').toLowerCase().trim();
      const t2 = h2.replace(/^#+\s*/, '').toLowerCase().trim();
      
      // If the headers are identical or one contains the other (e.g., "Chapter 1" vs "Chapter 1: The Intro"), keep only the first
      if (t1 === t2 || t2.includes(t1) || t1.includes(t2)) {
        return h1;
      }
      return match;
    });
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F9FAFB] relative">
      <div className="h-14 border-b border-gray-200 flex items-center px-6 shrink-0 bg-white/80 backdrop-blur-md">
        <h2 className="text-[14px] font-semibold text-gray-900">Live Render</h2>
        <span className="ml-3 text-[10px] font-bold px-2.5 py-1 bg-gray-100 rounded-md text-gray-600 uppercase tracking-wider">
          {renderPlatform} Preview
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar flex justify-center items-start">
        {renderPlatform === 'ebook' ? (
          <div className="w-full">
            <EbookCanvas title={displayTitle} content={displayContent} />
          </div>
        ) : (
          <div className="w-full max-w-[500px] bg-white border border-gray-200 rounded-xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-gray-900 to-gray-600 flex items-center justify-center text-white font-bold text-[14px] shadow-sm">
                SV
              </div>
              <div>
                <div className="text-[14px] font-bold text-gray-900 leading-tight">You</div>
                <div className="text-[12px] text-gray-500">
                  Now â€¢ {renderPlatform === 'linkedin' ? 'Edited' : renderPlatform === 'twitter' ? 'Just now' : 'Just now'}
                </div>
              </div>
            </div>

            <div className="text-[14px] text-gray-800 leading-relaxed font-sans prose prose-sm max-w-none prose-p:whitespace-pre-wrap prose-strong:font-bold prose-strong:text-gray-900 prose-ul:my-2 prose-li:my-0.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayContent}
              </ReactMarkdown>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-gray-400">
              {renderPlatform === 'twitter' ? (
                <div className="flex items-center justify-between w-full px-2">
                  <button className="flex items-center gap-2 hover:text-blue-500 transition">
                    <MessageCircle className="w-4 h-4" /> <span className="text-[12px]">Reply</span>
                  </button>
                  <button className="flex items-center gap-2 hover:text-green-500 transition">
                    <Repeat2 className="w-4 h-4" /> <span className="text-[12px]">Repost</span>
                  </button>
                  <button className="flex items-center gap-2 hover:text-rose-500 transition">
                    <Heart className="w-4 h-4" /> <span className="text-[12px]">Like</span>
                  </button>
                  <button className="flex items-center gap-2 hover:text-blue-500 transition">
                    <Bookmark className="w-4 h-4" />
                  </button>
                </div>
              ) : renderPlatform === 'facebook' ? (
                <div className="flex items-center justify-around w-full">
                  <button className="flex items-center gap-2 hover:text-blue-600 transition">
                    <ThumbsUp className="w-4 h-4" /> <span className="text-[12px] font-semibold">Like</span>
                  </button>
                  <button className="flex items-center gap-2 hover:text-gray-900 transition">
                    <MessageSquare className="w-4 h-4" /> <span className="text-[12px] font-semibold">Comment</span>
                  </button>
                  <button className="flex items-center gap-2 hover:text-gray-900 transition">
                    <Share2 className="w-4 h-4" /> <span className="text-[12px] font-semibold">Share</span>
                  </button>
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}