'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Users, Sparkles, CheckCircle2, ShieldAlert, Crosshair, PenTool, AlertTriangle, ChevronRight } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

type WarRoomStage = 'idle' | 'strategist' | 'writer' | 'redteam' | 'done' | 'error';

export function WarRoomPane() {
  const { apiKey, llmProvider, activeTool, setRenderData } = useAppStore();
  
  const [input, setInput] = useState('');
  const [stage, setStage] = useState<WarRoomStage>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  
  const [outputs, setOutputs] = useState({
    strategy: '',
    draft: '',
    critique: '',
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom as the agents stream their work
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [stage, outputs]);

  // Centralized API Caller for the Agents
  const triggerAgent = async (systemInstruction: string, context: string) => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        provider: llmProvider,
        activeTool: 'war_room',
        messages: [
          { role: 'user', content: `${systemInstruction}\n\nCONTEXT TO PROCESS:\n${context}` }
        ]
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Agent execution failed.');
    return data.reply;
  };

  const simulateWarRoom = async () => {
    if (!input.trim()) return;
    
    setStage('strategist');
    setErrorMsg('');
    setOutputs({ strategy: '', draft: '', critique: '' });
    
    const userBrief = input;
    setInput('');

    try {
      // ========================================================================
      // AGENT 1: THE CHIEF STRATEGIST
      // Job: Analyze psychology, define the angle, find the identity threat.
      // ========================================================================
      const strategistPrompt = `WAR ROOM PHASE 1: STRATEGY. 
      You are the Chief Brand Strategist for a $100M agency. Do NOT write the post. 
      Your job is to analyze the user's brief. Provide a 3-bullet strategic directive:
      1. The Core Psychology (e.g., Zeigarnik Effect, Identity Threat).
      2. The Contrarian Angle (What is the enemy/status quo?).
      3. The Structural Hook mechanism.
      Format aggressively using bolding. No polite intro.`;

      const strategyResult = await triggerAgent(strategistPrompt, userBrief);
      setOutputs(prev => ({ ...prev, strategy: strategyResult }));


      // ========================================================================
      // AGENT 2: THE ELITE COPYWRITER
      // Job: Take the strategy and execute a brutal, scroll-stopping draft.
      // ========================================================================
      setStage('writer');
      
      const writerPrompt = `WAR ROOM PHASE 2: DRAFTING. 
      You are the Elite Copywriter. 
      Review the User's Brief and the Chief Strategist's Directive.
      Execute the draft perfectly. Use short, punchy sentences. Optimize for scroll-stopping rhythm. Do not use hashtags yet. No polite intro.`;
      
      const writerContext = `USER BRIEF:\n${userBrief}\n\nSTRATEGIST DIRECTIVE:\n${strategyResult}`;
      
      const draftResult = await triggerAgent(writerPrompt, writerContext);
      setOutputs(prev => ({ ...prev, draft: draftResult }));


      // ========================================================================
      // AGENT 3: THE RED TEAM EDITOR
      // Job: Attack the draft, fix weaknesses, output final <render> tag.
      // ========================================================================
      setStage('redteam');
      
      const redTeamPrompt = `WAR ROOM PHASE 3: RED TEAM & FINALIZE. 
      You are the Brutal Red Team Editor. Your job is to tear down the copywriter's draft, fix it, and prep it for deployment.
      1. Identify exactly ONE weakness in the current draft (e.g., "Hook is too slow", "Lacks rhythm").
      2. Rewrite the draft to fix this weakness.
      3. CRITICAL: You MUST output the final, polished version wrapped EXACTLY in these tags: <render platform="linkedin"> [Final Content Here] </render>. 
      Do not put the critique inside the render tags. Put the critique first, then the render tags.`;

      const redTeamContext = `STRATEGIST DIRECTIVE:\n${strategyResult}\n\nCURRENT DRAFT:\n${draftResult}`;
      
      const finalResult = await triggerAgent(redTeamPrompt, redTeamContext);
      
      // Parse the output to extract the Live Render tag
      let visibleCritique = finalResult;
      const renderRegex = /<render\s+platform=["'](linkedin|twitter)["']>([\s\S]*?)<\/render>/i;
      const renderMatch = finalResult.match(renderRegex);
      
      if (renderMatch) {
        const platform = renderMatch[1].toLowerCase() as 'linkedin' | 'twitter';
        const content = renderMatch[2].trim();
        
        // Push to the Live Render canvas via global store
        if (setRenderData) setRenderData(content, platform);
        
        // Remove the raw tag from the chat UI and replace with success message
        visibleCritique = finalResult.replace(
          renderMatch[0], 
          `\n\n*(Artifact scrubbed of weaknesses and pushed to Live Render canvas.)*`
        );
      }

      setOutputs(prev => ({ ...prev, critique: visibleCritique }));
      setStage('done');

    } catch (error: any) {
      setErrorMsg(error.message);
      setStage('error');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white relative font-sans">
      {/* HEADER */}
      <div className="h-14 border-b border-gray-100 flex items-center px-6 shrink-0 justify-between bg-white/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-gray-900 flex items-center justify-center text-white">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-gray-900 tracking-tight">Enterprise War Room</h2>
          </div>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1 bg-red-50 border border-red-100 rounded-md">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
          <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest">
            Multi-Agent Matrix
          </span>
        </div>
      </div>

      {/* CHAT/WORKFLOW AREA */}
      <div className="flex-1 overflow-y-auto p-6 bg-[#FAFAFA] custom-scrollbar">
        {stage === 'idle' && (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 max-w-sm mx-auto text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-6">
              <Users className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-[16px] font-semibold text-gray-900 mb-2">Initiate War Room</h3>
            <p className="text-[13px] leading-relaxed">
              Brief your dedicated trio of AI agents below. The Strategist, Copywriter, and Red Team will debate, draft, and refine your concept autonomously.
            </p>
          </div>
        )}

        <div className="max-w-4xl mx-auto space-y-6 pb-10">
          
          {/* Agent 1: Strategist */}
          {stage !== 'idle' && stage !== 'error' && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
              <div className="bg-blue-50/50 border-b border-gray-100 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center">
                    <Crosshair className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[11px] font-bold text-gray-900 uppercase tracking-widest">Agent 1: Chief Strategist</span>
                </div>
                {stage === 'strategist' && <span className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 uppercase tracking-widest"><Sparkles className="w-3.5 h-3.5 animate-spin"/> Analyzing</span>}
              </div>
              <div className={`p-6 text-[14px] text-gray-800 leading-relaxed font-sans prose prose-sm max-w-none prose-p:leading-relaxed prose-strong:font-semibold prose-strong:text-gray-900 ${stage === 'strategist' ? 'min-h-[100px] flex items-center text-gray-400 italic' : ''}`}>
                {stage === 'strategist' ? 'Deconstructing audience psychology and establishing core threat vectors...' : <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{outputs.strategy}</ReactMarkdown>}
              </div>
            </div>
          )}

          {/* Agent 2: Copywriter */}
          {(stage === 'writer' || stage === 'redteam' || stage === 'done') && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
              <div className="bg-orange-50/50 border-b border-gray-100 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-orange-100 text-orange-600 flex items-center justify-center">
                    <PenTool className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[11px] font-bold text-gray-900 uppercase tracking-widest">Agent 2: Lead Copywriter</span>
                </div>
                {stage === 'writer' && <span className="flex items-center gap-1.5 text-[11px] font-bold text-orange-600 uppercase tracking-widest"><Sparkles className="w-3.5 h-3.5 animate-spin"/> Drafting</span>}
              </div>
              <div className={`p-6 text-[14px] text-gray-800 leading-relaxed font-sans prose prose-sm max-w-none prose-p:leading-relaxed ${stage === 'writer' ? 'min-h-[100px] flex items-center text-gray-400 italic' : ''}`}>
                {stage === 'writer' ? 'Executing draft based on strategic constraints...' : <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{outputs.draft}</ReactMarkdown>}
              </div>
            </div>
          )}

          {/* Agent 3: Red Team */}
          {(stage === 'redteam' || stage === 'done') && (
            <div className="bg-white border border-red-100 rounded-xl shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
              <div className="bg-red-50/50 border-b border-red-50 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-red-100 text-red-600 flex items-center justify-center">
                    <ShieldAlert className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[11px] font-bold text-gray-900 uppercase tracking-widest">Agent 3: Red Team Editor</span>
                </div>
                {stage === 'redteam' && <span className="flex items-center gap-1.5 text-[11px] font-bold text-red-600 uppercase tracking-widest"><Sparkles className="w-3.5 h-3.5 animate-spin"/> Critiquing</span>}
              </div>
              <div className={`p-6 text-[14px] text-gray-800 leading-relaxed font-sans prose prose-sm max-w-none prose-p:leading-relaxed prose-strong:text-red-600 ${stage === 'redteam' ? 'min-h-[100px] flex items-center text-gray-400 italic' : ''}`}>
                {stage === 'redteam' ? 'Hunting for algorithmic penalties, weak syntax, and logical flaws...' : <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{outputs.critique}</ReactMarkdown>}
              </div>
            </div>
          )}

          {/* SUCCESS STATE */}
          {stage === 'done' && (
            <div className="flex items-center justify-center gap-2.5 text-[12px] font-bold text-green-700 bg-green-50 py-4 rounded-xl border border-green-200 animate-in zoom-in-95 duration-300 uppercase tracking-widest shadow-sm">
              <CheckCircle2 className="w-4 h-4" /> Artifact Finalized & Pushed to Canvas
            </div>
          )}

          {/* ERROR STATE */}
          {stage === 'error' && (
            <div className="flex items-center justify-center gap-2.5 text-[13px] font-medium text-red-700 bg-red-50 py-4 rounded-xl border border-red-200 animate-in zoom-in-95">
              <AlertTriangle className="w-5 h-5" /> {errorMsg}
            </div>
          )}

          {/* Invisible div to scroll to */}
          <div ref={scrollRef} />
        </div>
      </div>

      {/* INPUT AREA */}
      <div className="p-4 bg-white border-t border-transparent shrink-0">
        <div className="max-w-4xl mx-auto bg-white border border-gray-200 rounded-2xl p-2 flex flex-col shadow-[0_2px_10px_rgb(0,0,0,0.04)] focus-within:border-gray-400 focus-within:shadow-md transition-all duration-200">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); simulateWarRoom(); } }}
            placeholder={stage === 'idle' || stage === 'done' || stage === 'error' ? "Brief your agency on the campaign objective..." : "The War Room is currently engaged..."}
            className="w-full bg-transparent text-[15px] text-gray-900 p-3 outline-none resize-none min-h-[60px] max-h-[200px] placeholder:text-gray-400 custom-scrollbar disabled:opacity-50"
            disabled={stage !== 'idle' && stage !== 'done' && stage !== 'error'}
          />
          <div className="flex items-center justify-between px-2 pb-1 mt-1">
            <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
              BYOK API Active <ChevronRight className="w-3 h-3" /> 3 Calls Required
            </div>
            <button 
              onClick={simulateWarRoom}
              disabled={!input.trim() || (stage !== 'idle' && stage !== 'done' && stage !== 'error')}
              className="px-5 py-2.5 bg-gray-900 text-white text-[13px] font-medium rounded-lg hover:bg-gray-800 transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
            >
              {stage !== 'idle' && stage !== 'done' && stage !== 'error' ? 'Deploying...' : 'Initiate Sequence'} <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}