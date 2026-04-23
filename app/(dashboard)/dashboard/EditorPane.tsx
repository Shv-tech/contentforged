'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Bot, User, Sparkles, ImagePlus, X, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

// Explicitly define what a Message looks like for TypeScript
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachment?: string;
}

export function EditorPane() {
  const { activeTool, apiKey, llmProvider, setRenderData, isLiveRenderOpen, toggleLiveRender } = useAppStore();
  
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Set the initial greeting
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "I'm your ContentForge Strategist. Pitch me an idea, drop a draft, or ask for a brutal critique. What are we building today?",
    }
  ]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle opening the hidden file input
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Handle reading the selected file into base64
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachment(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !attachment) || isLoading) return;
    
    // 1. Add user message to UI immediately, including attachment if present
    const newMessage: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      content: input,
      attachment: attachment || undefined
    };
    const newHistory = [...messages, newMessage];
    
    setMessages(newHistory);
    setInput('');
    setAttachment(null); // Clear preview after sending
    setIsLoading(true);

    try {
      // 2. Send the history and your API keys to the backend
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory,
          apiKey: apiKey,
          provider: llmProvider,
          activeTool: activeTool
        })
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to connect to the Strategist.');

      let replyText = data.reply;

      // --- THE BULLETPROOF LIVE RENDER INTERCEPTOR ---
      const renderRegex = /<render\s+platform=["'](linkedin|twitter)["']>([\s\S]*?)<\/render>/i;
      const renderMatch = replyText.match(renderRegex);
      
      if (renderMatch) {
        const platform = renderMatch[1].toLowerCase() as 'linkedin' | 'twitter';
        const content = renderMatch[2].trim();
        
        console.log("RENDER INTERCEPTED:", platform, content);
        
        // Push to the right pane via Zustand
        if (setRenderData) {
          setRenderData(content, platform);
        }
        
        // Remove the raw tag from the chat UI
        replyText = replyText.replace(
          renderMatch[0], 
          `\n\n✨ *I've pushed the finalized draft to your Live Render canvas.*`
        );
      }
      // ------------------------------------------------

      // 3. Add the final AI response to the chat
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: replyText
      }]);

    } catch (error: any) {
      // If they forgot their API key or the network fails
      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `🚨 Error: ${error.message}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white relative">
      {/* Hidden File Input */}
      <input 
        type="file"
        ref={fileInputRef} 
        onChange={handleFileSelect} 
        accept="image/*" 
        className="hidden" 
      />

      {/* Top Header - Claude Style Light Mode */}
      <div className="h-14 border-b border-gray-100 flex items-center px-6 shrink-0 justify-between bg-white/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-orange-100 flex items-center justify-center text-orange-600">
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
          {/* Toggle Live Render Button */}
          <button 
            onClick={() => toggleLiveRender()}
            className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            title={isLiveRenderOpen ? "Close Live Render" : "Open Live Render"}
          >
            {isLiveRenderOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Chat History Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-4 max-w-4xl mx-auto ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 shadow-sm border ${
              msg.role === 'user' ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200 text-orange-500'
            }`}>
              {msg.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4" />}
            </div>
            
            {/* Message Bubble */}
            <div className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[85%]`}>
              
              {/* Attachment Rendering */}
              {msg.attachment && (
                <div className="mb-2 rounded-xl overflow-hidden border border-gray-200 shadow-sm max-w-[300px]">
                  <img src={msg.attachment} alt="Upload" className="w-full h-auto object-cover" />
                </div>
              )}

              {/* The Upgraded Markdown Renderer */}
              <div className={`p-4 text-[15px] leading-relaxed font-sans ${
                msg.role === 'user' 
                  ? 'bg-gray-100 text-gray-900 rounded-2xl rounded-tr-sm whitespace-pre-wrap' 
                  : 'bg-white text-gray-800 rounded-2xl rounded-tl-sm border border-gray-100 shadow-[0_2px_8px_rgb(0,0,0,0.04)] prose prose-sm max-w-none prose-p:leading-relaxed prose-headings:font-semibold prose-a:text-orange-600 prose-pre:bg-gray-900 prose-pre:text-white prose-td:border-gray-200 prose-th:border-gray-200 prose-th:bg-gray-50'
              }`}>
                {msg.role === 'user' ? (
                  msg.content
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                    {msg.content}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Animated Loading State */}
        {isLoading && (
          <div className="flex gap-4 max-w-4xl mx-auto">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 shadow-sm border bg-white border-gray-200 text-orange-500">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-4 rounded-2xl bg-white border border-gray-100 shadow-[0_2px_8px_rgb(0,0,0,0.04)] rounded-tl-sm flex items-center gap-1.5 h-[52px]">
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
          
          {/* Attachment Preview (Shows up BEFORE you hit send) */}
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
            placeholder={
              activeTool === 'hook_grader' ? "Drop your hook here for a brutal grading..." :
              activeTool === 'pdf_export' ? "Paste your text to convert into a carousel..." :
              activeTool === 'shadowban' ? "Paste your caption to check for flagged words..." :
              "Pitch an idea, or ask for a critique..."
            }
            className="w-full bg-transparent text-[15px] text-gray-900 p-3 outline-none resize-none min-h-[50px] max-h-[300px] placeholder:text-gray-400 custom-scrollbar"
            rows={1}
          />
          <div className="flex items-center justify-between px-2 pb-1 mt-1">
            <div className="flex items-center gap-1">
              {/* Connected Upload Buttons */}
              <button onClick={triggerFileInput} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition" title="Attach File">
                <Paperclip className="w-4 h-4" />
              </button>
              <button onClick={triggerFileInput} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition" title="Upload Image">
                <ImagePlus className="w-4 h-4" />
              </button>
            </div>
            <button 
              onClick={handleSend}
              disabled={(!input.trim() && !attachment) || isLoading}
              className="px-3 py-2 bg-gray-900 text-white text-[13px] font-medium rounded-lg hover:bg-gray-800 transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? 'Thinking...' : 'Send'} <Send className="w-3 h-3" />
            </button>
          </div>
        </div>
        <div className="text-center mt-3">
          <p className="text-[11px] text-gray-400">ContentForge Strategist can make mistakes. Consider verifying important information.</p>
        </div>
      </div>
    </div>
  );
}