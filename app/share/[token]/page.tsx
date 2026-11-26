'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Activity, Zap, AlertTriangle, ChevronDown, ChevronUp, Aperture, User as UserIcon } from 'lucide-react';

// --- Helper Functions ---

const preprocessMath = (text: string) => {
  if (!text) return text;
  return text.replace(/\\\[/g, '$$$$').replace(/\\\]/g, '$$$$').replace(/\\\(/g, '$').replace(/\\\)/g, '$');
};

const parseContent = (content: string) => {
  let thoughtProcess = null;
  let finalContent = content;
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/i);
  if (thinkMatch) {
    thoughtProcess = thinkMatch[1].trim();
    finalContent = content.replace(thinkMatch[0], '').trim();
  }
  return { thoughtProcess, finalContent };
};

// --- Grader Card Component ---

const GraderCard = ({ data }: { data: any }) => {
  const totalScore = data.scores?.reduce((acc: number, curr: any) => acc + curr.score, 0) || 0;
  
  const getScoreColor = (score: number) => {
    if (score >= 9) return 'bg-emerald-500';
    if (score >= 7) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="bg-[#1c1c1c] border border-[#333] rounded-2xl shadow-sm w-full max-w-full md:max-w-2xl my-6 font-sans overflow-hidden text-white">
      <div className="p-5 md:p-6 border-b border-[#333] bg-[#111]">
        <div className="flex justify-between items-start gap-4 mb-4">
          <div className="inline-flex px-3 py-1 bg-black text-[#ccc] border border-[#333] text-[10px] font-bold tracking-widest uppercase rounded-md shrink-0">
            {data.badge || 'ANALYSIS COMPLETE'}
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold text-white leading-none">
              {totalScore}<span className="text-sm text-[#777] font-medium">/50</span>
            </div>
            <div className="text-[10px] text-[#777] uppercase tracking-wider mt-1 font-semibold">
              Overall Score
            </div>
          </div>
        </div>
        <blockquote className="text-[15px] italic text-[#ccc] leading-relaxed border-l-4 border-[#444] pl-4 break-words whitespace-pre-wrap max-w-full">
          &quot;{data.hook}&quot;
        </blockquote>
      </div>

      <div className="p-5 md:p-6">
        <div className="text-[11px] font-bold text-[#777] uppercase tracking-wider mb-5 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-blue-500" /> Performance Autopsy
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
          {data.scores?.map((item: any, idx: number) => (
            <div key={idx} className="w-full">
              <div className="flex justify-between text-[12px] font-medium mb-1.5">
                <span className="text-[#a3a3a3] truncate mr-2">{item.label}</span>
                <span className="text-white font-bold shrink-0">{item.score}/10</span>
              </div>
              <div className="w-full bg-[#333] h-1.5 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-1000 ease-out ${getScoreColor(item.score)}`}
                  style={{ width: `${(item.score / 10) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-5 md:p-6 bg-black border-t border-[#333]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {data.replication_pattern && (
            <div>
              <div className="text-[10px] font-bold text-[#777] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-amber-400" /> Replication Pattern
              </div>
              <div className="text-[13px] text-[#a3a3a3] leading-relaxed break-words whitespace-pre-wrap">
                {data.replication_pattern}
              </div>
            </div>
          )}
          <div className={!data.replication_pattern ? "md:col-span-2" : ""}>
            <div className="text-[10px] font-bold text-[#777] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-rose-400" /> Critical Fix
            </div>
            <div className="text-[13px] text-[#a3a3a3] leading-relaxed break-words whitespace-pre-wrap">
              {data.critical_fix}
            </div>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-[#333] flex justify-between items-center">
          <span className="text-[11px] text-[#777] uppercase tracking-widest font-semibold">Final Verdict</span>
          <span className={`text-[11px] font-bold tracking-widest uppercase px-3 py-1 rounded-md ${
            data.verdict?.toLowerCase().includes('publish') 
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
          }`}>
            {data.verdict}
          </span>
        </div>
      </div>
    </div>
  );
};

// --- Main Page Component ---

export default function SharedChatPage() {
  const params = useParams();
  const token = params.token as string;
  const supabase = createClient();

  const [session, setSession] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchSharedChat = async () => {
      if (!token) return;
      
      const { data: sessionData, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('share_token', token)
        .eq('is_public', true)
        .single();

      if (sessionError || !sessionData) {
        setError(true);
        setLoading(false);
        return;
      }

      setSession(sessionData);

      const { data: messagesData, error: messagesError } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionData.id)
        .order('created_at', { ascending: true });

      if (!messagesError && messagesData) {
        setMessages(messagesData);
      }

      setLoading(false);
    };

    fetchSharedChat();
  }, [token, supabase]);

  const toggleThought = (id: string) => setExpandedThoughts(prev => ({ ...prev, [id]: !prev[id] }));

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060606] text-white flex items-center justify-center font-sans">
        <div className="text-[#888] flex items-center gap-2">
          <Aperture className="animate-[spin_3s_linear_infinite] h-5 w-5 text-[#888]" />
          Loading shared chat...
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-[#060606] text-white flex flex-col items-center justify-center gap-4 font-sans">
        <h1 className="text-2xl font-bold">404 - Chat Not Found</h1>
        <p className="text-[#888]">This link is invalid, or the owner has made it private.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col font-sans">
      
      {/* Read-Only Header */}
      <header className="border-b border-[#141414] p-4 flex items-center justify-between bg-[#0a0a0a] sticky top-0 z-50">
        <div className="flex flex-col">
          <h1 className="font-semibold text-[15px]">{session.title || 'Shared Conversation'}</h1>
          <span className="text-[12px] text-[#666]">Shared via Link</span>
        </div>
        <span className="text-[12px] font-medium text-[#888] bg-[#1a1a1a] px-3 py-1.5 rounded-full border border-[#2a2a2a]">
          Read Only
        </span>
      </header>

      {/* Chat Messages Container */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 w-full max-w-3xl mx-auto flex flex-col gap-10 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="text-center text-[#666] mt-10 text-[14px]">
            No messages in this conversation yet.
          </div>
        ) : (
          messages.map((msg) => {
            const { thoughtProcess, finalContent } = parseContent(msg.content);
            const isExpanded = expandedThoughts[msg.id];

            return (
              <div key={msg.id} className={`group/msg flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                  msg.role === 'user' ? 'bg-[#1c1c1c] text-[#888] border border-[#333]' : 'bg-transparent text-white'
                }`}>
                  {msg.role === 'user' ? <UserIcon className="w-4 h-4" /> : <Aperture className="w-5 h-5 text-[#d18a5e]" />}
                </div>

                <div className={`flex flex-col max-w-[100%] md:max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  
                  {/* Attachments UI mapping (if DB stores attachments array) */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2 max-w-[300px] justify-end">
                      {msg.attachments.map((imgBase64: string, idx: number) => (
                        <div key={idx} className="rounded-2xl overflow-hidden border border-[#333] w-20 h-20 shadow-sm">
                          <img src={imgBase64} alt="Upload" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Thinking Process UI */}
                  {thoughtProcess && (
                    <div className="w-full mb-2">
                      <button 
                        onClick={() => toggleThought(msg.id)}
                        className="flex items-center gap-2 text-[13px] font-medium text-[#777] hover:text-[#aaa] transition-colors py-1 group"
                      >
                        <span className={`w-4 h-4 rounded-full border border-[#444] flex items-center justify-center transition-colors ${isExpanded ? 'bg-[#222]' : ''}`}>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </span>
                        {isExpanded ? 'Hide thinking process' : 'View thinking process'}
                      </button>
                      
                      {isExpanded && (
                        <div className="mt-3 mb-2 pl-4 border-l-2 border-[#333] text-[14px] text-[#888] font-sans whitespace-pre-wrap leading-relaxed animate-in slide-in-from-top-1 fade-in duration-200">
                          {thoughtProcess}
                        </div>
                      )}
                    </div>
                  )}

                  <div className={`text-[15px] leading-relaxed font-sans w-full ${
                    msg.role === 'user' 
                      ? 'bg-[#1c1c1c] text-white px-5 py-3.5 rounded-3xl rounded-tr-sm border border-[#333] whitespace-pre-wrap' 
                      : 'text-[#e0e0e0] prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-headings:font-semibold prose-a:text-blue-400 prose-pre:bg-[#111] prose-pre:border prose-pre:border-[#333] w-full'
                  }`}>
                    {msg.role === 'user' ? (
                      // Strip document injection prefix just like the main page
                      finalContent.replace(/\[Document: .*?\]\n[\s\S]*?\n\nUser Prompt: /g, '')
                    ) : (
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                          code(props) {
                            const { children, className, node, ...rest } = props;
                            const match = /language-(\w+)/.exec(className || '');
                            const isInline = !match && !className?.includes('language-');
                            
                            // 1. Beautiful Inline Code
                            if (isInline) {
                              return <code className="bg-[#1e1e1e] border border-[#333] px-1.5 py-0.5 rounded text-[13px] text-[#ffc4a3]" {...rest}>{children}</code>;
                            }

                            const language = match?.[1]?.toLowerCase() || 'code';
                            const rawText = Array.isArray(children) ? children.join('') : String(children);
                            
                            // 2. Grader Card Logic with Robust AI JSON Sanitizer
                            if (language === 'grader') {
                              try {
                                const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                                let cleanText = jsonMatch ? jsonMatch[0] : rawText;
                                
                                // Remove trailing commas to fix common LLM hallucinations
                                cleanText = cleanText.replace(/,\s*([\}\]])/g, '$1');
                                
                                const parsedData = JSON.parse(cleanText);
                                return <GraderCard data={parsedData} />;
                              } catch (e) {
                                console.error("Grader Card Parse Error:", e);
                              }
                            }

                            // 3. Normal / Fallback Code Block matching your platform UI
                            return (
                              <div className="bg-[#1e1e1e] rounded-xl overflow-hidden my-4 border border-[#333] shadow-sm w-full max-w-full">
                                <div className="bg-[#2a2a2a] px-4 py-2 text-[11px] text-[#888] font-semibold uppercase tracking-wider flex justify-between items-center">
                                  <span>{language}</span>
                                  {language === 'grader' && <span className="text-rose-400 font-medium normal-case flex items-center gap-1.5"><AlertTriangle className="w-3 h-3"/> Syntax Error</span>}
                                </div>
                                <pre className="p-4 overflow-x-auto custom-scrollbar">
                                  <code className="text-[13px] text-[#e0e0e0] font-mono leading-relaxed" {...rest}>
                                    {rawText}
                                  </code>
                                </pre>
                              </div>
                            );
                          }
                        }}
                      >
                        {preprocessMath(finalContent)}
                      </ReactMarkdown>
                    )}
                  </div>

                </div>
              </div>
            );
          })
        )}
      </main>
      
    </div>
  );
}