# Upgrading an existing Forge checkout

Releases are listed newest first. Apply each one you have not applied yet, in order from the oldest.

---

## The languages release

Forge used to write in English, Hindi and Hinglish. It now writes in 41 languages, all defined in `lib/forge/languages.ts`:

- **Ten mixes with English, in Roman script:** Hinglish, Tenglish, Tanglish, Banglish, Marathi-English, Kanglish, Manglish, Gujarati-English, Punjabi-English and Taglish.
- **Ten Indian languages in their own script:** Hindi, Bengali, Telugu, Tamil, Marathi, Gujarati, Kannada, Malayalam, Punjabi and Urdu.
- **Twenty world languages:** Spanish, Portuguese, French, German, Italian, Dutch, Swedish, Polish, Turkish, Indonesian, Vietnamese, Russian, Ukrainian, Greek, Arabic, Hebrew, Thai, Japanese, Korean and Chinese.

Every language listed is one Whisper transcribes, so voice notes work in all of them.

### 1. Database

Run `supabase/migrations/20261110000000_forge_languages.sql` after `20261101000000_forge_platform.sql`. It replaces the three language checks (profiles, workspaces, drafts) with one list kept in `forge_writing_languages()`. Existing values are all still valid, so no row changes. It is safe to re-run. To add a language later, add it to `lib/forge/languages.ts` and to that function, then run the file again.

### 2. What changes for people

- **Settings.** The writing language under Brand settings is now a grouped picker.
- **Measuring.** Forge measures the language of a person's own posts from three signals: the script of the letters, common words of each mix that are not English words, and the function words of each Latin-script language. When the posts disagree with the setting, the posts win. The exception is a difference text cannot settle: Hindi and Marathi share Devanagari, and two mixes can share words, so in those cases the setting wins.
- **Transcription.** A language in its own script is named to Whisper, so Marathi is not heard as Hindi. A mix is left for Whisper to detect, with a prompt sentence in the mix that keeps the other language's words in Roman script.
- **Right-to-left text.** Urdu, Arabic and Hebrew drafts display right to left in the studio and the weekly plan.
- **Threads.** Splitting a long post into a thread recognises the danda, Arabic and CJK sentence endings.
- **Visuals.** Slides are drawn with the brand kit's Latin typefaces and no complex-script shaping. When slide text contains another script, the visual panel says so instead of rendering empty boxes. Mixes in Roman script render correctly.

No new environment variables.

---

## The platform release (capture, weekly plan, teams, API)

This release turns Forge from a writing tool into a weekly system: material comes in on its own (voice notes, email, shares, the extension, GitHub, Linear, Notion, calendars), the person keeps or discards what Forge finds, a plan of drafts arrives every week to approve or skip by swiping, and results flow back into predictions, experiments and goals. Workspaces gain members, roles, live co-editing, comments, version history and an activity log. Forge also becomes something other tools call, through a REST API and an MCP server.

### 1. Code

Copy the tree over your checkout and run `npm install`. No files are deleted in this release. New dependencies were already in `package.json` from the previous release: `yjs`, `web-push`, `pdf-lib`, `fflate`.

### 2. Database

Run `supabase/migrations/20261101000000_forge_platform.sql` after `20261025000000_forge_intelligence.sql`. It is additive and safe to re-run. What it changes that existing data feels:

- **Sharing model.** Rows with a `workspace_id` become visible to every member of that workspace and writable by its owner and editors. Rows without one stay private to their `user_id`. The decision lives in three `SECURITY DEFINER` functions (`forge_workspace_role`, `forge_can_read`, `forge_can_write`) so every policy asks the same question.
- **Account deletion.** Foreign keys from legacy tables to `auth.users` become `ON DELETE CASCADE`, so deleting an account removes everything in one transaction.
- **Weekly plan.** Everyone already onboarded gets plan settings (three LinkedIn drafts on Monday at 07:00 in their time zone). They can change or turn this off under This week, Settings.
- **Storage.** Two private buckets, `captures` (recordings, 25 MB) and `brand-assets` (headshots and logos, 5 MB).
- **Realtime.** Policies on `realtime.messages` for private `draft:<id>` channels: editors broadcast edits; anyone who can read the draft can share presence.
- **Ebooks.** If the legacy `ebooks` table exists it gains `workspace_id`, `origin` and `lineage`, and `session_id` becomes nullable so compiled books can be saved.

### 3. Supabase project settings

- **Realtime:** under Realtime, Settings, turn off "Allow public access" so only private channels are used. Live co-editing works without Realtime too (edits merge on the server), but people will not see each other type.
- **SSO (optional):** single sign-on uses Supabase SAML, available on the Pro plan. Add a provider per customer domain with `supabase sso add --type saml --metadata-url <url> --domains <company.com>`. The login page has a "Sign in with single sign-on" option that finds the provider from the work email.

### 4. Environment

| Variable | Needed for |
| --- | --- |
| `GROQ_API_KEY` | Transcribing voice notes and interviews (Whisper). Already used as the chat fallback. |
| `OPENAI_API_KEY` | Transcription fallback when Groq is unset or fails. |
| `FORGE_INBOUND_DOMAIN` | Email-in addresses, e.g. `in.forgeyourway.dev`, set up for receiving in Resend. |
| `RESEND_INBOUND_WEBHOOK_SECRET` | Verifying Resend's `email.received` webhook at `/api/capture/email`. Inbound mail is refused without it. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push notifications. `npx web-push generate-vapid-keys` |
| `ADMIN_EMAILS` | Who can open `/admin`. Everyone else gets a not-found page. |

Every one of these switches a feature on. Without them the feature says it is not set up rather than pretending.

### 5. Scheduled jobs

Add the `cron.schedule` statements at the end of the migration after replacing `<APP_URL>` and `<CRON_SECRET>`:

| Job | Schedule | Does |
| --- | --- | --- |
| `/api/cron/weekly-plan` | hourly at :05 | Writes each brand's week when its delivery hour arrives in its time zone, then emails and pushes |
| `/api/cron/sources-sync` | every 6 hours | Reads GitHub, Linear, Notion and calendars into the inbox |
| `/api/cron/comments-sync` | every 2 hours | Reads comments on recent posts; questions become ideas |
| `/api/cron/client-reports` | the 1st at 03:30 | Builds last month's report for each client workspace |
| events sweep | daily | Deletes product events older than 400 days and stale invitations |

`/api/cron/niche-insights` (daily, from the previous release) now also computes shared format results.

### 6. Browser extension

Version 1.1.0 adds **Fill**: a list of approved and scheduled drafts beside the composer that places one in the box at a click. Reload the unpacked extension or publish the new version. API keys and extension tokens share a table but are kept apart: extension tokens no longer appear in, or count against, the API key list.

### 7. Behaviour to know about

- Nothing posts to X automatically. Approving an X draft schedules a reminder; Fill places text in the composer and the person presses Post.
- The comment inbox drafts replies; it never replies, likes or follows.
- API keys work only on `/api/v1/*` and `/api/mcp`. Drafts made through the API are saved for review, never posted.

---

## The intelligence release

This release adds the intelligence layer (drafts, voice, Story Bank, learning, Playbook, publishing, Signals, workspaces, War Room, extension) and removes dead code. Apply it in this order.

### 1. Replace the code

Copy this tree over your checkout, then remove the files this release deletes (a copy cannot delete them for you):

```bash
git rm -q --ignore-unmatch \
  "PAY FOR WHAT ACTTUALLY WORKS2.png" forge.svg forgelogo.png workspacesingularity.png \
  "app/(dashboard)/dashboard/SwarmCanvas.tsx" \
  "app/(marketing)/blog/ai-content-paradox.png" \
  "app/(marketing)/components/landing/architecturesection.tsx" \
  "app/(marketing)/components/landing/problemsection.tsx" \
  "app/(marketing)/components/landing/testimonials.tsx" \
  app/api/cancel-subscription/route.ts app/api/free-generate/route.ts app/api/generate/route.ts app/api/swarm/route.ts \
  app/robots.txt components/SettingsModal.tsx \
  lib/email/action.ts lib/engine.ts lib/prompt.ts lib/swarm-tools.ts \
  public/assets/video.mp4 public/assets/video2.mp4 public/assets/video3.mp4 \
  public/logos/beehiive.svg public/logos/gumroad.svg public/logos/indiehackers.svg public/logos/lemon-squeezy.svg \
  public/logos/notion.svg public/logos/product-hunt.svg public/logos/webflow.svg \
  public/screenshots/olympiad-arena-architecture.md.pdf
npm install
```

Why each removal happened:

| Removed | Reason |
| --- | --- |
| `app/api/swarm`, `lib/swarm-tools.ts`, `SwarmCanvas.tsx` | Unauthenticated, unmetered, called a retired model, and could fetch arbitrary URLs from the server. Replaced by `/api/war-room`. |
| `app/api/generate`, `app/api/free-generate`, `lib/engine.ts`, `lib/prompt.ts` | Unused bring-your-own-key routes; one returned mock output when unconfigured. |
| `app/api/cancel-subscription` | Took the user id from the request body with no session check. Cancellation lives in `/api/billing/subscription`. |
| `lib/email/action.ts` | A server action any visitor could call to send Forge's welcome email to any address. The welcome now sends from the server when onboarding finishes. |
| `app/robots.txt` | Conflicted with `public/robots.txt`, which is the complete one. |
| `components/SettingsModal.tsx`, the logo SVGs, three videos, the root images | Not referenced anywhere. |

### 2. Database

Run `supabase/migrations/20261025000000_forge_intelligence.sql`. It is additive and safe to re-run. It also:

- backfills `chat_sessions.last_message_at` from each session's newest message, so Recents keep their order;
- marks everyone who already has a conversation as onboarded, so existing users are not sent through setup.

### 3. Environment

| Variable | Needed for |
| --- | --- |
| `FORGE_ENCRYPTION_KEY` | Storing LinkedIn, Threads and Bluesky credentials. `openssl rand -base64 32` |
| `CRON_SECRET` | Every scheduled job. Jobs refuse to run without it, including calendar reminders, which previously ran open when it was unset. |
| `X_BEARER_TOKEN` | Audits, voice import, niche pulse, Reply Radar, X results |
| `TAVILY_API_KEY` | War Room research and fact-checked drafts |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | LinkedIn publishing |
| `THREADS_APP_ID`, `THREADS_APP_SECRET` | Threads publishing |

`UNIVERSAL_WEBHOOK_URL` and `INTERNAL_OPENAI_KEY` are no longer read.

### 4. Scheduled jobs

Run the `cron.schedule` statements at the end of the migration after replacing `<APP_URL>` and `<CRON_SECRET>`.

### 5. Fonts

Instrument Sans is now self-hosted from `app/fonts/` (SIL Open Font License), so builds no longer fetch from Google Fonts.

## Monitoring (20261126000000_forge_ops.sql)

Adds `ops_events` (service role only) and `ops_summary()` for the `/admin/ops` dashboard.

1. Apply the migration. It is idempotent.
2. Schedule the health job with the `cron.schedule('forge-ops-health', ...)` statement at the end of the file.
3. Optional settings: `OPS_SAMPLE_SUCCESS`, `OPS_RETENTION_DAYS`, `OPS_ALERT_ERRORS`, `OPS_DISABLED`. See `docs/MONITORING.md`.

`next.config.js` now enables `experimental.instrumentationHook`, which `instrumentation.ts` needs to record calls to outside services.
