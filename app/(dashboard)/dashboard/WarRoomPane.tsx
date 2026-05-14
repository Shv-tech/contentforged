'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Cpu, FileDown, Globe, Zap, AlertTriangle, Loader2, ChevronLeft, Layout, FileText } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import jsPDF from 'jspdf'; 

interface SwarmArtifact {
  title: string;
  content: string;
  extension: string;
}

interface LogEntry {
  role: 'user' | 'swarm' | 'error';
  content: string;
  artifacts?: SwarmArtifact[];
  actions?: string[];
}

export function WarRoomPane() {
  const store = useAppStore() as any; 
  const messages = store.messages || [];
  
  const apiKey = useAppStore((state) => state.apiKey);
  const setActiveTool = useAppStore((state) => state.setActiveTool);
  const isLiveRenderOpen = useAppStore((state) => state.isLiveRenderOpen);
  const toggleLiveRender = useAppStore((state) => state.toggleLiveRender);

  const [input, setInput] = useState('');
  const [isSwarming, setIsSwarming] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log, isSwarming]);

  const handleDownload = (artifact: SwarmArtifact) => {
    if (artifact.extension === 'pdf') {
      const doc = new jsPDF();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text(artifact.title, 15, 20);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      const splitText = doc.splitTextToSize(artifact.content, 180);
      doc.text(splitText, 15, 30);
      doc.save(`${artifact.title.replace(/\s+/g, '_')}.pdf`);
    } else {
      const blob = new Blob([artifact.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${artifact.title.replace(/\s+/g, '_')}.${artifact.extension}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const executeSwarm = async () => {
    if (!input.trim() || isSwarming) return;
    
    const userPrompt = input;
    setInput('');
    setLog(prev => [...prev, { role: 'user', content: userPrompt }]);
    
    const newMessages = [...messages, { role: 'user', content: userPrompt }];
    if (store.setMessages) store.setMessages(newMessages);

    setIsSwarming(true);

    try {
      const res = await fetch('/api/swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userPrompt, apiKey })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The swarm encountered a critical failure.');

      setLog(prev => [...prev, { 
        role: 'swarm', 
        content: data.reply,
        artifacts: data.artifacts,
        actions: data.actions
      }]);

      // 🔥 THE BULLETPROOF FIX 🔥
      // Instead of relying on the AI to type the HTML tags, we forcefully inject the 
      // artifact content into the tag ourselves before passing it to the global store.
      let finalGlobalContent = data.reply;
      
      if (data.artifacts && data.artifacts.length > 0) {
        const primaryArtifact = data.artifacts[0];
        // We append the hidden tags to the text so SwarmCanvas instantly catches it.
        finalGlobalContent += `\n\n<canvas_artifact type="swarm_output">\n# ${primaryArtifact.title}\n\n${primaryArtifact.content}\n</canvas_artifact>`;
      }

      if (store.setMessages) {
        store.setMessages([...newMessages, { role: 'assistant', content: finalGlobalContent }]);
      }

      // Auto-open the canvas if an artifact was generated
      if (data.artifacts && data.artifacts.length > 0 && !store.isLiveRenderOpen && store.toggleLiveRender) {
        store.toggleLiveRender();
      }

    } catch (error: any) {
      setLog(prev => [...prev, { role: 'error', content: `**Swarm Failure:** ${error.message}` }]);
    } finally {
      setIsSwarming(false);
    }
  };

  // Hides the injected tags from the Chat UI so it stays clean
  const renderCleanContent = (content: string) => {
    const cleanText = content.replace(/<canvas_artifact[^>]*>([\s\S]*?)<\/canvas_artifact>/, '').trim();
    return (
      <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-slate-800 prose-pre:text-slate-100 text-inherit">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
          {cleanText}
        </ReactMarkdown>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F8FAFC] font-sans relative overflow-hidden">
      
      <div className="h-14 border-b border-slate-200 flex items-center px-4 shrink-0 justify-between bg-white z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setActiveTool('editor')}
            className="flex items-center gap-1 px-2 py-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-all"
            title="Return to standard editor"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="text-[13px] font-medium hidden sm:block">Back to Editor</span>
          </button>
          <div className="w-[1px] h-4 bg-slate-200 mx-1 hidden sm:block"></div>
          <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center text-white">
            <Cpu className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-[14px] font-bold text-slate-900 tracking-tight">Omni-Swarm Terminal</h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded-md">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
            <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest">Parallel Matrix</span>
          </div>
          <div className="hidden sm:block w-[1px] h-4 bg-slate-200"></div>
          <button
            onClick={() => toggleLiveRender()}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] font-bold uppercase tracking-wider transition-all border ${
              isLiveRenderOpen
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Layout className="w-3.5 h-3.5" />
            <span className="hidden md:block">{isLiveRenderOpen ? 'Close Canvas' : 'Open Canvas'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {log.length === 0 && !isSwarming && (
          <div className="h-full flex flex-col items-center justify-center text-center animate-in fade-in duration-500 pb-20">
            <Globe className="w-12 h-12 mb-4 text-slate-300" />
            <h3 className="text-[16px] font-bold text-slate-900">The Swarm is Listening</h3>
            <p className="text-[13px] text-slate-500 mt-2 max-w-md leading-relaxed">
              Command the swarm to research live websites, trigger external APIs, schedule events, and build multi-format files autonomously.
            </p>
          </div>
        )}

        {log.map((entry, i) => (
          <div key={i} className={`flex flex-col ${entry.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 fade-in duration-300`}>
            <div className={`max-w-[90%] md:max-w-[80%] p-5 rounded-2xl ${
              entry.role === 'user' 
                ? 'bg-slate-900 text-white rounded-tr-sm shadow-md' : 
              entry.role === 'error' 
                ? 'bg-red-50 text-red-700 border border-red-200 rounded-tl-sm' : 
              'bg-white border border-slate-200 shadow-sm text-slate-800 rounded-tl-sm'
            }`}>
              
              {entry.role === 'swarm' ? renderCleanContent(entry.content) : (
                <div className="prose prose-sm max-w-none prose-p:leading-relaxed text-inherit">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{entry.content}</ReactMarkdown>
                </div>
              )}
              
              {entry.actions && entry.actions.length > 0 && (
                <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                  <p className="w-full text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Actions Executed</p>
                  {entry.actions.map((act, idx) => (
                    <span key={idx} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-md text-[11px] font-bold uppercase tracking-wider shadow-sm">
                      <Zap className="w-3 h-3 fill-emerald-500 text-emerald-500" /> {act}
                    </span>
                  ))}
                </div>
              )}

              {entry.artifacts && entry.artifacts.length > 0 && (
                <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                  <p className="w-full text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Generated Files</p>
                  {entry.artifacts.map((art, idx) => (
                    <button 
                      key={idx} 
                      onClick={() => handleDownload(art)} 
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg hover:bg-indigo-100 hover:border-indigo-200 transition shadow-sm text-[13px] font-bold"
                    >
                      <FileDown className="w-4 h-4" /> Download {art.title}.{art.extension}
                    </button>
                  ))}
                  
                  {/* Visual trigger indicating Canvas update */}
                  <div className="w-full mt-2 flex items-center justify-between bg-indigo-600 text-white p-3 rounded-lg shadow-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      <div>
                        <p className="text-[12px] font-bold">Document Sent to Canvas</p>
                        <p className="text-[10px] text-indigo-200 uppercase tracking-wider">High-Fidelity PDF Ready</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => !isLiveRenderOpen && toggleLiveRender()}
                      className="text-[10px] font-bold bg-white text-indigo-700 px-3 py-1.5 rounded uppercase tracking-wider shadow-sm hover:bg-indigo-50 transition"
                    >
                      View Canvas
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {isSwarming && (
          <div className="flex items-center gap-3 text-indigo-600 bg-indigo-50 w-fit px-5 py-3 rounded-xl border border-indigo-100 shadow-sm animate-in fade-in slide-in-from-bottom-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-[12px] font-bold tracking-widest uppercase">Swarm Executing Logic Loop...</span>
          </div>
        )}
        
        <div ref={scrollRef} className="h-4" />
      </div>

      <div className="p-4 bg-white border-t border-slate-200 shrink-0">
        <div className="max-w-5xl mx-auto flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                executeSwarm();
              }
            }}
            placeholder="E.g., 'Research top 5 AI agencies, format as CSV, and schedule a review meeting for Friday.'"
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-4 outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all text-[14px] resize-none min-h-[56px] max-h-[150px] custom-scrollbar disabled:opacity-60"
            disabled={isSwarming}
            rows={1}
          />
          <button 
            onClick={executeSwarm} 
            disabled={isSwarming || !input.trim()} 
            className="px-6 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-all flex items-center justify-center shadow-sm h-[56px]"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}