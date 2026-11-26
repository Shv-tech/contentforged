# Handover checklist

What the current owner does so that another team can run Forge without him, and what the receiving team checks. Work top to bottom.

## A. Owner, before sharing the code

- [ ] **Make the GitHub repository private** (Settings, General, Danger Zone, Change visibility). It is public today.
- [ ] **Commit the production database baseline**, schema only, no user data:
  ```bash
  supabase link --project-ref <prod-ref>
  supabase db dump --linked --schema public \
    -f supabase/migrations/20260801000000_baseline_legacy.sql
  ```
  Open the file and check that it contains no `INSERT` statements (schema only). Then make the statements idempotent where practical (`create table if not exists`), commit, and push. This closes the gap described in [AUDIT.md](./AUDIT.md#critical-the-database-baseline-is-missing).
- [ ] Commit the audit branch `audit-and-handover` and open a pull request into `main`.
- [ ] Share code under an NDA, and only after the pilot terms are in writing.

## B. Owner, before a pilot goes live

- [ ] Rotate every production secret that has ever been pasted into chat, a screenshot or a laptop shared with others: Anthropic, Supabase service role, Razorpay, Resend, X bearer, `CRON_SECRET`. (`FORGE_ENCRYPTION_KEY` rotation forces users to reconnect platforms; skip unless exposed.)
- [ ] Confirm `UPSTASH_REDIS_*` is set in production, so rate limits are shared across instances.
- [ ] Apply `20261126000000_forge_ops.sql`, schedule `forge-ops-health`, open `/admin/ops` and press Check now. Add `/api/health` to a free uptime monitor. See [MONITORING.md](./MONITORING.md).
- [ ] Confirm the `pg_cron` jobs are scheduled in production (`select jobname, schedule from cron.job;`) and match the table in [ARCHITECTURE.md](./ARCHITECTURE.md#10-scheduled-jobs).
- [ ] Set `SUPABASE_WEBHOOK_SECRET` and add it as the `x-webhook-secret` header on the calendar database webhook. The endpoint now refuses calls without it.
- [ ] Measure cost per active user per week from `usage_events` before agreeing a price or revenue split.

## C. Accounts and ownership to transfer (at acquisition)

| Asset | Where | Transfer |
| --- | --- | --- |
| Source code | GitHub `Shv-tech/contentforged` | Transfer repository or add as org owner |
| Hosting | Vercel project | Transfer project to the acquirer's team |
| Database, auth, storage | Supabase project | Transfer project to the acquirer's org |
| Domain | Registrar (GoDaddy) | Domain transfer, then update DNS and `NEXT_PUBLIC_APP_URL` |
| Email | Resend account and inbound domain | New account, verify domain, update keys |
| Payments | Razorpay account | Acquirer's own account; recreate plans with `scripts/setup-razorpay-plans.ts` |
| AI and services | Anthropic, Groq, OpenAI, Tavily, Upstash | Acquirer's own keys |
| Platform apps | X developer app, LinkedIn app, Meta (Threads) app | Re-register under the acquirer; LinkedIn product approvals take time |
| Chrome extension | Chrome Web Store listing | Transfer the listing or publish under the acquirer |
| Social accounts | @forgeyourway and others | By agreement |

## D. Receiving team, first week

- [ ] Clone, follow [ONBOARDING.md](./ONBOARDING.md), and get `npm run check` and `npm run build` green.
- [ ] Stand up a fresh Supabase project from the migrations alone (after step A). If anything fails, the baseline is incomplete.
- [ ] Add CI running `npm run check` and `npm run build` on pull requests.
- [ ] Read [AUDIT.md](./AUDIT.md) "Open items" and agree an order.
- [ ] Walk through [INTEGRATION.md](./INTEGRATION.md) with whoever owns the partner integration.

## E. Known facts to keep straight

- Forge reads platforms through official APIs with user consent. It does not scrape logged-in pages and does not use proxy accounts.
- Nothing is ever posted to X automatically.
- There are no automated tests yet.
