'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Send, Paperclip, Bot, User, Sparkles, ImagePlus, X, 
  PanelRightClose, PanelRightOpen, ChevronDown, ChevronUp, RefreshCw 
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// --- INTERFACES ---
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachment?: string;
}

// --- CUSTOM COMPONENTS ---
const GraderCard = ({ data }: { data: any }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm max-w-xl my-4 font-sans">
      {/* The Hook Quote */}
      <blockquote className="text-[17px] italic text-gray-800 leading-relaxed mb-4 font-serif">
        "{data.hook}"
      </blockquote>

      {/* The Strategy Badge */}
      <div className="inline-block px-3 py-1 bg-orange-50 text-orange-600 text-[11px] font-bold tracking-widest uppercase rounded-md mb-6">
        {data.badge}
      </div>

      <hr className="border-gray-100 mb-6" />

      {/* The Progress Bars */}
      <div className="space-y-5">
        {data.scores.map((item: any, idx: number) => (
          <div key={idx}>
            <div className="flex justify-between text-[13px] text-gray-600 font-medium mb-2">
              <span>{item.label}</span>
              <span className="text-gray-900 font-semibold">{item.score}/10</span>
            </div>
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-gray-900 h-full rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${(item.score / 10) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Overall Verdict & Fix */}
      <div className="mt-6 pt-4 border-t border-gray-100">
        <div className="text-[12px] font-bold text-gray-900 mb-1">VERDICT: {data.verdict}</div>
        <div className="text-[13px] text-gray-600">{data.critical_fix}</div>
      </div>
    </div>
  );
};

// --- MAIN APPLICATION PANE ---
export function EditorPane() {
  const { activeTool, apiKey, llmProvider, setRenderData, isLiveRenderOpen, toggleLiveRender } = useAppStore();
  
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "I'm your ContentForge Strategist. Pitch me an idea, drop a draft, or ask for a brutal critique. What are we building today?",
    }
  ]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const triggerFileInput = () => fileInputRef.current?.click();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => setAttachment(event.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const toggleThought = (id: string) => {
    setExpandedThoughts(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAutoFix = async (originalScore: number | null) => {
    if (originalScore === null) return;
    const fixPrompt = `You scored the previous input a ${originalScore}. Apply your own critical fixes and generate a new version that guarantees a 45+ score. Do not explain, just execute the fix.`;
    const newMessage: Message = { id: Date.now().toString(), role: 'user', content: fixPrompt };
    const newHistory = [...messages, newMessage];
    
    setMessages(newHistory);
    setIsLoading(true);
    await executeAI(newHistory);
  };

  const executeAI = async (historyToProcess: Message[]) => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyToProcess,
          apiKey: apiKey,
          provider: llmProvider,
          activeTool: activeTool
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to connect to the Strategist.');

      let replyText = data.reply;

      // --- LIVE RENDER INTERCEPTOR ---
      const renderRegex = /<render\s+platform=["'](linkedin|twitter)["']>([\s\S]*?)<\/render>/i;
      const renderMatch = replyText.match(renderRegex);
      
      if (renderMatch) {
        const platform = renderMatch[1].toLowerCase() as 'linkedin' | 'twitter';
        const content = renderMatch[2].trim();
        
        if (setRenderData) setRenderData(content, platform);
        
        replyText = replyText.replace(
          renderMatch[0], 
          `\n\n✨ *I've pushed the finalized draft to your Live Render canvas.*`
        );
      }

      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: replyText
      }]);

    } catch (error: any) {
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `🚨 Error: ${error.message}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !attachment) || isLoading) return;
    
    const newMessage: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      content: input,
      attachment: attachment || undefined
    };
    const newHistory = [...messages, newMessage];
    
    setMessages(newHistory);
    setInput('');
    setAttachment(null);
    setIsLoading(true);

    await executeAI(newHistory);
  };

  // --- PARSERS & PRE-PROCESSORS ---
  const preprocessMath = (text: string) => {
    if (!text) return text;
    return text
      .replace(/\\\[/g, '$$$$')
      .replace(/\\\]/g, '$$$$')
      .replace(/\\\(/g, '$')
      .replace(/\\\)/g, '$');
  };

  const parseContent = (content: string) => {
    let thoughtProcess = null;
    let finalContent = content;

    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
      thoughtProcess = thinkMatch[1].trim();
      finalContent = content.replace(thinkMatch[0], '').trim();
    }

    const scoreMatch = finalContent.match(/Overall Score:\s*(\d+)\s*\/\s*50/i) || finalContent.match(/Overall Score:\s*(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
    const needsFix = score !== null && score < 45;

    return { thoughtProcess, finalContent, score, needsFix };
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white relative">
      <input 
        type="file"
        ref={fileInputRef} 
        onChange={handleFileSelect} 
        accept="image/*" 
        className="hidden" 
      />

      {/* Header */}
      <div className="h-14 border-b border-gray-100 flex items-center px-6 shrink-0 justify-between bg-white/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-[#F2F2F2] flex items-center justify-center text-gray-900">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-gray-900 tracking-tight">Strategist Desk</h2>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {activeTool && (
            <span className="text-[11px] font-medium px-2.5 py-1 bg-gray-100 rounded-md text-gray-600">
              Tool: {activeTool}
            </span>
          )}
          <button 
            onClick={() => toggleLiveRender()}
            className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            {isLiveRenderOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {messages.map((msg) => {
          const { thoughtProcess, finalContent, score, needsFix } = parseContent(msg.content);
          const isExpanded = expandedThoughts[msg.id];

          return (
            <div key={msg.id} className={`flex gap-4 max-w-4xl mx-auto ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 shadow-sm border ${
                msg.role === 'user' ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200 text-gray-900'
              }`}>
                {msg.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4" />}
              </div>
              
              <div className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[85%]`}>
                
                {msg.attachment && (
                  <div className="mb-2 rounded-xl overflow-hidden border border-gray-200 shadow-sm max-w-[300px]">
                    <img src={msg.attachment} alt="Upload" className="w-full h-auto object-cover" />
                  </div>
                )}

                {thoughtProcess && (
                  <div className="w-full mb-1">
                    <button 
                      onClick={() => toggleThought(msg.id)}
                      className="flex items-center gap-2 text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> 
                      {isExpanded ? 'Hide thinking' : 'Show thinking'}
                      {isExpanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                    </button>
                    
                    {isExpanded && (
                      <div className="mt-2 p-4 bg-gray-50 border border-gray-100 rounded-xl text-[13px] text-gray-600 font-mono whitespace-pre-wrap leading-relaxed shadow-inner">
                        {thoughtProcess}
                      </div>
                    )}
                  </div>
                )}

                <div className={`p-5 text-[15px] leading-relaxed font-sans w-full ${
                  msg.role === 'user' 
                    ? 'bg-gray-100 text-gray-900 rounded-2xl rounded-tr-sm whitespace-pre-wrap' 
                    : 'bg-white text-gray-800 rounded-2xl rounded-tl-sm border border-gray-200 shadow-sm prose prose-sm max-w-none prose-p:leading-relaxed prose-headings:font-semibold prose-a:text-blue-600 prose-pre:bg-gray-900 prose-pre:text-white prose-td:border-gray-200 prose-th:border-gray-200 prose-th:bg-gray-50'
                }`}>
                  {msg.role === 'user' ? (
                    finalContent
                  ) : (
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        // This intercepts the AI's JSON code block and renders the UI
                        code(props) {
                          const { children, className, node, ...rest } = props;
                          const match = /language-(\w+)/.exec(className || '');
                          
                          if (match && match[1] === 'grader') {
                            try {
                              const parsedData = JSON.parse(String(children).replace(/\n$/, ''));
                              return <GraderCard data={parsedData} />;
                            } catch (e) {
                              console.error("Grader JSON Parse Error", e);
                              return <code className={className} {...rest}>{children}</code>;
                            }
                          }
                          
                          return <code className={className} {...rest}>{children}</code>;
                        }
                      }}
                    >
                      {preprocessMath(finalContent)}
                    </ReactMarkdown>
                  )}
                </div>

                {needsFix && msg.role === 'assistant' && (
                  <button 
                    onClick={() => handleAutoFix(score)}
                    className="mt-1 flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 rounded-lg text-[13px] font-semibold transition-colors shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Auto-Fix for 45+ Score
                  </button>
                )}

              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex gap-4 max-w-4xl mx-auto">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 shadow-sm border bg-white border-gray-200 text-gray-900">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-sm rounded-tl-sm flex items-center gap-1.5 h-[52px]">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 shrink-0 bg-white border-t border-transparent">
        <div className="max-w-4xl mx-auto bg-white border border-gray-200 rounded-2xl p-2 flex flex-col shadow-sm focus-within:border-gray-400 focus-within:shadow-md transition-all duration-200">
          
          {attachment && (
            <div className="px-3 pt-3 pb-1">
              <div className="relative inline-block group">
                <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                  <img src={attachment} alt="Preview" className="w-full h-full object-cover" />
                </div>
                <button 
                  onClick={() => setAttachment(null)}
                  className="absolute -top-2 -right-2 bg-gray-900 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Pitch an idea, drop a hook, or ask for a critique..."
            className="w-full bg-transparent text-[15px] text-gray-900 p-3 outline-none resize-none min-h-[50px] max-h-[300px] placeholder:text-gray-400 custom-scrollbar"
            rows={1}
          />
          <div className="flex items-center justify-between px-2 pb-1 mt-1">
            <div className="flex items-center gap-1">
              <button onClick={triggerFileInput} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition">
                <Paperclip className="w-4 h-4" />
              </button>
              <button onClick={triggerFileInput} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition">
                <ImagePlus className="w-4 h-4" />
              </button>
            </div>
            <button 
              onClick={handleSend}
              disabled={(!input.trim() && !attachment) || isLoading}
              className="px-4 py-2 bg-gray-900 text-white text-[13px] font-medium rounded-lg hover:bg-gray-800 transition disabled:opacity-30 flex items-center gap-2"
            >
              {isLoading ? 'Thinking...' : 'Send'} <Send className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}