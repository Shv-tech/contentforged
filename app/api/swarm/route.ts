// app/api/swarm/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { swarmTools, scrapeWebsite, dispatchWebhook, buildArtifact, searchInternet } from '@/lib/swarm-tools';

export async function POST(req: Request) {
  try {
    const { prompt, apiKey } = await req.json();
    const openai = new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });

    // The God-Prompt: Telling it that it is an agency, not a chatbot.
    const systemPrompt = `You are the ContentForge Omni-Intelligence (Codename: JARVIS). You are not a chatbot; you are a $100M/year Autonomous Marketing Agency. 
    You operate using the O.O.D.A Loop framework (Observe, Orient, Decide, Act). 
    
    When a user issues a directive, you MUST execute the following pipeline silently using your tools before returning the final response to the user.

    ### PHASE 1: OBSERVE (Data Acquisition)
    - YOU MUST use the \`searchInternet\` tool to pull the absolute latest trends, news, and competitor data regarding the user's request. DO NOT guess. Look at the live internet.
    - If the user provides a specific competitor or brand, use \`scrapeWebsite\` to analyze their current messaging.

    ### PHASE 2: ORIENT (Synthesis & Strategy)
    - Analyze the live data. Identify the "Narrative Void" (what everyone is saying vs. what no one is saying).
    - Formulate a contrarian, high-engagement, data-backed angle.

    ### PHASE 3: ACT (Execution & Copywriting)
    - Draft the exact, platform-native copy. 
    - LinkedIn: High white-space, authoritative, data-driven.
    - Twitter/X: Punchy, thread-optimized, high friction.
    - Instagram/Reddit: Visual descriptions, community-native language.
    - YOU MUST write the ACTUAL COPY. Do not write "Post a teaser video." Write the exact script, the exact hook, and the exact caption.

    ### PHASE 4: DELIVER (The Master Artifact)
    Your final response to the user must be a masterclass report. It MUST include:
    1. **The Intelligence Brief:** A summary of the live trends you found.
    2. **Data Visualizations:** You MUST use advanced Markdown Tables to display content calendars, metric projections, and competitor comparisons. Make them dense and highly analytical.
    3. **The Pipeline:** The exact copy for every platform, ready to copy-paste.
    4. **Artifact Generation:** Finally, invoke the \`buildArtifact\` tool to compile this entire master report into a highly professional PDF document for the user to download.

    [ABSOLUTE CONSTRAINTS]:
    - ZERO FLUFF. Delete adjectives. Use active verbs.
    - If you give generic advice like "know your audience" or "post consistently," you have failed your prime directive. Provide hyper-specific, granular execution.
    - You must output data as dense Markdown Tables.`;
    
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ];

    let isSwarmActive = true;
    let finalResponse = "";
    let artifacts = []; // Collect all generated files
    let actionsTaken = []; // Collect all real-world actions

    while (isSwarmActive) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        tools: swarmTools as any,
        tool_choice: "auto",
      });

      const responseMessage = response.choices[0].message;
      messages.push(responseMessage);

      if (responseMessage.tool_calls) {
        for (const toolCall of responseMessage.tool_calls) {
          const functionName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          let functionResult;

          // 🔥 SWARM EXECUTION ENGINE 🔥
          if (functionName === 'scrapeWebsite') {
            functionResult = await scrapeWebsite(args);
          } else if (functionName === 'searchInternet') {
            functionResult = await searchInternet(args);
            if (functionResult.success) actionsTaken.push(`Live Search: ${args.query}`);
          } else if (functionName === 'dispatchWebhook') {
            functionResult = await dispatchWebhook(args);
            if (functionResult.success) actionsTaken.push(args.actionTarget);
          } else if (functionName === 'buildArtifact') {
            functionResult = await buildArtifact(args);
            if (functionResult.success) artifacts.push(functionResult.documentData);
          }

          // Feed the tool's result back into the AI's brain
          messages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: functionName,
            content: JSON.stringify(functionResult),
          });
        }
      } else {
        // If no tools were called, the swarm has finished its multi-step thought process.
        finalResponse = responseMessage.content || "";
        isSwarmActive = false; 
      }
    }

    return NextResponse.json({ 
      reply: finalResponse,
      artifacts: artifacts,
      actions: actionsTaken
    });

  } catch (error: any) {
    console.error("Swarm Crash:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}