'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Send, Plus, X, ChevronDown, ChevronUp, RefreshCw, 
  Check, User as UserIcon, Aperture, Image as ImageIcon, FileText,
  PanelRightClose, PanelRightOpen, PanelLeftOpen,
  Activity,
  Zap,
  AlertTriangle
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ToolHub } from '@/components/ToolHub';
import { extractTextFromLocalPDF } from '@/lib/pdf-extractor';
import toast from 'react-hot-toast';

// --- INTERFACES ---
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: string[]; // Base64 images (kept for images only)
}

// --- ACTUAL PRODUCTION MODELS ---
const MODELS = [
  { id: 'claude haiku 4.5', provider: 'anthropic', desc: 'Deep synthesis & strategy' }
];

const convertFileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

// --- CUSTOM COMPONENTS ---
const GraderCard = ({ data }: { data: any }) => {
  const totalScore = data.scores?.reduce((acc: number, curr: any) => acc + curr.score, 0) || 0;
  
  const getScoreColor = (score: number) => {
    if (score >= 9) return 'bg-emerald-500';
    if (score >= 7) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm w-full max-w-full md:max-w-2xl my-6 font-sans overflow-hidden">
      <div className="p-5 md:p-6 border-b border-gray-100 bg-gray-50/50">
        <div className="flex justify-between items-start gap-4 mb-4">
          <div className="inline-flex px-3 py-1 bg-gray-900 text-white text-[10px] font-bold tracking-widest uppercase rounded-md shrink-0">
            {data.badge || 'ANALYSIS COMPLETE'}
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold text-gray-900 leading-none">
              {totalScore}<span className="text-sm text-gray-400 font-medium">/50</span>
            </div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1 font-semibold">
              Overall Score
            </div>
          </div>
        </div>
        
        <blockquote className="text-[15px] italic text-gray-800 leading-relaxed border-l-4 border-gray-300 pl-4 break-words whitespace-pre-wrap max-w-full">
          "{data.hook}"
        </blockquote>
      </div>

      <div className="p-5 md:p-6">
        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-5 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-blue-500" /> Performance Autopsy
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
          {data.scores?.map((item: any, idx: number) => (
            <div key={idx} className="w-full">
              <div className="flex justify-between text-[12px] font-medium mb-1.5">
                <span className="text-gray-600 truncate mr-2">{item.label}</span>
                <span className="text-gray-900 font-bold shrink-0">{item.score}/10</span>
              </div>
              <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-1000 ease-out ${getScoreColor(item.score)}`}
                  style={{ width: `${(item.score / 10) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-5 md:p-6 bg-gray-900 text-white">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {data.replication_pattern && (
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-amber-400" /> Replication Pattern
              </div>
              <div className="text-[13px] text-gray-300 leading-relaxed break-words whitespace-pre-wrap">
                {data.replication_pattern}
              </div>
            </div>
          )}
          
          <div className={!data.replication_pattern ? "md:col-span-2" : ""}>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-rose-400" /> Critical Fix
            </div>
            <div className="text-[13px] text-gray-300 leading-relaxed break-words whitespace-pre-wrap">
              {data.critical_fix}
            </div>
          </div>
        </div>
        
        <div className="mt-6 pt-4 border-t border-gray-800 flex justify-between items-center">
          <span className="text-[11px] text-gray-400 uppercase tracking-widest font-semibold">Final Verdict</span>
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

// --- MAIN APPLICATION PANE ---
export function EditorPane() {
  const { 
    apiKey, setRenderData, user, 
    activeSessionId, setActiveSessionId,
    isLiveRenderOpen, toggleLiveRender,
    isSidebarOpen, toggleSidebar,
    activeTool,
    chatHistory, setChatHistory // Extracted Global Memory Dictionary
  } = useAppStore();
  
  const supabase = createClient();
  const [input, setInput] = useState('');
  
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attachedDocsText, setAttachedDocsText] = useState<string[]>([]);
  const [docNames, setDocNames] = useState<string[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});
  
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const userName = (user as any)?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Strategist';

  // Drive UI strictly from Global Session Memory
  const messages = activeSessionId ? (chatHistory[activeSessionId] || []) : [];

  // Hydrate missing memory from Database on load/switch
  useEffect(() => {
    async function loadMessages() {
      if (!activeSessionId) return;
      
      // Skip DB fetch if already loaded into fast memory
      const existing = useAppStore.getState().chatHistory[activeSessionId];
      if (existing && existing.length > 0) return; 

      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', activeSessionId)
        .order('created_at', { ascending: true });
        
      if (data && data.length > 0) {
        useAppStore.getState().setChatHistory(activeSessionId, data.map(d => ({ 
          id: d.id, 
          role: d.role as 'user'|'assistant', 
          content: d.content,
          attachments: d.attachments || undefined
        })));
      }
    }
    loadMessages();
  }, [activeSessionId, supabase]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setIsModelDropdownOpen(false);
      }
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setIsAttachMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleThought = (id: string) => {
    setExpandedThoughts(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (attachments.length + files.length > 10) {
      toast.error("You can only attach up to 10 images per message.");
      return;
    }

    const newImages: string[] = [];
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`Image ${file.name} exceeds 5MB limit.`);
        continue;
      }
      try {
        const base64String = await convertFileToBase64(file);
        newImages.push(base64String);
      } catch (error) {
        console.error("Error converting image:", error);
      }
    }
    
    setAttachments(prev => [...prev, ...newImages]);
    if (imageInputRef.current) imageInputRef.current.value = '';
    setIsAttachMenuOpen(false);
  };

  // --- THE CLIENT-SIDE EXTRACTION FIX ---
  const handleFileUpload = async (files: File[]) => {
    if (files.length === 0) return;

    setIsLoading(true);
    const toastId = toast.loading("Processing documents...", { id: 'doc-parse' });

    try {
      for (const file of files) {
        // Safe check for massive files (50MB is generous for local Wasm parsing)
        if (file.size > 50 * 1024 * 1024) {
          toast.error(`${file.name} exceeds 50MB limit.`);
          continue;
        }

        if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
          const text = await file.text();
          setAttachedDocsText(prev => [...prev, `[Document: ${file.name}]\n${text}`]);
          setDocNames(prev => [...prev, file.name]);
        } 
        else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          toast.loading(`Extracting text from ${file.name}...`, { id: toastId });
          
          // Execute client-side extraction to bypass Vercel payload limits completely
          const extractedText = await extractTextFromLocalPDF(file);
          
          setAttachedDocsText(prev => [...prev, `[Document: ${file.name}]\n${extractedText}`]);
          setDocNames(prev => [...prev, file.name]);
        } 
        else {
          toast.error(`Unsupported format: ${file.name}`);
        }
      }
      toast.success("Documents attached and processed!", { id: toastId });
    } catch (error) {
      console.error("Attachment error:", error);
      toast.error("Failed to attach document. It might be encrypted.", { id: toastId });
    } finally {
      setIsLoading(false);
      if (docInputRef.current) docInputRef.current.value = '';
      setIsAttachMenuOpen(false);
    }
  };

  const handleDocChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await handleFileUpload(files);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const removeDoc = (index: number) => {
    setDocNames(prev => prev.filter((_, i) => i !== index));
    setAttachedDocsText(prev => prev.filter((_, i) => i !== index));
  };

  const handleAutoFix = async (originalScore: number | null) => {
    if (originalScore === null || !activeSessionId) return;
    const fixPrompt = `You scored the previous input a ${originalScore}. Apply your own critical fixes and generate a new version that guarantees a 45+ score. Do not explain, just execute the fix.`;
    const newMessage: Message = { id: Date.now().toString(), role: 'user', content: fixPrompt };
    
    const currentMsgs = useAppStore.getState().chatHistory[activeSessionId] || [];
    const newHistory = [...currentMsgs, newMessage];
    
    useAppStore.getState().setChatHistory(activeSessionId, newHistory);
    setIsLoading(true);
    await executeAI(newHistory, activeSessionId);
  };

  const executeAI = async (historyToProcess: Message[], currentSessionId?: string | null) => {
    try {
      const activeProvider = MODELS.find(m => m.id === selectedModel)?.provider || 'openai';
      
      const lastMsg = historyToProcess[historyToProcess.length - 1];
      const currentImages = lastMsg.attachments || [];

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyToProcess,
          apiKey: apiKey,
          provider: activeProvider, 
          images: currentImages, 
          userId: user?.id,
          activeTool: activeTool 
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to connect to the Strategist.');

      let replyText = data.reply;

      const renderRegex = /<render\s+platform=["'](.*?)["'][^>]*>([\s\S]*?)<\/render>/i;
      const renderMatch = replyText.match(renderRegex);
      
      if (renderMatch) {
        const platform = renderMatch[1].toLowerCase() as 'linkedin' | 'twitter' | 'ebook' | 'facebook';
        const content = renderMatch[2].trim();
        if (setRenderData) setRenderData(content, platform);
        replyText = replyText.replace(
          renderMatch[0], 
          `\n\nâœ¨ *I've pushed the finalized draft to your Live Render canvas.*`
        );
      }

      if (currentSessionId) {
        const currentMsgs = useAppStore.getState().chatHistory[currentSessionId] || [];
        useAppStore.getState().setChatHistory(currentSessionId, [...currentMsgs, { id: Date.now().toString(), role: 'assistant', content: replyText }]);

        await supabase.from('chat_messages').insert({
          session_id: currentSessionId,
          role: 'assistant',
          content: replyText
        });
      }

    } catch (error: any) {
      if (currentSessionId) {
        const currentMsgs = useAppStore.getState().chatHistory[currentSessionId] || [];
        useAppStore.getState().setChatHistory(currentSessionId, [...currentMsgs, { id: Date.now().toString(), role: 'assistant', content: `ðŸš¨ Error: ${error.message}` }]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEbookGeneration = async (topic: string, sessionId: string) => {
    try {
      setIsLoading(true);
      const activeProvider = MODELS.find(m => m.id === selectedModel)?.provider || 'openai';

      const updateChat = (text: string) => {
        const msgs = useAppStore.getState().chatHistory[sessionId] || [];
        useAppStore.getState().setChatHistory(sessionId, [...msgs, { id: Date.now().toString(), role: 'assistant', content: text }]);
      };

      updateChat(`*Architecting book structure for: "${topic}"...*`);

      const outRes = await fetch('/api/ebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'outline', topic, provider: activeProvider, secureUserId: user?.id })
      });
      const { chapters } = await outRes.json();

      let compiledBook = "";

      for (let i = 0; i < chapters.length; i++) {
        const chapTitle = chapters[i];
        updateChat(`*Drafting Chapter ${i + 1} of ${chapters.length}: ${chapTitle}...*`);

        const chapRes = await fetch('/api/ebook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 'chapter', topic, chapterTitle: chapTitle, outline: chapters, provider: activeProvider, secureUserId: user?.id })
        });
        
        const { content } = await chapRes.json();
        compiledBook += `## ${chapTitle}\n\n${content}\n\n---\n\n`;
      }

      const displayPayload = `\n\nâœ¨ *I've pushed the finalized eBook draft to your Live Render canvas.*`;
      updateChat(displayPayload);
      
      await supabase.from('chat_messages').insert({ session_id: sessionId, role: 'assistant', content: displayPayload });
      
      if (setRenderData) setRenderData(compiledBook, 'ebook');
      
    } catch (err: any) {
      toast.error('Ebook generation failed.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0 && attachedDocsText.length === 0) || isLoading) return;
    
    let currentSessionId = activeSessionId;
    
    if (!currentSessionId) {
      const { data: sessionData } = await supabase
        .from('chat_sessions')
        .insert({ user_id: user?.id, title: 'New Workspace' })
        .select().single();
        
      if (sessionData) {
        currentSessionId = sessionData.id;
        setActiveSessionId(sessionData.id);
      }
    }

    const msgs = currentSessionId ? (useAppStore.getState().chatHistory[currentSessionId] || []) : [];

    if (msgs.length === 0 && currentSessionId) {
      const newTitle = input.substring(0, 30) + (input.length > 30 ? '...' : 'Document Analysis');
      await supabase.from('chat_sessions').update({ title: newTitle }).eq('id', currentSessionId);
      window.dispatchEvent(new Event('refresh-sidebar'));
    }

    // Attach local client-extracted text to the backend payload safely
    let finalPrompt = input;
    if (attachedDocsText.length > 0) {
      finalPrompt = `${attachedDocsText.join('\n\n')}\n\nUser Prompt: ${input}`;
    }

    const newMessage: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      content: finalPrompt,
      attachments: attachments.length > 0 ? attachments : undefined
    };
    
    const newHistory = [...msgs, newMessage];
    
    if (currentSessionId) {
      useAppStore.getState().setChatHistory(currentSessionId, newHistory);
    }
    
    setInput('');
    setAttachments([]);
    setAttachedDocsText([]);
    setDocNames([]);
    setIsLoading(true);

    if (currentSessionId) {
      await supabase.from('chat_messages').insert({
        session_id: currentSessionId,
        role: 'user',
        content: finalPrompt,
        attachments: newMessage.attachments ? newMessage.attachments : null
      });
    }

    if (activeTool === 'ebook_writer') {
      await handleEbookGeneration(finalPrompt, currentSessionId as string);
    } else {
      await executeAI(newHistory, currentSessionId);
    }
  };

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

    const scoreMatch = finalContent.match(/Overall Score:\s*(\d+)\s*\/\s*50/i) || finalContent.match(/Overall Score:\s*(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
    const needsFix = score !== null && score < 45;

    return { thoughtProcess, finalContent, score, needsFix };
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white relative">
      <input type="file" ref={imageInputRef} onChange={handleImageChange} accept="image/png, image/jpeg, image/webp" multiple className="hidden" />
      <input type="file" ref={docInputRef} onChange={handleDocChange} accept=".pdf,.txt" multiple className="hidden" />

      <div className="absolute top-4 left-4 right-4 z-40 flex justify-between items-center pointer-events-none">
        <div className="pointer-events-auto">
          {!isSidebarOpen && (
            <button onClick={() => toggleSidebar()} className="p-2.5 bg-white border border-gray-200 shadow-sm rounded-full text-gray-500 hover:text-gray-900 transition-colors" title="Open Sidebar">
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="pointer-events-auto">
          <button onClick={() => toggleLiveRender()} className="p-2.5 bg-white border border-gray-200 shadow-sm rounded-full text-gray-500 hover:text-gray-900 transition-colors" title="Toggle Live Render">
            {isLiveRenderOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
          <h1 className="text-4xl font-medium text-gray-900 tracking-tight mb-2">
            Hi {userName}
          </h1>
          <h2 className="text-4xl font-medium text-gray-400 tracking-tight mb-12">
            What should we do today?
          </h2>
          
          <div className="flex gap-3 flex-wrap justify-center max-w-2xl">
            {['Audit my latest post', 'Analyze brand tone', 'Generate viral hook'].map((suggestion) => (
              <button 
                key={suggestion}
                onClick={() => setInput(suggestion)}
                className="px-5 py-3 bg-gray-50 border border-gray-100 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div className="flex-1 overflow-y-auto px-4 md:px-24 pt-16 pb-32 custom-scrollbar">
          <div className="max-w-3xl mx-auto space-y-10">
            {messages.map((msg: Message) => {
              const { thoughtProcess, finalContent, score, needsFix } = parseContent(msg.content);
              const isExpanded = expandedThoughts[msg.id];

              return (
                <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                    msg.role === 'user' ? 'bg-gray-100 text-gray-600' : 'bg-gray-900 text-white'
                  }`}>
                    {msg.role === 'user' ? <UserIcon className="w-4 h-4" /> : <Aperture className="w-4 h-4 text-white" />}
                  </div>
                  
                  <div className={`flex flex-col gap-2 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    
                    {/* Render DB Hydrated Images */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mb-1 flex flex-wrap gap-2 max-w-[300px] justify-end">
                        {msg.attachments.map((imgBase64: string, idx: number) => (
                          <div key={idx} className="rounded-2xl overflow-hidden border border-gray-200 w-20 h-20 shadow-sm">
                            <img src={imgBase64} alt="Upload" className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}

                    {thoughtProcess && (
                      <div className="w-full mb-2">
                        <button 
                          onClick={() => toggleThought(msg.id)}
                          className="flex items-center gap-2 text-[13px] font-medium text-gray-400 hover:text-gray-700 transition-colors py-1 group"
                        >
                          <span className={`w-4 h-4 rounded-full border border-gray-300 flex items-center justify-center transition-colors ${isExpanded ? 'bg-gray-100' : ''}`}>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </span>
                          {isExpanded ? 'Hide thinking process' : 'View thinking process'}
                        </button>
                        
                        {isExpanded && (
                          <div className="mt-3 mb-2 pl-4 border-l-2 border-gray-200 text-[14px] text-gray-500 font-sans whitespace-pre-wrap leading-relaxed animate-in slide-in-from-top-1 fade-in duration-200">
                            {thoughtProcess}
                          </div>
                        )}
                      </div>
                    )}

                    <div className={`text-[15px] leading-relaxed font-sans ${
                      msg.role === 'user' 
                        ? 'bg-gray-100 text-gray-900 px-5 py-3.5 rounded-3xl rounded-tr-sm whitespace-pre-wrap' 
                        : 'text-gray-800 prose prose-sm max-w-none prose-p:leading-relaxed prose-headings:font-semibold prose-a:text-blue-600 prose-pre:bg-[#0D1117] prose-pre:text-gray-100 prose-pre:rounded-xl prose-pre:border prose-pre:border-gray-800'
                    }`}>
                      {msg.role === 'user' ? (
                        finalContent.replace(/\[Document: .*?\]\n[\s\S]*?\n\nUser Prompt: /g, '')
                      ) : (
                        <ReactMarkdown 
                          // @ts-ignore
                          remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                          components={{
                            code(props) {
                              const { children, className, node, ...rest } = props;
                              const match = /language-(\w+)/.exec(className || '');
                              if (match && match[1] === 'grader') {
                                try {
                                  return <GraderCard data={JSON.parse(String(children).replace(/\n$/, ''))} />;
                                } catch (e) {
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
                        className="mt-2 flex items-center gap-2 px-4 py-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 rounded-full text-[12px] font-semibold transition-all shadow-sm"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Auto-Fix to 45+
                      </button>
                    )}

                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center shrink-0 shadow-sm">
                  <Aperture className="w-4 h-4 text-white animate-[spin_3s_linear_infinite]" />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="h-4 w-32 bg-gray-100 rounded-full animate-pulse mt-2"></div>
                  <div className="h-4 w-48 bg-gray-50 rounded-full animate-pulse"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        </div>
      )}

      <div className={`absolute left-0 right-0 px-4 md:px-0 transition-all duration-500 ease-in-out flex justify-center ${
        messages.length === 0 ? 'bottom-1/3' : 'bottom-6'
      }`}>
        <div className="w-full max-w-3xl bg-[#F0F4F9] rounded-3xl p-2.5 shadow-sm border border-transparent focus-within:bg-white focus-within:border-gray-200 focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all">
          
          {(attachments.length > 0 || docNames.length > 0) && (
            <div className="px-3 pt-2 pb-2 flex gap-2 flex-wrap max-h-32 overflow-y-auto custom-scrollbar">
              
              {attachments.map((img: string, idx: number) => (
                <div key={`img-${idx}`} className="relative inline-block group shrink-0">
                  <div className="w-14 h-14 rounded-xl overflow-hidden shadow-sm border border-gray-200">
                    <img src={img} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                  <button 
                    onClick={() => removeAttachment(idx)}
                    className="absolute -top-2 -right-2 bg-gray-900 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {docNames.map((name: string, idx: number) => (
                <div key={`doc-${idx}`} className="relative inline-flex items-center gap-2 bg-white border border-gray-200 py-1.5 px-3 rounded-xl shadow-sm shrink-0 group">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span className="text-[12px] font-semibold text-gray-700 max-w-[120px] truncate">{name}</span>
                  <button 
                    onClick={() => removeDoc(idx)}
                    className="absolute -top-2 -right-2 bg-gray-900 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

            </div>
          )}

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Ask ContentForge or drop an image..."
            className="w-full bg-transparent text-[15px] text-gray-900 px-4 py-2 outline-none resize-none min-h-[44px] max-h-[200px] placeholder:text-gray-500 custom-scrollbar"
            rows={1}
          />
          
          <div className="flex items-center justify-between px-2 pt-2 relative">
            <div className="flex items-center gap-2">
              
              <div className="relative" ref={attachMenuRef}>
                <button 
                  onClick={() => setIsAttachMenuOpen(!isAttachMenuOpen)} 
                  className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-full transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
                
                {isAttachMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-48 bg-white border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.1)] rounded-2xl py-1.5 z-50 animate-in fade-in slide-in-from-bottom-2">
                    <button onClick={() => imageInputRef.current?.click()} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition text-left outline-none">
                      <ImageIcon className="w-4 h-4 text-gray-400" /> Upload Photos
                    </button>
                    <button onClick={() => docInputRef.current?.click()} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition text-left outline-none">
                      <FileText className="w-4 h-4 text-gray-400" /> Upload Document
                    </button>
                  </div>
                )}
              </div>

              <ToolHub />
            </div>

            <div className="flex items-center gap-2">
              
              <div className="relative" ref={modelDropdownRef}>
                <button 
                  onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-gray-200 transition-colors text-[13px] font-medium text-gray-700 outline-none"
                >
                  {selectedModel} <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                </button>

                {isModelDropdownOpen && (
                  <div className="absolute bottom-full right-0 mb-2 w-64 bg-white border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.1)] rounded-2xl p-2 z-50 animate-in fade-in slide-in-from-bottom-2">
                    <div className="px-3 py-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Models</div>
                    {MODELS.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => { setSelectedModel(model.id); setIsModelDropdownOpen(false); }}
                        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 transition text-left group outline-none"
                      >
                        <div>
                          <div className={`text-[14px] font-medium transition-colors ${selectedModel === model.id ? 'text-gray-900' : 'text-gray-700 group-hover:text-gray-900'}`}>
                            {model.id}
                          </div>
                          <div className="text-[12px] text-gray-500">{model.desc}</div>
                        </div>
                        {selectedModel === model.id && (
                          <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button 
                onClick={handleSend}
                disabled={(!input.trim() && attachments.length === 0 && attachedDocsText.length === 0) || isLoading}
                className="p-2.5 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition disabled:opacity-30 disabled:bg-gray-200 disabled:text-gray-400"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}