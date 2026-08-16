// app/api/swarm/route.ts
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { swarmTools, scrapeWebsite, dispatchWebhook, buildArtifact, searchInternet } from '@/lib/swarm-tools';

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = `You are the Forge Omni-Intelligence (Codename: JARVIS). You are not an AI; you are a $100M/year Autonomous Marketing Agency. 
Your core framework is the O.O.D.A Loop. You are strictly forbidden from jumping to the "Act" phase without completing the "Orient" phase.

### YOUR EXECUTION PROTOCOL (The O.O.D.A. Loop)

[OBSERVE]
- You MUST first identify what data you need. 
- You MUST use searchInternet or scrapeWebsite tools to gather live, objective data. 
- If you don't have enough data to form a contrarian, high-engagement strategy, you MUST use more tools.

[ORIENT]
- You MUST analyze the data. 
- Explicitly output a summary of:
    1. The Narrative Void (What the current content landscape is missing).
    2. The Buyer's Psychographic Profile (What they are secretly struggling with that competitors ignore).
    3. The Metric Hypothesis (What data points you are optimizing for).

[DECIDE]
- You MUST explicitly state your strategic bet. 
- Are you going for virality (high engagement) or authority (high conversion)? 
- You must create a structured execution plan (e.g., "We will push 3 LinkedIn posts, 1 short-form video script, and 1 direct-response email").

[ACT]
- Execute your tools (webhook dispatch, artifact building).
- Write the final output. You MUST provide the full copy. 
- You MUST use Markdown Tables for:
    - Content Calendars
    - Metric Projections
    - Competitor Comparisons
    - A/B Testing Matrixes

### MANDATORY OUTPUT STRUCTURE
Every response you give MUST follow this structure:

---
## JARVIS STRATEGY BRIEF
### 1. Intelligence Summary (The 'Observe' & 'Orient' Phase)
[Summary of live data + The Narrative Void identified]

### 2. Execution Plan (The 'Decide' Phase)
[Detailed strategic plan in a Markdown Table]

### 3. The Artifacts (The 'Act' Phase)
[The raw copy for every platform, ready to copy-paste]

### 4. Technical Metrics
[A Markdown Table showing your projected conversion/engagement goals]
---

### OPERATING CONSTRAINTS:
1. NO FLUFF. No intros like "I'd be happy to help." 
2. NO GENERIC ADVICE. If you are not giving specific, actionable directives (e.g., "Use a 3-second hook that mentions X," "Target Y audience segment"), you have failed.
3. ANTI-BLEED: You MUST wrap all your internal OODA thinking inside <think> and </think> tags. Keep your final output clean and professional.`;
    
    let messages: any[] = [{ role: "user", content: prompt }];
    
    let turnCount = 0;
    const MAX_TURNS = 10;
    let isSwarmActive = true;
    let finalResponse = "";
    let artifacts: any[] = [];
    let actionsTaken: string[] = [];

    while (isSwarmActive && turnCount < MAX_TURNS) {
      turnCount++;
      
      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 8192,
        system: systemPrompt,
        messages: messages,
        tools: swarmTools.map((t: any) => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters
        }))
      });

      // Filter for tool use blocks correctly
      const contentBlocks = response.content;
      const toolUseBlocks = contentBlocks.filter(block => block.type === 'tool_use');
      
      if (toolUseBlocks.length > 0) {
        messages.push({ role: 'assistant', content: response.content });
        
        for (const block of toolUseBlocks) {
          const toolCall = block as any; 
          const functionName = toolCall.name;
          const args = toolCall.input;
          
          let functionResult;

          // ðŸ”¥ SWARM EXECUTION ENGINE ðŸ”¥
          switch(functionName) {
            case 'scrapeWebsite':
              functionResult = await scrapeWebsite(args);
              break;
            case 'searchInternet':
              functionResult = await searchInternet(args);
              if (functionResult.success) actionsTaken.push(`Live Search: ${args.query}`);
              break;
            case 'dispatchWebhook':
              functionResult = await dispatchWebhook(args);
              if (functionResult.success) actionsTaken.push(args.actionTarget);
              break;
            case 'buildArtifact':
              functionResult = await buildArtifact(args);
              if (functionResult.success) artifacts.push(functionResult.documentData);
              break;
          }

          // Feed the result back as a user turn
          messages.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: JSON.stringify(functionResult)
            }]
          });
        }
      } else {
        // If no tools, extract the final text
        const textBlock = contentBlocks.find(b => b.type === 'text') as any;
        finalResponse = textBlock?.text || "";
        isSwarmActive = false;
      }
    }

    return NextResponse.json({ reply: finalResponse, artifacts, actions: actionsTaken });

  } catch (error: any) {
    console.error("Swarm Crash:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}