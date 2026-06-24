'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Send, X, ChevronDown, ChevronUp, RefreshCw, 
  Check, User as UserIcon, Aperture, Image as ImageIcon, FileText,
  PanelRightClose, PanelRightOpen, PanelLeftOpen,
  Activity, Zap, AlertTriangle, Copy, Edit2, Upload, Paperclip, MoreHorizontal, Plus
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

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: string[];
}

const MODELS = [
  { id: 'claude haiku 4.5', provider: 'anthropic', desc: 'Deep synthesis & strategy' }
];

const TOOL_NAMES: Record<string, string> = {
  'ebook_writer': 'Ebook',
  'content_analyzer': 'Analysis',
  'hook_generator': 'Hook',
  'shadowban_checker': 'Shadowban',
};

const deriveBookTitle = (topic: string) => {
  let t = topic.replace(/^(write|create|generate|make)\s+(an?\s+)?(e-?book|book|guide)\s+(on|about|for)\s+/i, '').trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t.length > 80 ? t.slice(0, 80) + '…' : t;
};

const convertFileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

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
          "{data.hook}"
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

export function EditorPane() {
  const { 
    apiKey, setRenderData, user, 
    activeSessionId, setActiveSessionId,
    isLiveRenderOpen, toggleLiveRender,
    isSidebarOpen, toggleSidebar,
    activeTool,
    chatHistory, setChatHistory 
  } = useAppStore();
  
  const supabase = createClient();
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attachedDocsText, setAttachedDocsText] = useState<string[]>([]);
  const [docNames, setDocNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [showToolHub, setShowToolHub] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const [sessionGreeting, setSessionGreeting] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const displayName = useMemo(() => {
    const fullName =
      (user as any)?.user_metadata?.full_name ||
      (user as any)?.user_metadata?.name;
    if (fullName) {
      return fullName.split(' ')[0] as string;
    }
    const emailPrefix = user?.email?.split('@')[0] || 'there';
    return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
  }, [user]);

  const messages = activeSessionId ? (chatHistory[activeSessionId] || []) : [];
  const isChatActive = messages.length > 0;
  const activeToolName = activeTool ? (TOOL_NAMES[activeTool] || activeTool) : null;

  useEffect(() => {
    if (!displayName || displayName === 'There') return;
    const hour = new Date().getHours();
    const name = displayName;
    const timeGreeting =
      hour < 12 ? `Good morning, ${name}` :
      hour < 17 ? `Good afternoon, ${name}` :
                  `Good evening, ${name}`;
    const options = [
      `Hey there, ${name}`,
      `Welcome back, ${name}`,
      `Good to see you, ${name}`,
      timeGreeting,
      `What are we building today, ${name}?`,
      `Ready to create, ${name}?`,
      `The canvas is yours, ${name}`,
      `What's the vision, ${name}?`,
      `Let's forge something great, ${name}`,
      `Ideas loaded, ${name}?`,
    ];
    setSessionGreeting(options[Math.floor(Math.random() * options.length)]);
  }, [displayName]);

  useEffect(() => {
    async function loadMessages() {
      if (!activeSessionId) return;
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
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
  }, [messages, isLoading]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setIsAttachMenuOpen(false);
        setShowToolHub(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleThought = (id: string) => setExpandedThoughts(prev => ({ ...prev, [id]: !prev[id] }));

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (attachments.length + files.length > 10) {
      toast.error("You can only attach up to 10 images per message.");
      return;
    }
    const newImages: string[] = [];
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) continue;
      try {
        const base64String = await convertFileToBase64(file);
        newImages.push(base64String);
      } catch (error) {}
    }
    setAttachments(prev => [...prev, ...newImages]);
    if (imageInputRef.current) imageInputRef.current.value = '';
    setIsAttachMenuOpen(false);
  };

  const handleFileUpload = async (files: File[]) => {
    if (files.length === 0) return;
    setIsLoading(true);
    const toastId = toast.loading("Processing documents...", { id: 'doc-parse' });
    try {
      for (const file of files) {
        if (file.size > 50 * 1024 * 1024) continue;
        if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
          const text = await file.text();
          setAttachedDocsText(prev => [...prev, `[Document: ${file.name}]\n${text}`]);
          setDocNames(prev => [...prev, file.name]);
        } 
        else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          toast.loading(`Extracting text from ${file.name}...`, { id: toastId });
          const extractedText = await extractTextFromLocalPDF(file);
          setAttachedDocsText(prev => [...prev, `[Document: ${file.name}]\n${extractedText}`]);
          setDocNames(prev => [...prev, file.name]);
        } 
      }
      toast.success("Documents attached and processed!", { id: toastId });
    } catch (error) {
      toast.error("Failed to attach document.", { id: toastId });
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

  const removeAttachment = (index: number) => setAttachments(prev => prev.filter((_, i) => i !== index));
  const removeDoc = (index: number) => {
    setDocNames(prev => prev.filter((_, i) => i !== index));
    setAttachedDocsText(prev => prev.filter((_, i) => i !== index));
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text.replace(/\[Document: .*?\]\n[\s\S]*?\n\nUser Prompt: /g, ''));
    toast.success("Copied to clipboard", { style: { background: '#333', color: '#fff' }});
  };

  const handleShare = async () => {
    if (!activeSessionId) return;

    const { data, error } = await supabase
      .from('chat_sessions')
      .update({ is_public: true })
      .eq('id', activeSessionId)
      .select('share_token')
      .single();

    if (error || !data) {
      toast.error('Failed to generate secure share link.');
      return;
    }

    const shareUrl = `${window.location.origin}/share/${data.share_token}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Secure share link copied!');
    } catch (err) {
      toast.error('Failed to copy link');
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  };

  const startEditing = (msg: Message) => {
    setEditingMsgId(msg.id);
    setEditContent(msg.content.replace(/\[Document: .*?\]\n[\s\S]*?\n\nUser Prompt: /g, ''));
  };

  const submitEdit = async (msgId: string) => {
    if (!activeSessionId || !editContent.trim()) return;
    const msgs = chatHistory[activeSessionId] || [];
    const msgIndex = msgs.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;
    
    const updatedMsg = { ...msgs[msgIndex], content: editContent };
    const historyToProcess = [...msgs.slice(0, msgIndex), updatedMsg];
    
    useAppStore.getState().setChatHistory(activeSessionId, historyToProcess);
    setEditingMsgId(null);
    setIsLoading(true);
    await executeAI(historyToProcess, activeSessionId);
  };

  const handleRegenerate = async (msgId: string) => {
    if (!activeSessionId) return;
    const msgs = chatHistory[activeSessionId] || [];
    const msgIndex = msgs.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;
    
    const historyToProcess = msgs.slice(0, msgIndex);
    useAppStore.getState().setChatHistory(activeSessionId, historyToProcess);
    setIsLoading(true);
    await executeAI(historyToProcess, activeSessionId);
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
      abortControllerRef.current = new AbortController();
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
        }),
        signal: abortControllerRef.current.signal
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      let replyText = data.reply;
      const renderRegex = /<render\s+platform=["'](.*?)["'][^>]*>([\s\S]*?)<\/render>/i;
      const renderMatch = replyText.match(renderRegex);
      
      if (renderMatch) {
        const platform = renderMatch[1].toLowerCase() as 'linkedin' | 'twitter' | 'ebook' | 'facebook';
        const content = renderMatch[2].trim();
        if (setRenderData) setRenderData(content, platform);
        replyText = replyText.replace(renderMatch[0], `\n\n✨ *I've pushed the finalized draft to your Live Render canvas.*`);
      }

      if (currentSessionId) {
        const currentMsgs = useAppStore.getState().chatHistory[currentSessionId] || [];
        useAppStore.getState().setChatHistory(currentSessionId, [...currentMsgs, { id: Date.now().toString(), role: 'assistant', content: replyText }]);
        await supabase.from('chat_messages').insert({ session_id: currentSessionId, role: 'assistant', content: replyText });
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        if (currentSessionId) {
          const currentMsgs = useAppStore.getState().chatHistory[currentSessionId] || [];
          useAppStore.getState().setChatHistory(currentSessionId, [...currentMsgs, { id: Date.now().toString(), role: 'assistant', content: `*Generation stopped by user.*` }]);
        }
        return;
      }
      if (currentSessionId) {
        const currentMsgs = useAppStore.getState().chatHistory[currentSessionId] || [];
        useAppStore.getState().setChatHistory(currentSessionId, [...currentMsgs, { id: Date.now().toString(), role: 'assistant', content: `🚨 Error: ${error.message}` }]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEbookGeneration = async (topic: string, sessionId: string) => {
    try {
      setIsLoading(true);
      abortControllerRef.current = new AbortController();
      const activeProvider = MODELS.find(m => m.id === selectedModel)?.provider || 'openai';
      
      const updateChat = (text: string) => {
        const msgs = useAppStore.getState().chatHistory[sessionId] || [];
        useAppStore.getState().setChatHistory(sessionId, [...msgs, { id: Date.now().toString(), role: 'assistant', content: text }]);
      };

      updateChat(`*Architecting book structure for: "${topic}"...*`);

      const outRes = await fetch('/api/ebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'outline', topic, provider: activeProvider, secureUserId: user?.id }),
        signal: abortControllerRef.current.signal
      });
      const { chapters } = await outRes.json();
      let compiledBook = "";

      for (let i = 0; i < chapters.length; i++) {
        const chapTitle = chapters[i];
        updateChat(`*Drafting Chapter ${i + 1} of ${chapters.length}: ${chapTitle}...*`);
        const chapRes = await fetch('/api/ebook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 'chapter', topic, chapterTitle: chapTitle, outline: chapters, provider: activeProvider, secureUserId: user?.id }),
          signal: abortControllerRef.current.signal
        });
        const { content } = await chapRes.json();
        compiledBook += `## ${chapTitle}\n\n${content}\n\n---\n\n`;
      }

      const bookTitle = deriveBookTitle(topic);
      const finalBook = `# ${bookTitle}\n\n${compiledBook}`;

      await supabase.from('ebooks').insert({
        user_id: user?.id,
        session_id: sessionId,
        title: bookTitle,
        content: compiledBook,
        word_count: compiledBook.split(/\s+/).length,
      });

      const displayPayload = `\n\n✨ *I've pushed the finalized eBook draft to your Live Render canvas — it's also saved in My Ebooks.*`;
      updateChat(displayPayload);
      await supabase.from('chat_messages').insert({ session_id: sessionId, role: 'assistant', content: displayPayload });
      if (setRenderData) setRenderData(finalBook, 'ebook');
    } catch (error: any) {
      if (error.name === 'AbortError') {
        const msgs = useAppStore.getState().chatHistory[sessionId] || [];
        useAppStore.getState().setChatHistory(sessionId, [...msgs, { id: Date.now().toString(), role: 'assistant', content: `*Ebook generation stopped.*` }]);
        return;
      }
      toast.error('Ebook generation failed.');
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
    if (currentSessionId) useAppStore.getState().setChatHistory(currentSessionId, newHistory);
    
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
    const scoreMatch = finalContent.match(/Overall Score:\s*(\d+(\.\d+)?)\s*\/\s*50/i) || finalContent.match(/Overall Score:\s*(\d+(\.\d+)?)/i);
    const score = scoreMatch ? parseFloat(scoreMatch[1]) : null;
    const needsFix = score !== null && score < 45;
    return { thoughtProcess, finalContent, score, needsFix };
  };

  return (
    <div className="absolute inset-0 bg-[#000000] text-white font-sans overflow-hidden">
      
      <div 
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[1200px] pointer-events-none z-0 transition-opacity duration-700 ${!isChatActive ? 'opacity-100' : 'opacity-0'}`}
        style={{ background: 'radial-gradient(circle at 50% 50%, rgba(210, 85, 20, 0.28) 0%, rgba(130, 45, 5, 0.15) 25%, rgba(0, 0, 0, 0) 50%)' }}
      />

      <input type="file" ref={imageInputRef} onChange={handleImageChange} accept="image/png, image/jpeg, image/webp" multiple className="hidden" />
      <input type="file" ref={docInputRef} onChange={handleDocChange} accept=".pdf,.txt" multiple className="hidden" />

      <div className="absolute top-4 left-4 right-4 z-40 flex justify-between items-center pointer-events-none">
        <div className="pointer-events-auto">
          {!isSidebarOpen && (
            <button 
              onClick={() => toggleSidebar()} 
              className="p-2.5 bg-[#1c1c1c] border border-[#333] shadow-sm rounded-full text-[#888] hover:text-white transition-colors"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="pointer-events-auto">
          <button 
            onClick={() => toggleLiveRender()} 
            className="p-2.5 bg-[#1c1c1c] border border-[#333] shadow-sm rounded-full text-[#888] hover:text-white transition-colors"
          >
            {isLiveRenderOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </div>
      </div>
      
      <div 
       ref={scrollContainerRef}
      className="absolute inset-0 z-10 overflow-y-auto custom-scrollbar pt-20 pb-[220px] flex flex-col">
        
        {!isChatActive ? (
          <div className="flex-1 flex flex-col items-center justify-center w-full min-h-full px-4 animate-in fade-in duration-500">
            <h1 className="text-[40px] font-normal text-[#f5f5f5] tracking-tight mb-8 text-center">
              {sessionGreeting || `Hey there, ${displayName}`}
            </h1>
          </div>
        ) : (
          <div className="flex-1 flex flex-col w-full min-h-full">
            <div className="flex-1 min-h-0" />
            <div className="max-w-3xl mx-auto w-full px-4 md:px-0 space-y-10 pb-12">
              {messages.map((msg: Message) => {
                const { thoughtProcess, finalContent, score, needsFix } = parseContent(msg.content);
                const isExpanded = expandedThoughts[msg.id];
                const isEditing = editingMsgId === msg.id;

                return (
                  <div key={msg.id} className={`group/msg flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                      msg.role === 'user' ? 'bg-[#1c1c1c] text-[#888] border border-[#333]' : 'bg-transparent text-white'
                    }`}>
                      {msg.role === 'user' ? <UserIcon className="w-4 h-4" /> : <Aperture className="w-5 h-5 text-[#d18a5e]" />}
                    </div>
                    
                    <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-2 max-w-[300px] justify-end">
                          {msg.attachments.map((imgBase64: string, idx: number) => (
                            <div key={idx} className="rounded-2xl overflow-hidden border border-[#333] w-20 h-20 shadow-sm">
                              <img src={imgBase64} alt="Upload" className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      )}

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

                      {isEditing ? (
                        <div className="bg-[#1c1c1c] border border-[#333] rounded-2xl p-4 w-full min-w-[400px]">
                          <textarea 
                            value={editContent} 
                            onChange={(e) => setEditContent(e.target.value)} 
                            className="w-full bg-transparent text-[#e0e0e0] text-[15px] outline-none resize-none min-h-[80px] custom-scrollbar" 
                          />
                          <div className="flex justify-end gap-3 mt-3">
                            <button onClick={() => setEditingMsgId(null)} className="px-4 py-2 rounded-full text-[13px] font-medium bg-[#2a2a2a] hover:bg-[#333] text-white transition-colors">Cancel</button>
                            <button onClick={() => submitEdit(msg.id)} className="px-4 py-2 rounded-full text-[13px] font-medium bg-white text-black hover:bg-gray-200 transition-colors">Send</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className={`text-[15px] leading-relaxed font-sans ${
                            msg.role === 'user' 
                              ? 'bg-[#1c1c1c] text-white px-5 py-3.5 rounded-3xl rounded-tr-sm border border-[#333] whitespace-pre-wrap' 
                              : 'text-[#e0e0e0] prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-headings:font-semibold prose-a:text-blue-400 prose-pre:bg-[#111] prose-pre:border prose-pre:border-[#333]'
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
                                    const isInline = !match && !className?.includes('language-');
                                    
                                    if (isInline) {
                                      return <code className="bg-[#1e1e1e] border border-[#333] px-1.5 py-0.5 rounded text-[13px] text-[#ffc4a3]" {...rest}>{children}</code>;
                                    }

                                    const language = match?.[1]?.toLowerCase() || 'code';
                                    const rawText = Array.isArray(children) ? children.join('') : String(children);
                                    
                                    if (language === 'grader') {
                                      try {
                                        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                                        let cleanText = jsonMatch ? jsonMatch[0] : rawText;
                                        cleanText = cleanText.replace(/,\s*([\}\]])/g, '$1');
                                        const parsedData = JSON.parse(cleanText);
                                        return <GraderCard data={parsedData} />;
                                      } catch (e) {
                                        console.error("Grader Card Parse Error:", e);
                                      }
                                    }

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

                          <div className={`flex items-center gap-4 mt-3 text-[#666] opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200 ${msg.role === 'user' ? 'justify-end pr-2' : 'justify-start pl-2'}`}>
                            <button onClick={() => handleCopy(msg.content)} className="hover:text-white transition-colors p-1"><Copy className="w-[15px] h-[15px]"/></button>
                            {msg.role === 'user' ? (
                              <button onClick={() => startEditing(msg)} className="hover:text-white transition-colors p-1"><Edit2 className="w-[15px] h-[15px]"/></button>
                            ) : (
                              <>
                                <button onClick={handleShare} className="hover:text-white transition-colors p-1"><Upload className="w-[15px] h-[15px]"/></button>
                                <button onClick={() => handleRegenerate(msg.id)} className="hover:text-white transition-colors p-1"><RefreshCw className="w-[15px] h-[15px]"/></button>
                              </>
                            )}
                          </div>
                        </>
                      )}

                      {needsFix && msg.role === 'assistant' && !isEditing && (
                        <button 
                          onClick={() => handleAutoFix(score)}
                          className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#1c1c1c] text-white hover:bg-[#2a2a2a] border border-[#333] rounded-full text-[12px] font-semibold transition-all shadow-sm"
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
                  <div className="w-8 h-8 rounded-full bg-transparent flex items-center justify-center shrink-0">
                    <Aperture className="w-5 h-5 text-[#d18a5e] animate-[spin_3s_linear_infinite]" />
                  </div>
                  <div className="flex flex-col gap-2 mt-1.5">
                    <div className="h-3 w-32 bg-[#222] rounded-full animate-pulse"></div>
                    <div className="h-3 w-48 bg-[#111] rounded-full animate-pulse"></div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-40 w-full flex flex-col items-center bg-[#000000] pt-4 pb-8 px-4 md:px-0 border-t border-[#111]">
        <div className="w-full max-w-[720px] mx-auto relative">
          
          <div className="flex items-center gap-4 w-full">
            {!isChatActive && (
              <button 
                className="w-[54px] h-[54px] rounded-full flex items-center justify-center shrink-0 shadow-sm border border-[#3d3d3d] hover:border-[#555] transition-colors"
                style={{ background: 'linear-gradient(135deg, #2e2e2e 0%, #151515 100%)' }}
                onClick={() => setIsAttachMenuOpen(!isAttachMenuOpen)}
              >
                <Plus className={`w-6 h-6 text-[#999] transition-transform duration-200 ${isAttachMenuOpen ? 'rotate-45' : 'rotate-0'}`} />
              </button>
            )}

            <div className={`flex-1 relative flex items-center bg-[#1c1c1c] border border-[#333] shadow-[inset_0_2px_6px_rgba(0,0,0,0.2)] transition-colors focus-within:border-[#555] ${
              isChatActive ? 'rounded-[28px] h-[56px] pl-2 pr-2' : 'rounded-[28px] h-[56px] pl-6 pr-2'
            }`}>
              
              {(attachments.length > 0 || docNames.length > 0) && (
                <div className="absolute bottom-full left-0 mb-3 flex gap-2 flex-wrap z-50">
                  {attachments.map((img: string, idx: number) => (
                    <div key={`img-${idx}`} className="relative inline-block group shrink-0">
                      <div className="w-14 h-14 rounded-xl overflow-hidden shadow-sm border border-[#333]">
                        <img src={img} alt="Preview" className="w-full h-full object-cover" />
                      </div>
                      <button 
                        onClick={() => removeAttachment(idx)}
                        className="absolute -top-2 -right-2 bg-black text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-[#333]"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {docNames.map((name: string, idx: number) => (
                    <div key={`doc-${idx}`} className="relative inline-flex items-center gap-2 bg-[#1c1c1c] border border-[#333] py-1.5 px-3 rounded-xl shadow-sm shrink-0 group">
                      <FileText className="w-4 h-4 text-[#d18a5e]" />
                      <span className="text-[12px] font-medium text-white max-w-[120px] truncate">{name}</span>
                      <button 
                        onClick={() => removeDoc(idx)}
                        className="absolute -top-2 -right-2 bg-black text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-[#333]"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {isChatActive && (
                <button 
                  onClick={() => setIsAttachMenuOpen(!isAttachMenuOpen)}
                  className="w-[40px] h-[40px] flex items-center justify-center text-[#888] hover:text-white transition-colors shrink-0"
                >
                  <Plus className={`w-6 h-6 transition-transform duration-200 ${isAttachMenuOpen ? 'rotate-45' : 'rotate-0'}`} />
                </button>
              )}

              {activeToolName && (
                <div className="bg-[#2a2a2a] text-white text-[13px] font-medium px-3 py-1.5 rounded-[10px] shrink-0 mr-2 flex items-center">
                  {activeToolName}
                </div>
              )}

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
                placeholder="Ask Forge..."
                className="flex-1 h-full bg-transparent text-[15px] text-white outline-none placeholder:text-[#666] min-w-0"
              />
              
              {isLoading ? (
                <button 
                  onClick={handleStop}
                  className="w-[40px] h-[40px] rounded-full flex items-center justify-center bg-black border border-[#333] hover:bg-[#111] transition-all shrink-0"
                >
                  <div className="w-3.5 h-3.5 bg-white rounded-[2px]" />
                </button>
              ) : (
                <button 
                  onClick={handleSend}
                  disabled={(!input.trim() && attachments.length === 0 && attachedDocsText.length === 0)}
                  className="w-[40px] h-[40px] rounded-full flex items-center justify-center border border-[#4a2107] transition-all disabled:opacity-50 disabled:grayscale shrink-0"
                  style={{ background: 'radial-gradient(circle at center, #bf671d 0%, #3b1803 100%)' }}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5"></line>
                    <polyline points="5 12 12 5 19 12"></polyline>
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div ref={attachMenuRef} className="absolute bottom-full left-0 mb-4 z-50">
            {isAttachMenuOpen && !showToolHub && (
              <div className="w-[200px] bg-[#1a1a1a] border border-[#2a2a2a] shadow-[0_8px_30px_rgba(0,0,0,0.6)] rounded-[16px] py-2 animate-in fade-in zoom-in-95 duration-100">
                <button onClick={() => imageInputRef.current?.click()} className="w-full flex items-center gap-3 px-4 py-3 text-[14px] font-medium text-[#ccc] hover:bg-[#2a2a2a] hover:text-white transition text-left outline-none">
                  <Paperclip className="w-4 h-4 text-[#888]" /> Upload files
                </button>
                <button onClick={() => setShowToolHub(true)} className="w-full flex items-center gap-3 px-4 py-3 text-[14px] font-medium text-[#ccc] hover:bg-[#2a2a2a] hover:text-white transition text-left outline-none">
                  <MoreHorizontal className="w-4 h-4 text-[#888]" /> More Tools ... <span className="ml-auto text-[#666]">{'>'}</span>
                </button>
              </div>
            )}

            {isAttachMenuOpen && showToolHub && (
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] shadow-[0_8px_30px_rgba(0,0,0,0.6)] rounded-[16px] animate-in fade-in zoom-in-95 duration-100">
                <ToolHub />
              </div>
            )}
          </div>

          {!isChatActive && (
            <div className="flex justify-center gap-[60px] mt-[30px]">
              {['Write Ebook', 'Content Analysis', 'Linkedin post'].map((suggestion) => (
                <span 
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="text-[14px] text-[#888] font-medium cursor-pointer hover:text-white transition-colors"
                >
                  {suggestion}
                </span>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}