export type Platform = "linkedin" | "instagram" | "x" | "facebook";

export interface FaqItem {
  q: string;
  a: string;
}

export interface HowToStep {
  title: string;
  body: string;
}

export interface ToolConfig {
  slug: string;
  platform: Platform;
  name: string;
  h1: string;
  subhead: string;
  inputLabel: string;
  inputPlaceholder: string;
  showEmojiToggle: boolean;
  showToneSelect: boolean;
  maxInputWords: number;
  maxOutputWords: number;
  systemPrompt: string;
  howToUse: HowToStep[];
  faq: FaqItem[];
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  relatedSlugs: string[];
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  x: "X (Twitter)",
  facebook: "Facebook",
};

export const TOOLS: ToolConfig[] = [
  // ── LINKEDIN (6) ──
  {
    slug: "linkedin-post-generator",
    platform: "linkedin",
    name: "LinkedIn Post Generator",
    h1: "LinkedIn Post Generator",
    subhead: "Turn a rough idea into a structured LinkedIn post in seconds. Free, no login, no credit card.",
    inputLabel: "What's your post about?",
    inputPlaceholder: "e.g. how I grew from 0 to 5,000 followers by posting daily for 3 months",
    showEmojiToggle: true,
    showToneSelect: true,
    maxInputWords: 40,
    maxOutputWords: 180,
    systemPrompt: `You write LinkedIn posts. Structure: a scroll-stopping hook line (max 12 words), 2-4 short paragraphs with line breaks between them (LinkedIn's format, not dense blocks), and a closing line that invites engagement (a question or a clear takeaway). No hashtags in the body. Match the requested tone. Keep total output under {maxOutputWords} words. Return only the post text, nothing else.`,
    howToUse: [
      { title: "Describe your topic", body: "Don't just say 'marketing post' — give it something specific, like a result, a mistake you made, or a lesson learned." },
      { title: "Generate", body: "The generator writes a full post with a hook, body, and closing line in LinkedIn's native short-paragraph format." },
      { title: "Personalize and post", body: "Swap in your own numbers, names, and voice before posting. Treat the output as a first draft." }
    ],
    faq: [
      { q: "Is this LinkedIn post generator actually free?", a: "Yes. You can generate posts without an account." },
      { q: "How long should a LinkedIn post be?", a: "1,300–2,000 characters tends to perform best — long enough to deliver value, short enough that people don't hit 'see more' and bounce." },
      { q: "Should I add hashtags to my LinkedIn post?", a: "3-5 relevant hashtags placed at the end of the post is the norm." },
      { q: "How often should I post on LinkedIn?", a: "3-5 times a week is a common sweet spot for growth." }
    ],
    metaTitle: "Free LinkedIn Post Generator (AI) — No Login Required",
    metaDescription: "Generate a structured LinkedIn post from any topic in seconds. Free AI LinkedIn post writer, no signup needed.",
    keywords: ["linkedin post generator", "ai linkedin post writer"],
    relatedSlugs: ["linkedin-hook-generator", "linkedin-headline-generator", "linkedin-hashtag-generator", "linkedin-carousel-generator", "linkedin-bio-generator"]
  },
  {
    slug: "linkedin-hook-generator",
    platform: "linkedin",
    name: "LinkedIn Hook Generator",
    h1: "LinkedIn Hook Generator",
    subhead: "Stop the scroll. Generate irresistible first lines for your LinkedIn posts that force people to click 'see more'.",
    inputLabel: "What is the main takeaway of your post?",
    inputPlaceholder: "e.g., You don't need a massive budget to start marketing, just consistency.",
    showEmojiToggle: false,
    showToneSelect: true,
    maxInputWords: 40,
    maxOutputWords: 80,
    systemPrompt: `You write viral LinkedIn hooks. Structure: Generate 3 different, highly engaging opening hooks for a LinkedIn post based on the user's topic. A hook must be 1-2 short sentences max. Create open loops, state bold claims, or ask compelling questions. Keep total output under {maxOutputWords} words. Return only the 3 options separated by blank lines.`,
    howToUse: [
      { title: "Enter your core point", body: "Tell the generator the final lesson or story of your post." },
      { title: "Generate 3 options", body: "The AI uses psychology and open loops to write three distinct scroll-stopping hooks." },
      { title: "Pick the winner", body: "Paste your favorite hook at the very top of your draft, leaving a blank line before the rest of your content." }
    ],
    faq: [
      { q: "Why is a LinkedIn hook so important?", a: "LinkedIn cuts off your post after the first 2-3 lines. If those lines don't create curiosity, users will scroll past without reading your content or triggering the algorithm." },
      { q: "What makes a good hook?", a: "The best hooks challenge a common belief, share a specific vulnerable result, or promise immense value. They never give away the punchline immediately." }
    ],
    metaTitle: "Free LinkedIn Hook Generator (AI) — Get More Views",
    metaDescription: "Generate viral LinkedIn hooks in seconds. Free AI tool to write scroll-stopping first lines that increase your post views and engagement.",
    keywords: ["linkedin hook generator", "linkedin post hook", "first line linkedin"],
    relatedSlugs: ["linkedin-post-generator", "linkedin-headline-generator"]
  },
  {
    slug: "linkedin-headline-generator",
    platform: "linkedin",
    name: "LinkedIn Headline Generator",
    h1: "LinkedIn Headline Generator",
    subhead: "Turn profile views into inbound leads with a LinkedIn headline that perfectly pitches your value.",
    inputLabel: "What do you do and who do you help?",
    inputPlaceholder: "e.g., I help B2B SaaS startups scale their organic traffic using SEO.",
    showEmojiToggle: true,
    showToneSelect: true,
    maxInputWords: 30,
    maxOutputWords: 100,
    systemPrompt: `You write high-converting LinkedIn headlines. Generate 3 different headline options based on the user's input. Use the format: [Title/Role] | [I help X achieve Y] | [Authority/Credibility]. Keep each under 220 characters. Return only the 3 options.`,
    howToUse: [
      { title: "Define your value", body: "Input your job title, target audience, and the main result you deliver." },
      { title: "Generate options", body: "The AI crafts optimized headlines designed to rank in LinkedIn search and convert viewers." },
      { title: "Update your profile", body: "Copy the best option directly into your LinkedIn profile settings." }
    ],
    faq: [
      { q: "How long can a LinkedIn headline be?", a: "LinkedIn allows up to 220 characters for your headline. You should use this space to clearly state your value proposition, not just your job title." },
      { q: "Should I use emojis in my headline?", a: "Sparingly. A single emoji (like a rocket, chart, or pin) can help separate sections and draw the eye, but too many look unprofessional." }
    ],
    metaTitle: "Free LinkedIn Headline Generator (AI) — Optimize Your Profile",
    metaDescription: "Write a high-converting LinkedIn headline in seconds. Free AI generator to attract recruiters, clients, and inbound leads to your profile.",
    keywords: ["linkedin headline generator", "linkedin profile optimizer", "ai linkedin headline"],
    relatedSlugs: ["linkedin-bio-generator", "linkedin-post-generator"]
  },
  {
    slug: "linkedin-hashtag-generator",
    platform: "linkedin",
    name: "LinkedIn Hashtag Generator",
    h1: "LinkedIn Hashtag Generator",
    subhead: "Find the perfect mix of broad and niche hashtags to maximize your LinkedIn post reach.",
    inputLabel: "What industry or topic are you posting about?",
    inputPlaceholder: "e.g., Artificial intelligence in healthcare.",
    showEmojiToggle: false,
    showToneSelect: false,
    maxInputWords: 20,
    maxOutputWords: 50,
    systemPrompt: `You are an expert in LinkedIn SEO. Generate exactly 5 highly relevant LinkedIn hashtags based on the user's topic. Include 2 broad/popular tags and 3 specific/niche tags. Output only the hashtags separated by spaces. Do not include any other text.`,
    howToUse: [
      { title: "Input your topic", body: "Enter the main theme of your post or your industry." },
      { title: "Get optimized tags", body: "The AI generates a mix of high-volume and niche hashtags to balance reach and targeting." },
      { title: "Paste at the bottom", body: "Add these 3-5 hashtags to the very bottom of your LinkedIn post." }
    ],
    faq: [
      { q: "How many hashtags should I use on LinkedIn?", a: "LinkedIn's algorithm favors 3 to 5 highly relevant hashtags. Using more than 5 can actually flag your post as spam and decrease your reach." },
      { q: "Where should I put hashtags on a LinkedIn post?", a: "Always place them at the very bottom of your post, leaving a blank line after your final sentence or call to action." }
    ],
    metaTitle: "Free LinkedIn Hashtag Generator — Boost Post Reach",
    metaDescription: "Generate the best LinkedIn hashtags for your posts. Free AI tool to find the perfect mix of niche and broad tags for maximum reach.",
    keywords: ["linkedin hashtag generator", "best linkedin hashtags", "linkedin tags"],
    relatedSlugs: ["linkedin-post-generator", "linkedin-carousel-generator"]
  },
  {
    slug: "linkedin-carousel-generator",
    platform: "linkedin",
    name: "LinkedIn Carousel Generator",
    h1: "LinkedIn Carousel Idea & Text Generator",
    subhead: "Plan high-engaging PDF carousels in seconds. Get slide-by-slide text ready for Canva.",
    inputLabel: "What is your carousel teaching?",
    inputPlaceholder: "e.g., 5 steps to optimize a landing page for conversions.",
    showEmojiToggle: false,
    showToneSelect: true,
    maxInputWords: 50,
    maxOutputWords: 300,
    systemPrompt: `You write text for LinkedIn PDF carousels. The user will provide a topic. Generate text for 5-7 slides. Structure: 
    Slide 1: Title (Hook).
    Slides 2-5: One concise tip per slide.
    Final Slide: CTA (Call to action).
    Format as 'Slide 1: [Text]', 'Slide 2: [Text]', etc. Keep text on each slide extremely brief (under 25 words per slide). Return only the slide text.`,
    howToUse: [
      { title: "Share your framework", body: "Input a listicle idea, a step-by-step process, or a core concept." },
      { title: "Get slide text", body: "The AI breaks your idea down into bite-sized, punchy copy designed for individual slides." },
      { title: "Design and export", body: "Paste the text into Canva, design your slides, export as a PDF, and upload to LinkedIn as a document." }
    ],
    faq: [
      { q: "Why use carousels on LinkedIn?", a: "Carousels (uploaded as PDFs) have the highest engagement rate of any format on LinkedIn because scrolling through slides counts as active engagement to the algorithm." },
      { q: "How much text should be on a carousel slide?", a: "Less is more. Aim for 10-25 words per slide. If it looks like a paragraph, users will swipe past it." }
    ],
    metaTitle: "Free LinkedIn Carousel Generator (AI) — Slide Text Writer",
    metaDescription: "Write text for LinkedIn carousels instantly. Free AI tool generates slide-by-slide copy for high-engaging PDF document posts.",
    keywords: ["linkedin carousel generator", "linkedin document post", "carousel slide text"],
    relatedSlugs: ["linkedin-post-generator", "linkedin-hook-generator"]
  },
  {
    slug: "linkedin-bio-generator",
    platform: "linkedin",
    name: "LinkedIn Bio/About Generator",
    h1: "LinkedIn Bio (About Section) Generator",
    subhead: "Write a compelling LinkedIn About section that tells your story and sells your expertise.",
    inputLabel: "Briefly describe your career, current role, and goals.",
    inputPlaceholder: "e.g., 10 years in B2B sales, currently VP of Sales at TechCorp, passionate about building high-performing remote teams.",
    showEmojiToggle: false,
    showToneSelect: true,
    maxInputWords: 100,
    maxOutputWords: 250,
    systemPrompt: `You write professional LinkedIn 'About' sections. Write a compelling 3-4 paragraph biography based on the user's input. First paragraph: Hook and current mission. Middle: Key achievements and expertise. End: Call to action or what they are open to. Match the requested tone. Keep total output under {maxOutputWords} words. Return only the bio text.`,
    howToUse: [
      { title: "Dump your resume details", body: "Provide a quick summary of your years of experience, current role, and biggest wins." },
      { title: "Generate the bio", body: "The AI weaves your raw facts into a cohesive, narrative-driven 'About' section." },
      { title: "Add to profile", body: "Copy the output, review it for personal accuracy, and paste it into the About section of your profile." }
    ],
    faq: [
      { q: "Should my LinkedIn About section be in first or third person?", a: "Always use the first person ('I'). Writing in the third person ('John is a professional...') feels distant and outdated on a social networking platform." },
      { q: "What should I include at the end of my bio?", a: "Always include a Call To Action (CTA). Tell people why they should connect with you, what opportunities you are open to, or list your email address for business inquiries." }
    ],
    metaTitle: "Free LinkedIn Bio Generator — AI About Section Writer",
    metaDescription: "Write a professional LinkedIn About section in seconds. Free AI bio generator to highlight your career achievements and attract opportunities.",
    keywords: ["linkedin bio generator", "linkedin about section writer", "professional bio generator"],
    relatedSlugs: ["linkedin-headline-generator", "linkedin-post-generator"]
  },

  // ── INSTAGRAM (6) ──
  {
    slug: "instagram-caption-generator",
    platform: "instagram",
    name: "Instagram Caption Generator",
    h1: "Instagram Caption Generator",
    subhead: "Turn a basic photo into a highly engaging Instagram post. AI-powered captions with built-in hooks and formatting.",
    inputLabel: "What is your photo or reel about?",
    inputPlaceholder: "e.g., A behind-the-scenes look at packing orders for my small business, feeling grateful.",
    showEmojiToggle: true,
    showToneSelect: true,
    maxInputWords: 40,
    maxOutputWords: 150,
    systemPrompt: `You write highly engaging Instagram captions. Structure: a catchy first line that acts as a hook (must be under 40 characters so it shows before the 'more' button), a short storytelling body with line breaks, and a clear Call To Action (e.g., 'Save this', 'Comment below', 'Link in bio'). If emojis are allowed, use them strategically as bullet points or emotional accents, but don't overdo it. Keep total output under {maxOutputWords} words. Return only the caption text.`,
    howToUse: [
      { title: "Describe your visual", body: "Tell the generator what is actually in the photo or video, plus the specific vibe or message you want to convey." },
      { title: "Generate the caption", body: "The AI will craft a caption formatted perfectly for Instagram, keeping the most important hook before the 'read more' cutoff." },
      { title: "Add your hashtags and post", body: "Paste the caption into Instagram, add a few niche-specific hashtags in the first comment or at the bottom, and hit publish." }
    ],
    faq: [
      { q: "How long should an Instagram caption be?", a: "While you can use up to 2,200 characters, the most critical part is the first 125 characters—that is what users see before having to tap 'more'." },
      { q: "Does this work for Reels too?", a: "Yes. Reel captions should generally be shorter and heavily focused on driving users to the link in your bio." }
    ],
    metaTitle: "Free Instagram Caption Generator (AI) — High Engagement",
    metaDescription: "Generate engaging Instagram captions from any topic in seconds. Free AI caption writer optimized for the algorithm.",
    keywords: ["instagram caption generator", "ai caption writer", "ig caption maker"],
    relatedSlugs: ["instagram-hashtag-generator", "instagram-reel-hook-generator", "instagram-bio-generator"]
  },
  {
    slug: "instagram-bio-generator",
    platform: "instagram",
    name: "Instagram Bio Generator",
    h1: "Instagram Bio Generator",
    subhead: "Create a punchy, optimized Instagram bio that clearly tells visitors who you are and why they should follow.",
    inputLabel: "What is your account about?",
    inputPlaceholder: "e.g., Travel photographer based in NYC, sharing tips for shooting on iPhone.",
    showEmojiToggle: true,
    showToneSelect: true,
    maxInputWords: 30,
    maxOutputWords: 80,
    systemPrompt: `You write Instagram bios. Generate 3 different bio options based on the user's input. Each option must be strictly under 150 characters. Format with line breaks. Include emojis if permitted. The last line should always be a call-to-action pointing down (e.g., '👇 Get my presets'). Return only the 3 options separated by blank lines.`,
    howToUse: [
      { title: "State your niche", body: "Tell the generator exactly what content you post and what value you provide." },
      { title: "Generate bio options", body: "The AI crafts 3 distinct bios perfectly sized for the 150-character limit." },
      { title: "Paste and add link", body: "Copy your favorite option into Instagram, and make sure to add your actual link below the CTA." }
    ],
    faq: [
      { q: "How long can an Instagram bio be?", a: "You have a strict limit of 150 characters. Every word needs to earn its place." },
      { q: "What is the most important part of an IG bio?", a: "Clarity. Visitors decide to follow within 3 seconds. Your bio must immediately answer: 'What's in it for me if I follow this person?'" }
    ],
    metaTitle: "Free Instagram Bio Generator (AI) — Optimize Your Profile",
    metaDescription: "Create a catchy, optimized Instagram bio in seconds. Free AI tool generates 150-character bios with emojis and CTAs to increase followers.",
    keywords: ["instagram bio generator", "ig bio ideas", "ai instagram bio"],
    relatedSlugs: ["instagram-caption-generator", "instagram-carousel-idea-generator"]
  },
  {
    slug: "instagram-hashtag-generator",
    platform: "instagram",
    name: "Instagram Hashtag Generator",
    h1: "Instagram Hashtag Generator",
    subhead: "Stop guessing. Generate a balanced stack of relevant Instagram hashtags to boost your organic reach.",
    inputLabel: "Describe your photo, reel, or niche.",
    inputPlaceholder: "e.g., Minimalist home office desk setup with mechanical keyboard.",
    showEmojiToggle: false,
    showToneSelect: false,
    maxInputWords: 20,
    maxOutputWords: 100,
    systemPrompt: `You are an Instagram growth expert. Generate a block of exactly 15 highly relevant hashtags based on the user's input. Mix 5 broad tags, 5 niche tags, and 5 hyper-specific tags. Output ONLY the hashtags separated by spaces. No introductory text.`,
    howToUse: [
      { title: "Describe your post", body: "Be specific about what is visually in the content, as well as the overarching industry." },
      { title: "Generate your stack", body: "The AI generates a balanced mix of 15 hashtags designed to rank on the Explore page." },
      { title: "Paste into Instagram", body: "Copy the block and paste it at the bottom of your caption or in the first comment." }
    ],
    faq: [
      { q: "How many hashtags should I use on Instagram?", a: "While Instagram allows up to 30, the current algorithm favors 3 to 15 highly relevant hashtags. Quality and relevance matter far more than quantity." },
      { q: "Caption or first comment?", a: "Both work equally well for reach. Putting them in the caption is slightly better for SEO, while putting them in the first comment keeps your caption looking cleaner." }
    ],
    metaTitle: "Free Instagram Hashtag Generator — Boost Organic Reach",
    metaDescription: "Generate the best Instagram hashtags for your posts. Free AI tool finds the perfect mix of niche and broad tags for Explore page ranking.",
    keywords: ["instagram hashtag generator", "ig tags", "best instagram hashtags"],
    relatedSlugs: ["instagram-caption-generator", "instagram-reel-hook-generator"]
  },
  {
    slug: "instagram-reel-hook-generator",
    platform: "instagram",
    name: "Instagram Reel Hook Generator",
    h1: "Instagram Reel Hook Generator",
    subhead: "Generate viral on-screen text hooks that stop the scroll in the first 3 seconds of your Reel.",
    inputLabel: "What is your Reel teaching or showing?",
    inputPlaceholder: "e.g., A tutorial on how to clean white sneakers so they look brand new.",
    showEmojiToggle: false,
    showToneSelect: true,
    maxInputWords: 30,
    maxOutputWords: 100,
    systemPrompt: `You write viral text hooks for Instagram Reels. Based on the user's topic, generate 5 short, punchy on-screen text hooks. Each hook must create intense curiosity or state a bold claim. Keep them under 8 words each so they are easy to read quickly. Return only the 5 hooks formatted as a numbered list.`,
    howToUse: [
      { title: "Enter your video topic", body: "Briefly explain the payoff or tutorial in your video." },
      { title: "Generate 5 options", body: "The AI writes 5 highly engaging short phrases designed to be read in under 2 seconds." },
      { title: "Add as on-screen text", body: "Pick the best hook and add it as text natively inside the Instagram Reels editor so it appears right when the video starts." }
    ],
    faq: [
      { q: "Why do I need a text hook on a Reel?", a: "Most users scroll through Reels incredibly fast. If they don't immediately know what the video is about within 3 seconds, they will swipe away. Text hooks instantly grab attention." },
      { q: "Where should I place the text on the screen?", a: "Keep the text in the middle third of the screen. If it's too high, it gets blocked by the progress bar. Too low, and the caption covers it." }
    ],
    metaTitle: "Free Instagram Reel Hook Generator (AI) — Go Viral",
    metaDescription: "Generate scroll-stopping text hooks for your Instagram Reels. Free AI tool to increase video retention and views in the first 3 seconds.",
    keywords: ["instagram reel hook generator", "ig reels text", "viral reel ideas"],
    relatedSlugs: ["instagram-caption-generator", "instagram-hashtag-generator"]
  },
  {
    slug: "instagram-carousel-idea-generator",
    platform: "instagram",
    name: "Instagram Carousel Idea Generator",
    h1: "Instagram Carousel Idea Generator",
    subhead: "Plan high-value, swipeable Instagram carousels that drive saves and shares.",
    inputLabel: "What topic do you want to break down?",
    inputPlaceholder: "e.g., 5 red flags to look for when touring a new apartment.",
    showEmojiToggle: false,
    showToneSelect: true,
    maxInputWords: 40,
    maxOutputWords: 300,
    systemPrompt: `You plan educational Instagram carousels. Break the user's topic into a 5-7 slide carousel structure. 
    Provide the exact text for each slide. 
    Slide 1: A bold, large-text Title.
    Slides 2-5: The core value (keep text minimal, max 2 sentences per slide).
    Final Slide: Call to Action (e.g., 'Save this for later'). 
    Return only the slide breakdown text.`,
    howToUse: [
      { title: "Input your core lesson", body: "Give the AI a listicle, framework, or myth you want to bust." },
      { title: "Get slide text", body: "The AI will generate short, punchy text perfectly sized for Instagram's square or 4:5 aspect ratio." },
      { title: "Design your graphics", body: "Take the text into a tool like Canva to design your carousel, then export and post to Instagram." }
    ],
    faq: [
      { q: "Why do carousels perform so well on Instagram?", a: "Carousels keep users on your post longer (time-on-screen). Additionally, if a user scrolls past your carousel without interacting, Instagram will often show it to them again later starting on the second slide." },
      { q: "What is the best dimension for an IG carousel?", a: "Use 1080 x 1350 pixels (4:5 ratio). It takes up more vertical screen space than a square, commanding more attention in the feed." }
    ],
    metaTitle: "Free Instagram Carousel Idea Generator — Plan Swipeable Posts",
    metaDescription: "Plan educational Instagram carousels instantly. Free AI tool generates slide-by-slide copy designed for saves and shares.",
    keywords: ["instagram carousel generator", "ig carousel ideas", "carousel post planner"],
    relatedSlugs: ["instagram-caption-generator", "instagram-bio-generator"]
  },
  {
    slug: "instagram-comment-reply-generator",
    platform: "instagram",
    name: "Instagram Comment Reply Generator",
    h1: "Instagram Comment Reply Generator",
    subhead: "Generate thoughtful, engaging replies to your Instagram comments to boost algorithm interaction.",
    inputLabel: "Paste the comment you want to reply to.",
    inputPlaceholder: "e.g., 'I love this setup! Where did you get that lamp in the background?'",
    showEmojiToggle: true,
    showToneSelect: true,
    maxInputWords: 60,
    maxOutputWords: 80,
    systemPrompt: `You write replies to Instagram comments. The user will provide a comment they received. Generate a friendly, engaging reply that answers any questions and ideally asks a follow-up question to keep the conversation going. Match the requested tone. Keep it under {maxOutputWords} words. Return only the reply text.`,
    howToUse: [
      { title: "Paste the comment", body: "Copy the exact comment your follower left on your post." },
      { title: "Generate a reply", body: "The AI crafts a warm, context-aware response that encourages further conversation." },
      { title: "Reply and engage", body: "Paste the reply back into Instagram to build community and signal high engagement to the algorithm." }
    ],
    faq: [
      { q: "Does replying to comments help the Instagram algorithm?", a: "Absolutely. Replying to comments adds total comment volume to the post and signals to Instagram that you are actively fostering a community, which pushes your post to more feeds." },
      { q: "Should I reply to every comment?", a: "In the first 24 hours of posting, try to reply to as many as possible to build momentum. A simple emoji reply is okay, but a text reply that asks a follow-up question is best." }
    ],
    metaTitle: "Free Instagram Comment Reply Generator (AI)",
    metaDescription: "Generate engaging replies to Instagram comments instantly. Free AI tool to boost your engagement rate and build community.",
    keywords: ["instagram comment reply generator", "ig comment writer", "auto reply instagram"],
    relatedSlugs: ["instagram-caption-generator", "instagram-hashtag-generator"]
  },

  // ── X / TWITTER (6) ──
  {
    slug: "x-thread-generator",
    platform: "x",
    name: "X Thread Generator",
    h1: "X (Twitter) Thread Generator",
    subhead: "Transform a single idea into a viral, multi-part X thread. Perfectly formatted and ready to post.",
    inputLabel: "What is the core idea for your thread?",
    inputPlaceholder: "e.g., 5 things I learned about marketing after spending $10k on ads and failing.",
    showEmojiToggle: true,
    showToneSelect: true,
    maxInputWords: 50,
    maxOutputWords: 350,
    systemPrompt: `You write viral X (Twitter) threads. The user will provide a topic. Break the output into 4 to 6 separate tweets. Number them like this: [1/5], [2/5], etc. Tweet 1 must be a massive hook that creates an open loop and makes people want to read more. Tweets 2-4 should deliver high-value, concise points. The final Tweet must summarize the takeaway and include a Call To Action. Keep every individual tweet under 280 characters. Match the requested tone. Return only the thread text.`,
    howToUse: [
      { title: "Share your core thesis", body: "Threads work best when they break down a complex idea, a personal story, or a step-by-step guide. Give the AI the main premise." },
      { title: "Generate the thread", body: "The AI will break your idea down into 4-6 individually formatted tweets, complete with a strong opening hook and a closing CTA." },
      { title: "Schedule or publish", body: "Copy the output directly into X's native thread composer, or paste it into your favorite social media scheduling tool." }
    ],
    faq: [
      { q: "Why use threads instead of single posts on X?", a: "Threads drastically increase 'time on screen', which the X algorithm heavily rewards. They also allow you to tell deeper stories and provide more value." },
      { q: "How many posts should be in a thread?", a: "The sweet spot is usually between 4 and 8 posts. Anything shorter doesn't build enough momentum, and anything longer risks user drop-off." }
    ],
    metaTitle: "Free X (Twitter) Thread Generator — AI Thread Maker",
    metaDescription: "Turn any idea into a viral X thread instantly. Free AI Twitter thread generator with built-in hooks, numbering, and character limits.",
    keywords: ["x thread generator", "twitter thread maker", "ai twitter thread writer"],
    relatedSlugs: ["tweet-generator", "tweet-hook-generator", "x-bio-generator"]
  },
  {
    slug: "tweet-generator",
    platform: "x",
    name: "Tweet Generator",
    h1: "X (Twitter) Post Generator",
    subhead: "Draft engaging, highly shareable X posts in seconds without hitting the character limit.",
    inputLabel: "What do you want to tweet about?",
    inputPlaceholder: "e.g., The difference between working hard and working smart in software development.",
    showEmojiToggle: true,
    showToneSelect: true,
    maxInputWords: 40,
    maxOutputWords: 60,
    systemPrompt: `You write engaging Tweets for X. Generate a single, highly readable tweet based on the user's input. It must be strictly under 280 characters. Use formatting (like line breaks or a list if applicable) to make it skimmable. No hashtags unless strictly requested. Return only the tweet text.`,
    howToUse: [
      { title: "Enter your thought", body: "Drop in a random shower thought, an opinion, or a quick tip." },
      { title: "Generate the tweet", body: "The AI formats your thought perfectly for the timeline, staying safely under the 280-character limit." },
      { title: "Post to X", body: "Copy the result and hit post. Use it as a standalone tweet or the start of a conversation." }
    ],
    faq: [
      { q: "What is the character limit on X?", a: "Standard accounts have a 280-character limit. Premium subscribers can post much longer text, but short, punchy tweets still tend to perform best for engagement." },
      { q: "Should I include links in my tweets?", a: "The X algorithm generally suppresses posts with external links to keep users on the platform. It's often better to post the link in a reply to your main tweet." }
    ],
    metaTitle: "Free Tweet Generator (AI) — Write Better X Posts",
    metaDescription: "Write engaging Tweets in seconds. Free AI X post generator formats your ideas perfectly within the 280-character limit.",
    keywords: ["tweet generator", "x post generator", "ai tweet writer"],
    relatedSlugs: ["x-thread-generator", "tweet-hook-generator"]
  },
  {
    slug: "x-bio-generator",
    platform: "x",
    name: "X Bio Generator",
    h1: "X (Twitter) Bio Generator",
    subhead: "Create a sharp, memorable X bio that converts profile visitors into followers.",
    inputLabel: "What do you tweet about and what's your credibility?",
    inputPlaceholder: "e.g., I build AI startups, currently bootstrapping my second SaaS, tweeting about code and MRR.",
    showEmojiToggle: true,
    showToneSelect: true,
    maxInputWords: 40,
    maxOutputWords: 50,
    systemPrompt: `You write X (Twitter) bios. Generate 3 different bio options based on the user's input. Each option must be strictly under 160 characters. Format them to be punchy and readable. Include a clear value proposition for the follower. Return only the 3 options separated by blank lines.`,
    howToUse: [
      { title: "Explain your niche", body: "Tell the generator what you do and what followers can expect from your timeline." },
      { title: "Generate bio options", body: "The AI crafts 3 distinct bios perfectly sized for the 160-character profile limit." },
      { title: "Update your profile", body: "Pick the punchiest option, paste it into your X profile, and add a link to your website below it." }
    ],
    faq: [
      { q: "How long can a bio be on X?", a: "You are strictly limited to 160 characters. It forces you to be concise." },
      { q: "What should I put in my X bio?", a: "A good framework is: [Credibility/Job] + [What I tweet about] + [Link CTA]. People follow you for what you will provide them in the future, not just what you did in the past." }
    ],
    metaTitle: "Free X (Twitter) Bio Generator — Optimize Your Profile",
    metaDescription: "Create a catchy, optimized X bio in seconds. Free AI tool generates 160-character bios designed to increase follower conversion rates.",
    keywords: ["twitter bio generator", "x bio ideas", "ai twitter profile"],
    relatedSlugs: ["tweet-generator", "x-thread-generator"]
  },
  {
    slug: "x-hashtag-generator",
    platform: "x",
    name: "X Hashtag Generator",
    h1: "X (Twitter) Hashtag Generator",
    subhead: "Find the relevant hashtags to join trending conversations on the X timeline.",
    inputLabel: "What is your tweet about?",
    inputPlaceholder: "e.g., JavaScript web development and Next.js.",
    showEmojiToggle: false,
    showToneSelect: false,
    maxInputWords: 20,
    maxOutputWords: 50,
    systemPrompt: `You are an X (Twitter) optimization expert. Generate exactly 3 highly relevant hashtags based on the user's topic. Output ONLY the hashtags separated by spaces. Do not include any other text.`,
    howToUse: [
      { title: "Input your topic", body: "Enter the main theme of your post." },
      { title: "Get targeted tags", body: "The AI generates 3 highly relevant hashtags that fit natively into X's ecosystem." },
      { title: "Use sparingly", body: "Paste 1-3 hashtags at the end of your tweet to join broader conversations." }
    ],
    faq: [
      { q: "Do hashtags still work on X?", a: "Yes, but differently than on Instagram. On X, hashtags are best used to join live, trending conversations (like events, conferences, or tv shows) rather than for evergreen SEO." },
      { q: "How many hashtags should I use in a tweet?", a: "1 or 2 is ideal. Using 3 or more hashtags makes the tweet look spammy and drastically decreases engagement." }
    ],
    metaTitle: "Free X (Twitter) Hashtag Generator",
    metaDescription: "Generate relevant X hashtags for your tweets. Free AI tool finds the best tags to help you join trending conversations without looking spammy.",
    keywords: ["twitter hashtag generator", "x tags", "trending hashtags"],
    relatedSlugs: ["tweet-generator", "x-thread-generator"]
  },
  {
    slug: "tweet-hook-generator",
    platform: "x",
    name: "Tweet Hook Generator",
    h1: "Tweet Hook Generator",
    subhead: "Write viral first lines for your X threads that force people to stop scrolling and click.",
    inputLabel: "What is the payoff of your thread?",
    inputPlaceholder: "e.g., How to set up a cold email system that gets a 10% reply rate.",
    showEmojiToggle: false,
    showToneSelect: true,
    maxInputWords: 40,
    maxOutputWords: 100,
    systemPrompt: `You write viral hooks for X (Twitter) threads. Generate 3 different opening tweets based on the user's topic. Each hook must create intense curiosity, leverage numbers/results, or challenge a common belief. Keep each under 280 characters. Return only the 3 options separated by blank lines.`,
    howToUse: [
      { title: "Define the value", body: "Tell the AI exactly what the reader will learn or gain by reading your thread." },
      { title: "Generate hooks", body: "The AI uses proven viral frameworks to write 3 compelling opening tweets." },
      { title: "Start your thread", body: "Use the winning hook as tweet 1/x, and write the rest of your thread below it." }
    ],
    faq: [
      { q: "Why is the first tweet of a thread so important?", a: "The first tweet acts as the headline. If it doesn't get likes and retweets, the X algorithm will never show the rest of the thread to anyone." },
      { q: "What makes a viral thread hook?", a: "Authority (why you are qualified to speak), Curiosity (an open loop), and Formatting (plenty of white space to make it readable)." }
    ],
    metaTitle: "Free Tweet Hook Generator (AI) — Viral Thread Openers",
    metaDescription: "Write viral first lines for your X threads. Free AI tool generates scroll-stopping hooks that dramatically increase thread engagement.",
    keywords: ["tweet hook generator", "twitter thread hook", "viral tweet opener"],
    relatedSlugs: ["x-thread-generator", "tweet-generator"]
  },
  {
    slug: "tweet-reply-generator",
    platform: "x",
    name: "Tweet Reply Generator",
    h1: "Tweet Reply Generator",
    subhead: "Write witty, insightful, or engaging replies to large accounts to siphon their reach.",
    inputLabel: "Paste the tweet you are replying to.",
    inputPlaceholder: "e.g., 'What is the most overrated programming language in 2026?'",
    showEmojiToggle: true,
    showToneSelect: true,
    maxInputWords: 100,
    maxOutputWords: 80,
    systemPrompt: `You write engaging replies for X (Twitter). The user will provide a tweet. Generate a clever, insightful, or contrarian reply based on the requested tone. It must be under 280 characters and designed to get likes from other people reading the thread. Return only the reply text.`,
    howToUse: [
      { title: "Paste the original tweet", body: "Copy the text of the viral tweet you want to interact with." },
      { title: "Generate a reply", body: "The AI crafts a contextual response designed to stand out in a crowded comment section." },
      { title: "Post and siphon reach", body: "Reply early to viral tweets. If your reply gets enough likes, it moves to the top of the thread, driving traffic to your own profile." }
    ],
    faq: [
      { q: "Is replying to large accounts a good growth strategy?", a: "Yes, 'reply-guying' (when done with high-value or highly entertaining responses) is one of the fastest ways to gain visibility on X when you have a small following." },
      { q: "How fast do I need to reply?", a: "Speed is critical. Replying within the first 10 minutes of a large account posting gives your reply the best chance of being seen and pushed to the top." }
    ],
    metaTitle: "Free Tweet Reply Generator (AI) — Increase X Engagement",
    metaDescription: "Write witty, insightful replies to large X accounts instantly. Free AI tool to help you stand out in the replies and siphon viral reach.",
    keywords: ["tweet reply generator", "twitter auto reply", "x reply writer"],
    relatedSlugs: ["tweet-generator", "x-bio-generator"]
  },

  // ── FACEBOOK (6) ──
  {
    slug: "facebook-ad-copy-generator",
    platform: "facebook",
    name: "Facebook Ad Copy Generator",
    h1: "Facebook Ad Copy Generator",
    subhead: "Generate high-converting Facebook ad copy using proven direct-response marketing frameworks.",
    inputLabel: "What are you selling?",
    inputPlaceholder: "e.g., A $49 SaaS tool that automates social media scheduling for real estate agents.",
    showEmojiToggle: false,
    showToneSelect: true,
    maxInputWords: 60,
    maxOutputWords: 250,
    systemPrompt: `You are an expert direct-response copywriter writing a Facebook Ad. Use the PAS framework (Problem, Agitation, Solution). 
    1. Call out the target audience's specific pain point immediately.
    2. Agitate the problem so they feel the friction of not solving it.
    3. Introduce the user's product/service as the inevitable solution.
    Include a clear, singular Call To Action at the bottom (e.g., 'Click Learn More below'). 
    Do not use hashtags. Keep total output under {maxOutputWords} words. Return only the ad copy.`,
    howToUse: [
      { title: "Define your product and audience", body: "Don't just name the product. Tell the AI who it is for and what primary problem it solves for them." },
      { title: "Generate the copy", body: "The AI applies proven direct-response frameworks (like Problem-Agitation-Solution) to write ad copy designed to get clicks." },
      { title: "Pair with a great creative", body: "Copy is only half the battle. Pair this output with a high-contrast image or video in your Facebook Ads Manager." }
    ],
    faq: [
      { q: "What makes good Facebook ad copy?", a: "Good ad copy doesn't try to sell the product; it tries to sell the *click*. It should call out a specific audience, address a painful problem, and offer a clear next step." },
      { q: "Should I use long or short copy for Facebook ads?", a: "Test both. Short copy works great for retargeting warm audiences, while long-form storytelling copy often works better for cold traffic that needs more education." }
    ],
    metaTitle: "Free Facebook Ad Copy Generator (AI) — High Converting",
    metaDescription: "Write high-converting Facebook ad copy in seconds. Free AI copywriter trained on direct-response frameworks to lower your CPA.",
    keywords: ["facebook ad copy generator", "ai ad copywriter", "fb ad text generator"],
    relatedSlugs: ["facebook-post-generator", "facebook-caption-generator"]
  },
  {
    slug: "facebook-post-generator",
    platform: "facebook",
    name: "Facebook Post Generator",
    h1: "Facebook Post Generator",
    subhead: "Generate engaging Facebook posts optimized for community interaction and shares.",
    inputLabel: "What is your update or story?",
    inputPlaceholder: "e.g., We just hit our 5-year business anniversary, thanking our local customers.",
    showEmojiToggle: true,
    showToneSelect: true,
    maxInputWords: 50,
    maxOutputWords: 200,
    systemPrompt: `You write highly engaging Facebook posts. Structure: Start with a conversational, relatable opening. Write a short storytelling body with line breaks. End with a question to drive comments. Match the requested tone. Keep total output under {maxOutputWords} words. Return only the post text.`,
    howToUse: [
      { title: "Share your update", body: "Input a personal story, a business milestone, or a community question." },
      { title: "Generate the post", body: "The AI formats the text to feel conversational and native to the Facebook news feed." },
      { title: "Add media and post", body: "Pair the generated text with a photo or video (Facebook heavily penalizes text-only posts) and publish." }
    ],
    faq: [
      { q: "What performs best on Facebook?", a: "Authentic, relatable storytelling. Facebook's algorithm prioritizes posts that generate 'meaningful social interactions'—specifically, long comments and shares from friends/family." },
      { q: "Should I use hashtags on Facebook posts?", a: "Hashtags have very little impact on Facebook reach compared to Instagram or X. You can use 1 or 2 for branding, but they are not necessary." }
    ],
    metaTitle: "Free Facebook Post Generator (AI) — Write Engaging Updates",
    metaDescription: "Generate highly engaging Facebook posts in seconds. Free AI writer for personal updates, business pages, and community building.",
    keywords: ["facebook post generator", "fb post maker", "ai facebook writer"],
    relatedSlugs: ["facebook-ad-copy-generator", "facebook-group-post-generator"]
  },
  {
    slug: "facebook-bio-generator",
    platform: "facebook",
    name: "Facebook Bio/About Generator",
    h1: "Facebook Page Bio Generator",
    subhead: "Write a clear, trustworthy 'About' section for your Facebook Business Page.",
    inputLabel: "What does your business do and where are you located?",
    inputPlaceholder: "e.g., Family-owned Italian restaurant in Chicago, serving authentic pasta since 1995.",
    showEmojiToggle: true,
    showToneSelect: true,
    maxInputWords: 40,
    maxOutputWords: 150,
    systemPrompt: `You write Facebook Business Page 'About' sections. Generate a warm, trustworthy description based on the user's input. Highlight history, core services, and location if provided. Keep it under {maxOutputWords} words. Return only the bio text.`,
    howToUse: [
      { title: "Describe your business", body: "Provide your core services, location, and a bit of history." },
      { title: "Generate the bio", body: "The AI writes a professional yet welcoming description for your Page." },
      { title: "Update your page", body: "Copy the text into the 'About' section of your Facebook Business settings." }
    ],
    faq: [
      { q: "Why is a Facebook Page bio important?", a: "For local businesses, a Facebook Page often acts as a secondary website. The bio builds immediate trust and helps with local Facebook search SEO." },
      { q: "What should be included?", a: "Always include exactly what you offer, who you serve, and contact information or a website link." }
    ],
    metaTitle: "Free Facebook Bio Generator — Business Page About Section",
    metaDescription: "Write a trustworthy Facebook Page bio in seconds. Free AI tool generates professional About sections for local businesses and brands.",
    keywords: ["facebook bio generator", "facebook page about section", "fb business bio"],
    relatedSlugs: ["facebook-post-generator", "facebook-ad-copy-generator"]
  },
  {
    slug: "facebook-group-post-generator",
    platform: "facebook",
    name: "Facebook Group Post Generator",
    h1: "Facebook Group Post Generator",
    subhead: "Write community-driven posts that spark massive discussion in Facebook Groups.",
    inputLabel: "What question or value are you sharing with the group?",
    inputPlaceholder: "e.g., Asking the group for advice on the best CRM for a solo agency owner.",
    showEmojiToggle: true,
    showToneSelect: true,
    maxInputWords: 50,
    maxOutputWords: 200,
    systemPrompt: `You write posts for Facebook Groups. The goal is to spark discussion. If the input is a question, frame it clearly and ask for member experiences. If it's sharing value, structure it clearly and end by asking for the group's opinion. Keep total output under {maxOutputWords} words. Return only the post text.`,
    howToUse: [
      { title: "Define your goal", body: "Are you asking for advice, sharing a win, or starting a debate?" },
      { title: "Generate the post", body: "The AI structures your post to invite comments, which tells the Group algorithm to push it to the top of the feed." },
      { title: "Post and moderate", body: "Post it to the group and be ready to reply to every comment to keep the momentum going." }
    ],
    faq: [
      { q: "How do I get my post seen in a Facebook Group?", a: "The Facebook Group algorithm relies almost entirely on comment velocity. Posts that ask genuine questions or share relatable struggles get the most reach." },
      { q: "Should I include links in group posts?", a: "Be careful. Group admins often decline posts with links because they look promotional. It's safer to share pure text value and offer to DM the link to anyone who asks." }
    ],
    metaTitle: "Free Facebook Group Post Generator (AI) — Spark Discussion",
    metaDescription: "Write engaging Facebook Group posts that get comments. Free AI generator optimized for community discussion and algorithm reach.",
    keywords: ["facebook group post generator", "fb group engagement", "community post maker"],
    relatedSlugs: ["facebook-post-generator", "facebook-caption-generator"]
  },
  {
    slug: "facebook-hashtag-generator",
    platform: "facebook",
    name: "Facebook Hashtag Generator",
    h1: "Facebook Hashtag Generator",
    subhead: "Find the few targeted hashtags that actually work for Facebook search and categorisation.",
    inputLabel: "What is your Facebook post about?",
    inputPlaceholder: "e.g., A local charity run for animal shelters in Austin.",
    showEmojiToggle: false,
    showToneSelect: false,
    maxInputWords: 20,
    maxOutputWords: 50,
    systemPrompt: `You are a Facebook optimization expert. Generate exactly 3 highly relevant hashtags based on the user's topic. Include location or brand-specific tags if applicable. Output ONLY the hashtags separated by spaces. Do not include any other text.`,
    howToUse: [
      { title: "Input your topic", body: "Enter the main theme or location of your post." },
      { title: "Get targeted tags", body: "The AI generates a very small, focused list of hashtags (Facebook penalizes hashtag stuffing)." },
      { title: "Paste at the bottom", body: "Add them to the end of your post to help with Facebook's internal search." }
    ],
    faq: [
      { q: "Do hashtags matter on Facebook?", a: "Yes, but much less than on Instagram. On Facebook, they act more like search categorizations rather than discovery engines." },
      { q: "How many hashtags should I use on Facebook?", a: "Stick to 2 or 3. Data shows that Facebook posts with more than 3 hashtags actually see a decline in engagement because they look like spam." }
    ],
    metaTitle: "Free Facebook Hashtag Generator — Targeted FB Tags",
    metaDescription: "Generate the right hashtags for Facebook. Free AI tool finds a focused, spam-free list of tags to categorize your posts for search.",
    keywords: ["facebook hashtag generator", "fb tags", "facebook seo"],
    relatedSlugs: ["facebook-post-generator", "facebook-group-post-generator"]
  },
  {
    slug: "facebook-caption-generator",
    platform: "facebook",
    name: "Facebook Video Caption Generator",
    h1: "Facebook Video Caption Generator",
    subhead: "Write engaging text descriptions to accompany your Facebook Video or Reel uploads.",
    inputLabel: "What happens in your video?",
    inputPlaceholder: "e.g., A time-lapse of building a custom wood dining table from scratch.",
    showEmojiToggle: true,
    showToneSelect: true,
    maxInputWords: 40,
    maxOutputWords: 150,
    systemPrompt: `You write video captions for Facebook. Generate an engaging description of the video based on the user's input. It must include a strong hook sentence, a brief context summary, and a clear call-to-action (e.g., 'Watch till the end' or 'Drop a comment'). Keep it under {maxOutputWords} words. Return only the caption text.`,
    howToUse: [
      { title: "Describe the video", body: "Give the AI the basic plot or the main takeaway of the video you are uploading." },
      { title: "Generate the caption", body: "The AI writes a description that provides context without giving away the ending." },
      { title: "Upload and paste", body: "Paste the caption into the description box when uploading your video to Facebook." }
    ],
    faq: [
      { q: "Why do I need a caption for a video?", a: "Many users watch Facebook videos on mute initially. A strong text caption provides context and gives them a reason to turn the sound on and watch the whole thing." },
      { q: "Does the caption affect Facebook video SEO?", a: "Yes. Facebook scans your caption text to understand what the video is about so it can serve it to the right audience in the Watch feed." }
    ],
    metaTitle: "Free Facebook Video Caption Generator (AI)",
    metaDescription: "Write engaging captions for your Facebook Videos and Reels. Free AI tool to increase video retention and search visibility on FB.",
    keywords: ["facebook video caption generator", "fb reel caption", "facebook video description"],
    relatedSlugs: ["facebook-post-generator", "facebook-hashtag-generator"]
  }
];

export function getToolBySlug(slug: string): ToolConfig | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

export function getAllSlugs(): string[] {
  return TOOLS.map((t) => t.slug);
}

export function getRelatedTools(tool: ToolConfig): ToolConfig[] {
  return tool.relatedSlugs
    .map((slug) => getToolBySlug(slug))
    .filter((t): t is ToolConfig => Boolean(t));
}

export function getToolsByPlatform(platform: Platform): ToolConfig[] {
  return TOOLS.filter((t) => t.platform === platform);
}