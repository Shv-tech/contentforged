// ============================================================================
// TOOL 1: THE EYES (Web Scraper & Researcher)
// ============================================================================
export async function scrapeWebsite(args: { url: string, searchIntent: string }) {
  try {
    const response = await fetch(args.url);
    const html = await response.text();
    // Quick regex to strip HTML tags for the LLM context window
    const textContent = html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').substring(0, 8000); 
    
    return { 
      success: true, 
      url: args.url, 
      extractedData: textContent, 
      message: "Website scraped successfully." 
    };
  } catch (error: any) {
    return { success: false, error: `Failed to scrape ${args.url}: ${error.message}` };
  }
}

// ============================================================================
// TOOL 2: THE HANDS (Universal Webhook / API Dispatcher)
// Connects to Make.com or Zapier. The Swarm can now send emails, post to Slack, etc.
// ============================================================================
export async function dispatchWebhook(args: { actionTarget: string, payload: any, userWebhookUrl?: string }) {
  try {
    // Uses the user's specific webhook if provided, otherwise falls back to the global environment webhook
    const webhookUrl = args.userWebhookUrl || process.env.UNIVERSAL_WEBHOOK_URL;
    
    if (!webhookUrl) {
      // Safe fallback for testing without firing actual Zapier tasks
      console.log(`[SWARM HANDS - SIMULATION] Target: ${args.actionTarget} | Payload:`, args.payload);
      return { 
        success: true, 
        action: args.actionTarget, 
        message: `Simulation: Successfully routed ${args.actionTarget} workflow. (Add Webhook URL to execute in reality).` 
      };
    }

    // Actually fire the payload to Zapier/Make.com
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: args.actionTarget, data: args.payload })
    });

    return { 
      success: true, 
      action: args.actionTarget, 
      message: `Successfully executed ${args.actionTarget} workflow via Webhook.` 
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// TOOL 3: THE FORGE (Universal Artifact Builder)
// Can build PDFs, CSVs, JSON, or Markdown files.
// ============================================================================
export async function buildArtifact(args: { title: string, content: string, extension: string }) {
  return { 
    success: true, 
    documentData: {
      title: args.title,
      content: args.content,
      extension: args.extension // 'pdf', 'csv', 'txt', 'md'
    },
    message: `Artifact compiled as .${args.extension}` 
  };
}

// ============================================================================
// TOOL 4: THE RADAR (Live Internet Search via Tavily)
// ============================================================================
export async function searchInternet(args: { query: string, timeRange: string }) {
  try {
    const apiKey = process.env.TAVILY_API_KEY;
    
    if (!apiKey) {
      console.warn("[SWARM RADAR] No TAVILY_API_KEY found. Running in simulation mode.");
      return { 
        success: true, 
        query: args.query, 
        results: `[Simulation Mode]: Live search results for "${args.query}" would appear here. Add TAVILY_API_KEY to your .env file to enable real-time web intelligence.` 
      };
    }

    // Tavily is optimized specifically for LLM Agents to get clean, precise answers
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: args.query,
        search_depth: "advanced",
        include_answer: true,
        include_raw_content: false,
        max_results: 5,
        // time_range: args.timeRange // Uncomment if using specific Tavily plan features
      })
    });

    const data = await response.json();
    return { success: true, query: args.query, results: data };
  } catch (error: any) {
    return { success: false, error: `Failed to search the internet: ${error.message}` };
  }
}

// ============================================================================
// THE OPENAI TOOL SCHEMA MAP
// ============================================================================
// lib/swarm-tools.ts

export const swarmTools = [
  {
    name: "searchInternet",
    description: "Searches the live internet for real-time data, current trends, news, and competitor intelligence. ALWAYS use this in the Observe phase before formulating a strategy.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The exact search query to run on the internet." },
        timeRange: { type: "string", enum: ["last_24_hours", "last_week", "last_month", "all_time"] }
      },
      required: ["query", "timeRange"]
    }
  },
  {
    name: "scrapeWebsite",
    description: "Use this to browse the live internet, read competitor websites, or gather real-time data from a specific URL.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        searchIntent: { type: "string", description: "What specific information are you looking for?" }
      },
      required: ["url", "searchIntent"]
    }
  },
  {
    name: "dispatchWebhook",
    description: "Use this to take action in the real world (e.g., send emails, schedule calendar events, post social media, update CRM).",
    input_schema: {
      type: "object",
      properties: {
        actionTarget: { type: "string", description: "What system are you targeting? (e.g., 'gmail', 'google_calendar', 'slack', 'twitter')" },
        payload: { type: "object", description: "A JSON object containing all the data needed for the action." }
      },
      required: ["actionTarget", "payload"]
    }
  },
  {
    name: "buildArtifact",
    description: "Use this to generate downloadable files for the user. MUST use this to deliver the final O.O.D.A loop report.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string", description: "The raw text/data for the file. Use commas for CSVs, markdown for PDFs." },
        extension: { type: "string", enum: ["pdf", "csv", "md", "txt"] }
      },
      required: ["title", "content", "extension"]
    }
  }
];