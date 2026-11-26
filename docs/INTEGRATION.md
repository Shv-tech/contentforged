# Integrating with Forge

For partner engineering teams (written for Infloso's pilot). It covers what exists today, how to call it, and what would need building for a 50,000-user pilot. Everything marked **Exists** is in this repository and working; everything marked **To build** is not.

## 1. Two ways in, one engine

| Surface | Endpoint | Best for |
| --- | --- | --- |
| REST API | `https://<app>/api/v1/*` | Your backend calling Forge directly |
| MCP server | `https://<app>/api/mcp` | An AI agent (for example your creator assistant) using Forge as a tool |

Both are thin adapters over `lib/forge/public-api.ts`, so the same call gives the same answer on either surface. **Exists.**

## 2. Authentication

- **API keys.** Created by a user in Account, API keys (up to 20 per user). Format `fx_...`. Shown once; stored only as a SHA-256 hash.
- Send as `Authorization: Bearer fx_...`. Cookie sessions are refused on these endpoints on purpose (request forgery).
- **Scopes,** chosen when the key is made:
  - `read`: voice, stories, ideas, drafts
  - `write`: save stories and drafts
  - `generate`: anything that spends model tokens (grading, drafting)
- **Workspace pinning.** A key can be pinned to one workspace (brand). Membership and role are re-checked on every call, so removing someone from a workspace disables their key for it immediately.
- **Plan gate.** API and MCP access requires the Pro plan or above (`lib/forge/entitlements.ts`).
- **Rate limit.** 600 requests per hour per key (Upstash Redis). Over the limit returns `429` with the minutes until reset.

## 3. REST reference (v1)

All responses are JSON. Errors are `{ "error": "<message>" }` with a meaningful status (400, 401, 403, 404, 409, 429, 500).

| Method and path | Scope | Input | Returns |
| --- | --- | --- | --- |
| `GET /api/v1/me` | any | | The key's user, brand (personal or workspace and role), plan and scopes |
| `GET /api/v1/voice` | read | | Measured voice traits, language, and instructions to write toward it |
| `POST /api/v1/voice/check` | read | `{ text }` up to 20,000 chars | Score 0 to 100, drifting lines and why, machine-sounding phrases |
| `POST /api/v1/grade` | generate | `{ text, platform? }` up to 4,000 chars | Five-dimension grade of the opening, the weakest part, one rewrite |
| `GET /api/v1/stories?q=&limit=` | read | | True stories, metrics and opinions from the Story Bank |
| `POST /api/v1/stories` | write | `{ title, body, kind?, occurred_on? }` | The saved story |
| `GET /api/v1/ideas` | read | | The ranked idea queue |
| `GET /api/v1/drafts?status=&limit=` | read | | Recent drafts with links |
| `POST /api/v1/drafts` | generate (+ write if saved) | `{ angle, platform, kind?, save? }` | A draft in the person's voice, plus `missing_facts` |

`platform` is one of `x`, `linkedin`, `threads`, `bluesky`, `instagram`, `newsletter`. `kind` is `post`, `thread` or `carousel`. With `save: false` the draft is returned and not stored.

### Example

```bash
curl -s https://<app>/api/v1/drafts \
  -H "Authorization: Bearer $FORGE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"angle":"What we learned shipping our first brand collab","platform":"linkedin","save":false}'
```

```json
{
  "saved": false,
  "platform": "LinkedIn",
  "text": "...",
  "segments": [],
  "missing_facts": ["the brand's name", "the conversion rate"]
}
```

`missing_facts` matters: Forge never invents a number or a story. When the Story Bank does not hold a fact the post needs, the draft contains a `[bracket]` and the fact is listed here, so your UI can ask the creator for it.

## 4. MCP reference

Streamable HTTP, stateless. `POST` one JSON-RPC message (or a batch of up to 20 for older clients). `GET` returns 405. Same bearer key and scopes as REST.

| Tool | Scope | Purpose |
| --- | --- | --- |
| `get_voice` | read | Call before drafting anything in the person's name |
| `check_voice` | read | Score text against the person's voice |
| `grade_opening` | generate | Grade a post's opening |
| `search_stories` | read | The only allowed source of specifics |
| `save_story` | write | Save something true the person just said |
| `list_ideas` | read | The idea queue |
| `list_drafts` | read | Recent drafts |
| `draft_post` | generate | Write a post in their voice |

Connect from any MCP client by adding the server URL and the header `Authorization: Bearer fx_...`.

## 5. Where the data comes from

This needs to be stated plainly for any partner's security and legal review:

- **Forge does not scrape logged-in pages and does not use proxy or burner accounts.**
- X data is read through the **official X API v2** with Forge's app bearer token. Nothing is posted to X by Forge; the browser extension fills X's composer and the person presses Post.
- LinkedIn and Threads use their **official OAuth APIs** with the person's consent. Bluesky uses an app password the person creates.
- Link previews read only public Open Graph and meta tags, through an SSRF-safe fetcher that blocks private and internal addresses (`lib/forge/net.ts`).
- GitHub, Linear, Notion and calendar sources use **read-only** credentials the person creates, encrypted at rest (AES-256-GCM).
- Every table has row level security. A user or key can only reach its own rows or its workspace's rows.

## 6. A suggested pilot integration

The simplest useful shape, with what exists and what does not:

```
Infloso creator app
   |  creator taps "Write this in my voice"
   v
Infloso backend  ---- REST /api/v1/drafts (save:false) ---->  Forge
   |                  REST /api/v1/voice/check                  |
   |  <---------------- text + missing_facts -------------------|
   v
Infloso UI asks the creator for missing facts, creator posts
```

| Need for a 50,000-user pilot | Status |
| --- | --- |
| Per-user voice, Story Bank, drafting, grading over API | **Exists** |
| Per-user API keys created by each user in Forge's UI | **Exists**, but not practical for 50,000 people |
| Partner-level provisioning: create Forge users and keys from Infloso's backend, single sign-on from Infloso accounts | **To build.** Estimate 1 to 2 weeks: a partner key, a `POST /api/partner/users` endpoint, an OIDC or signed-JWT login, and a partner id on usage events for the revenue split |
| Usage reporting per partner for the revenue split | **To build.** `usage_events` and `product_events` already record per-user usage; a partner column and a monthly report are needed |
| Rate limits sized for a partner | **To build.** Today's limit is per key (600 per hour). A partner tier with its own budget is a small change in `public-api.ts` |
| Load and cost testing at 50,000 users | **Not done.** See [AUDIT.md](./AUDIT.md), recommendations |
| Team SSO (SAML) for agencies | **Exists** through Supabase Auth |

## 7. Support contacts

Technical questions during the pilot: the original author, Shaurya Verma (SHV Groups). Security issues: report privately to the same contact, not in a public issue.
