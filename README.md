# ContentForge ⚡

**Turn one piece of content into 30+ platform-ready posts. Instantly.**

ContentForge is a BYOK (Bring Your Own Key) AI content repurposing engine. Paste a blog, YouTube link, or raw text — get LinkedIn posts, tweets, newsletters, threads, and Instagram captions. Your API key, your cost, zero markup.

## Stack

- **Framework:** Next.js 14 (App Router, TypeScript)
- **Auth + DB:** Supabase (Postgres, RLS, auth)
- **Payments:** Razorpay (INR)
- **LLM:** OpenAI or Anthropic (user's own key)
- **State:** Zustand (persisted settings)
- **Styling:** Tailwind CSS (Apple design system)
- **Deploy:** Vercel free tier

## Setup

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env.local
# Fill in Supabase + Razorpay keys

# 3. Database
# Go to Supabase SQL Editor → paste supabase-schema.sql → run

# 4. Run
npm run dev
```

## Deploy

```bash
npx vercel
# Add env vars in Vercel dashboard
```

## Architecture

```
app/
  page.tsx                    Landing page (Apple design)
  layout.tsx                  Root layout + metadata
  globals.css                 Apple design system CSS
  (auth)/login/page.tsx       Login
  (auth)/signup/page.tsx      Signup
  (dashboard)/dashboard/      Main generation UI
  api/generate/route.ts       LLM generation endpoint
  api/razorpay/route.ts       Payment order creation
  api/razorpay/verify/route.ts Payment verification
lib/
  engine.ts                   Prompts, LLM calling, parsing
  store.ts                    Zustand state
  supabase-browser.ts         Client Supabase
  supabase-server.ts          Server Supabase
  use-razorpay.ts             Payment hook
types/index.ts                Types, pricing, credits
middleware.ts                 Auth route protection
supabase-schema.sql           Database schema
```

## Revenue Model

| Plan | Price | Credits |
|------|-------|---------|
| Free | ₹0 | 5 |
| Starter | ₹1,499/mo | 50 |
| Pro | ₹3,999/mo | 200 |
| Unlimited | ₹7,999/mo | ∞ |

**Cost per user: ₹0** (BYOK model). 100% gross margin.

## Launch Channels

1. **AppSumo** — Lifetime deals, built-in audience
2. **Product Hunt** — Day-1 visibility spike
3. **X / Twitter** — Build-in-public thread
4. **IndieHackers** — Community launch

---

Built by SHV Groups.
