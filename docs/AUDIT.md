# Code audit, November 2026

An honest review of the whole repository before handover: every directory, the database migrations, the dependencies and the git history. It says what is good, what was wrong and is now fixed, and what is still open.

## Verdict

**The core is clean. The edges show their age.**

- `lib/forge` (the product logic), the API layer, the public API and MCP server, and the database migrations are well structured: small single-purpose modules, typed end to end, validated inputs, consistent error handling, comments that explain why rather than what. This is not spaghetti.
- A handful of older UI files grew by iteration and are now too large. They work, but they are the first thing to refactor (see "Open items").
- There are **no automated tests.** Correctness today rests on TypeScript strict mode, zod validation, row level security and manual testing.

## What was checked

| Check | Result |
| --- | --- |
| TypeScript strict (`tsc --noEmit`) | Passes |
| ESLint (`next lint`, `next/core-web-vitals`) | Passes with zero warnings after fixes below |
| Production build (`next build`) | Passes, all pages generated |
| Secrets in the tree and in all 49 commits | None found |
| Row level security | Enabled on all 51 tables in the repo migrations |
| Cron endpoints | All require `CRON_SECRET`, constant-time compare |
| OAuth state, Razorpay signature, inbound email signature | Verified correctly |
| Outbound fetches of user URLs | Go through an SSRF-safe fetcher with DNS checks |
| Service-role key | Server-only (now enforced at build time) |
| `.env.example` | Complete and documented |

## Fixed in this handover

### Security and correctness

1. **Unauthenticated calendar webhook.** `app/api/webhook/calendar-event-created` accepted any POST and used the publishable key for an admin call, so it both lacked a guard and could never work. Rewritten: requires `SUPABASE_WEBHOOK_SECRET` (503 if unset, constant-time header check), uses the service client, validates the body, null-checks the user, and fails soft.
2. **Billing webhook could lose a payment event.** If processing failed after the event was recorded, Razorpay's retry was treated as a duplicate and ignored forever. Now a failed event is atomically reclaimed (`status = 'failed'` to `'processing'`) and processed again; succeeded events are still ignored. Safe because handlers write absolute period values from the payload.
3. **JSON-LD script injection.** Five pages wrote structured data with raw `JSON.stringify` inside `<script>`. A `</script>` in any value (for example a blog title) would break out. All now use `jsonLd()` in `lib/seo.ts`, which escapes `<`, `>`, `&`, U+2028 and U+2029.
4. **Service-role client could be imported by client code.** `lib/supabase/service.ts` now imports `server-only`; the build fails if that ever happens.
5. **Security headers.** Added `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security` and `Permissions-Policy` in `next.config.js`.
6. **Unvalidated public AI endpoint.** `app/api/tools/generate` (the free tools, no login) passed a user-supplied `tone` straight into the system prompt with no length limit, and accepted any string containing `@` as a lead email. Now every field is validated with zod: `tone` is a short plain label, `input` is capped, and the email must be a real address.
7. **A Redis outage took down every rate-limited endpoint.** If Upstash was configured but unreachable, `consumeLimit` threw, so the free hook grader, the X audit and the public API all returned 500. It now falls back to per-instance limits for 30 seconds and retries, with one quick retry instead of five slow ones. Found by the new monitoring dashboard on its first run.
8. **Stale duplicate endpoint.** `app/api/api/public/grade-hook` (note the doubled `api`) was an older copy with an in-memory rate limit and a TODO. Removed; the live endpoint is unaffected.

### Code health

9. **Dead code removed** (no imports anywhere): `PreviewPane.tsx`, `psychologysection.tsx`, `blog-card.tsx`, `HookGrader.tsx`, `ShadowbanChecker.tsx`, `RazorpayCheckoutButton.tsx`, `lib/email/design.ts`, `lib/email/marketing.ts`, `lib/supabase-server.ts`, and `lib/supabase/client.ts` (a duplicate of `lib/supabase-browser.ts`).
10. **Unused dependencies removed:** `@anthropic-ai/sdk` (the code calls the Anthropic HTTP API with `fetch`), `tesseract.js`, `@types/katex`.
11. **React hook bugs** in `CalendarPane.tsx`: stale closures and a Supabase client recreated every render. Fixed with `useCallback`, `useMemo` and correct dependencies. In `EditorPane.tsx` a new empty array every render caused needless re-renders; replaced with a stable constant.
12. **`@ts-ignore` removed** where it was hiding nothing (3 places) and a success `console.log` removed from `lib/memory.ts`.
13. **Lint configuration added** (`.eslintrc.json`), with 40 unescaped-entity fixes across marketing and legal pages. `npm run typecheck` and `npm run check` scripts added.

## Critical: the database baseline is missing

The code uses database objects that **no SQL file in this repository creates**. They exist in the production Supabase project because they were made before migrations were tracked.

- Tables: `billing_events`, `brand_dna_sources`, `calendar_events`, `ebooks`, `email_preferences`, `scraped_profiles`, `subscriptions`, `usage_events`, `plan_limits`
- Functions: `consume_ebook_credit`, `get_quota_status`, `reserve_quota`, `settle_quota`

**Consequence:** a fresh environment built from this repo will fail on billing, quotas, ebooks and the calendar. **Fix (owner, 10 minutes):** dump the production schema (schema only, no data) and commit it as the first migration. Exact commands are in [HANDOVER.md](./HANDOVER.md).

## Open items, in priority order

| # | Item | Why it matters | Effort |
| --- | --- | --- | --- |
| 1 | Commit the production schema baseline | Without it nobody can stand up a new environment | 10 min (owner) |
| 2 | Decide repository visibility | The GitHub repo is currently **public**. Anyone can read the code, which weakens an acquisition and any NDA. Make it private until the deal decides otherwise. | 1 min (owner) |
| 3 | Add tests for the money and safety paths | No tests today. Start with the billing webhook, `metered.ts` quota reserve and settle, `requireScope`, RLS policies (pgTAP or a Supabase test project), and `voice.ts` scoring | 3 to 5 days |
| 4 | Measure cost per active user | Needed before a 50,000-user pilot. `usage_events` holds tokens per call; turn it into cost per user per week | 1 day |
| 5 | Move heavy cron work to a queue | `weekly-plan` and `post-metrics` loop over all brands inside one request (max 300 s). Fine for hundreds of brands, not for tens of thousands. Use a queue (Supabase queues, Inngest or QStash) with one job per brand | 3 to 5 days |
| 6 | Error monitoring | **Done** (after the audit): `/admin/ops` records every request, outside call and browser error, checks services every 5 minutes and emails alerts. See [MONITORING.md](./MONITORING.md). An outside uptime monitor on `/api/health` is still worth adding | 10 min |
| 7 | Content Security Policy | Not added yet because Razorpay, AdSense and analytics need careful allowlisting. Start in report-only mode | 1 day |
| 8 | Split the large legacy components | `EditorPane.tsx` (about 2,100 lines, 25 `useState`, 146 hard-coded colours), `components/EbookCanvas.tsx` (about 2,000 lines, 73 inline style blocks), `app/account/page.tsx` (about 1,450 lines), `lib/mail-service.ts` (about 950 lines). Move state into hooks, colours into Tailwind tokens, and sections into components | 1 to 2 weeks, incremental |
| 9 | CI | Run `npm run check` and `npm run build` on every pull request (GitHub Actions) | 1 hour |

## How it was judged

"AI-generated spaghetti" usually shows up as duplicated logic, business rules inside route handlers, inconsistent error handling, untyped data, dead files, and giant components with tangled state. Against that list:

- Duplication: low in `lib/forge`; the duplicates that existed (two Supabase browser clients, two grade-hook routes) were removed.
- Logic in routes: no; routes are thin adapters by convention and in practice.
- Error handling: one pattern (`route()` plus `HttpError`) used by 111 of the 128 route handlers. The other 17 are redirects, webhooks, the streaming chat and MCP handlers, and a few older routes (billing, ebook, brand DNA, free tools) that handle errors themselves and are worth moving onto `route()` when next touched.
- Types: strict mode, zod at every boundary.
- Dead files: removed.
- Giant components: yes, in the four legacy files listed above. That is the honest weak spot.
