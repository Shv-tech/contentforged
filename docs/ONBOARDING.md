# Engineer onboarding

Goal: a new engineer runs Forge locally on day one, understands where things live by day two, and ships a safe change in the first week. Read [ARCHITECTURE.md](./ARCHITECTURE.md) first.

## Day 1: run it

### Prerequisites

- Node.js 20 or newer (verified on 22) and npm
- A Supabase project (free tier is fine for development) and the Supabase CLI
- An Anthropic API key. Everything else is optional for a first run.

### Steps

```bash
git clone <repo> forge && cd forge
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

Fill these in `.env.local` before the first run. The rest of `.env.example` is commented with what each value enables, and every optional integration fails closed (the feature hides or returns a clear error) when its key is missing.

| Variable | Required | Why |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | yes | Absolute links in emails, OAuth callbacks, MCP |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Browser and server Supabase clients |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only admin client (`lib/supabase/service.ts`) |
| `ANTHROPIC_API_KEY` | yes | All drafting, grading and extraction |
| `FORGE_ENCRYPTION_KEY` | for publishing | AES-256-GCM key for stored platform credentials. `openssl rand -base64 32`. Rotating it invalidates stored connections (users reconnect). |
| `CRON_SECRET` | for jobs | Shared secret `pg_cron` sends to `/api/cron/*` |
| `GROQ_API_KEY`, `OPENAI_API_KEY` | for voice | Whisper transcription (Groq first, OpenAI fallback) and the fallback model |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | for rate limits | Without them, limits fall back to per-instance memory. Not acceptable in production. |
| `RESEND_API_KEY`, `FORGE_INBOUND_DOMAIN`, `RESEND_INBOUND_WEBHOOK_SECRET` | for email | Outbound mail and email capture |
| `X_BEARER_TOKEN`, `LINKEDIN_*`, `THREADS_*` | for platforms | Reads and publishing. See README, "Platform apps". |
| `RAZORPAY_*` | for billing | Checkout and the signed webhook |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | for push | Web Push notifications |
| `SUPABASE_WEBHOOK_SECRET` | for the calendar webhook | Database webhook on new calendar events |
| `ADMIN_EMAILS` | optional | Who can open `/admin` and `/admin/ops`, and who gets monitoring alerts |
| `OPS_SAMPLE_SUCCESS`, `OPS_RETENTION_DAYS`, `OPS_ALERT_ERRORS`, `OPS_DISABLED` | optional | Monitoring tuning, see MONITORING.md |

### Database

> Read this carefully. It is the one step that does not work from the repo alone yet.

1. **Baseline.** Until the owner commits a schema dump (see [HANDOVER.md](./HANDOVER.md)), restore it from production into your dev project:
   ```bash
   supabase link --project-ref <prod-ref>
   supabase db dump --linked --schema public -f supabase/migrations/20260801000000_baseline_legacy.sql
   ```
   Once that file is in the repo, this step disappears.
2. **Migrations.** Apply `supabase/migrations/*` in order with `supabase db push` (or paste them into the SQL editor). They are additive and idempotent. [UPGRADE.md](./UPGRADE.md) lists the project settings each one needs (Storage buckets, Realtime authorization, auth providers).
3. **Scheduled jobs.** The `cron.schedule(...)` statements at the end of `20261025000000_forge_intelligence.sql` and `20261101000000_forge_platform.sql` are commented out on purpose. Uncomment, set the URL and secret for your environment, and run them once. In development you can call a job by hand:
   ```bash
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/weekly-plan
   ```

### Check your setup

```bash
npm run check     # tsc --noEmit, then next lint. Must be clean.
npm run build     # production build. Must pass before any merge.
```

## Day 2: find your way around

```
app/(marketing)/        public site: landing, free tools, blog, methodology, legal
app/(dashboard)/        the signed-in workspace (chat, inbox, week, drafts, brand, playbook, team, calendar, ebooks)
app/drafts/[id]/        the draft studio: live co-editing, comments, versions, results
app/capture, app/review the installable app's capture and swipe-review screens
app/api/<resource>/     route handlers, one folder per resource
app/api/v1, app/api/mcp the public API and MCP server
app/api/cron/*          scheduled jobs
components/forge/       current UI system and feature components
components/ (other)     legacy UI: EbookCanvas, older dashboard pieces
lib/forge/              the product's domain logic (see ARCHITECTURE section 4)
lib/platforms/          LinkedIn, Threads, Bluesky clients
lib/x/                  X API client and X-specific analysis
lib/supabase/           browser, server and service clients
extension/              Chrome extension
supabase/migrations/    schema
docs/                   this documentation, diagrams
```

Suggested reading order for the code, about two hours:

1. `lib/forge/http.ts`: how every request is authenticated and errors are shaped.
2. `lib/forge/brand-request.ts` and `lib/forge/data/workspace.ts`: personal versus workspace scope.
3. `lib/forge/public-api.ts`: a compact tour of the core operations.
4. `lib/forge/voice.ts`, then `lib/forge/writer.ts`: how a post is written in someone's voice.
5. `lib/forge/capture/ingest.ts` and `extract.ts`: how raw material becomes proposals.
6. `lib/forge/weekly-plan.ts`: the main loop.
7. `supabase/migrations/20261101000000_forge_platform.sql`: search for `forge_apply_scoped_policies`.

## Day 3 onward: how we write code here

### Adding an API route

```ts
// app/api/things/route.ts
import { z } from 'zod';
import { route, parseJson } from '@/lib/forge/http';
import { brandRequest } from '@/lib/forge/brand-request';
import { createThing } from '@/lib/forge/things';

const Body = z.object({ name: z.string().min(1).max(200) });

export const POST = route('api/things:post', async (req: Request) => {
  const { ctx, workspaceId } = await brandRequest(req, { write: true });
  const input = await parseJson(req, Body);
  const thing = await createThing(ctx, workspaceId, input);
  return Response.json({ thing });
});
```

Rules:

- Wrap handlers in `route()`. Throw `HttpError` for expected failures.
- Validate every body with zod through `parseJson`.
- Put logic in `lib/forge`, not in the route.
- Any endpoint reachable by an API key calls `requireScope`.
- Any model call on a user's behalf goes through `lib/forge/metered.ts` so quota is reserved and settled.
- Plan gates come from `lib/forge/entitlements.ts`. Do not check plan names inline.
- Outbound fetches of user-supplied URLs go through `lib/forge/net.ts` (`fetchPublicText`), which blocks private addresses.
- Anything that touches the service-role key lives in a file that imports `server-only`.
- A new route folder needs its prefix in `lib/ops/features.ts` so `/admin/ops` files it under the right feature. Work that can fail after the response is sent (streams, background tasks) calls `reportError()` from `lib/ops/recorder.ts`.
- When something breaks in production, start at `/admin/ops` (see [MONITORING.md](./MONITORING.md)). A reference like `r_3f9a1c2b7d` from a user's screenshot finds the exact request.

### Adding a table

- Write a new timestamped migration in `supabase/migrations/`. Make it idempotent (`create table if not exists`, `drop policy if exists`).
- Give it `user_id` or `workspace_id` and call `forge_apply_scoped_policies` so RLS is on from the first deploy.
- Add a typed helper in `lib/forge/data/` if more than one file will touch it.
- Add a line to `docs/UPGRADE.md`.

### Adding a scheduled job

- Create `app/api/cron/<name>/route.ts`, start it with `requireCron(req)`, set `maxDuration`.
- Keep it idempotent: it may run twice.
- Add its `cron.schedule` line (commented) to your migration and a row to the README table.

### Product rules that are also code rules

- Nothing is posted to X automatically. No automated likes, follows or replies on any platform.
- Writers may only use facts from the Story Bank. Missing facts become `[brackets]` for the person to fill.
- Forge reads platforms through their official APIs with the person's consent. It does not scrape logged-in pages or use proxy accounts.
- No emoji in UI copy.

### Before you open a pull request

- [ ] `npm run check` is clean
- [ ] `npm run build` passes
- [ ] New tables have RLS; new routes validate input and check scope
- [ ] No secrets, tokens or `.env*` files in the diff
- [ ] Docs updated if you changed a flow, a job, or an env var

## Who to ask

Until the handover is complete, the original author (Shaurya Verma, SHV Groups) is the point of contact for anything about production data, Supabase settings, platform app approvals and Razorpay.
