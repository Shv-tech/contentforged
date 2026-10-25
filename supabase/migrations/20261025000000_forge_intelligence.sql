-- =============================================================================
-- FORGE INTELLIGENCE LAYER
--
-- Adds the data model behind drafts, the Story Bank, the voice fingerprint,
-- edit learning, post results, the Playbook, X intelligence, platform
-- connections, client workspaces and the browser extension.
--
-- Additive only. No existing table is dropped or rewritten; existing tables
-- gain nullable columns. Safe to run on a live database, and idempotent, so it
-- can be re-run after a partial failure.
--
-- Ownership model: every user-owned row carries user_id and is protected by an
-- owner-only RLS policy. Tables written exclusively by server jobs (caches,
-- aggregates, audit logs) have RLS enabled with no policies, which makes them
-- reachable only through the service-role client.
-- =============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- Shared trigger: keeps updated_at honest without trusting the client.
create or replace function public.forge_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. EXISTING TABLES: new columns
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists niche text,
  add column if not exists x_handle text,
  add column if not exists x_user_id text,
  add column if not exists onboarded_at timestamptz,
  add column if not exists share_anonymous_insights boolean not null default false,
  add column if not exists active_workspace_id uuid;

comment on column public.profiles.share_anonymous_insights is
  'Opt-in. When true, this user''s posted drafts and their results contribute, anonymised and aggregated, to niche intelligence.';

alter table public.chat_sessions
  add column if not exists campaign_id uuid,
  add column if not exists workspace_id uuid,
  add column if not exists last_message_at timestamptz default now();

-- People who were already using Forge before onboarding existed are not
-- sent through it: anyone with a conversation counts as onboarded.
update public.profiles p
set onboarded_at = now()
where p.onboarded_at is null
  and exists (select 1 from public.chat_sessions s where s.user_id = p.id);

-- Adding the column with a default stamps every existing row with the time
-- of the migration, which would shuffle Recents into arbitrary order. Backfill
-- from the newest message in each session, or the session's own creation
-- time when it has none.
update public.chat_sessions s
set last_message_at = coalesce(
  (select max(m.created_at) from public.chat_messages m where m.session_id = s.id),
  s.created_at
);

-- Recents are ordered by activity, not creation. A session created long ago
-- but used today belongs at the top.
create index if not exists chat_sessions_user_activity_idx
  on public.chat_sessions (user_id, last_message_at desc);

alter table public.calendar_events
  add column if not exists draft_id uuid;

-- -----------------------------------------------------------------------------
-- 2. CLIENT WORKSPACES (Agency)
--
-- A workspace is a separate brand: its own Brand DNA, Story Bank, voice and
-- drafts. Rows with workspace_id = null belong to the user's personal brand.
-- -----------------------------------------------------------------------------

create table if not exists public.workspaces (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  brand_dna text,
  client_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspaces_owner_idx on public.workspaces (owner_id, created_at);

drop trigger if exists workspaces_touch on public.workspaces;
create trigger workspaces_touch before update on public.workspaces
  for each row execute function public.forge_touch_updated_at();

alter table public.workspaces enable row level security;
drop policy if exists "workspaces_owner_all" on public.workspaces;
create policy "workspaces_owner_all" on public.workspaces
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 3. CAMPAIGNS
-- -----------------------------------------------------------------------------

create table if not exists public.campaigns (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  goal text,
  starts_on date,
  ends_on date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_dates_ordered check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index if not exists campaigns_user_idx on public.campaigns (user_id, created_at desc);

drop trigger if exists campaigns_touch on public.campaigns;
create trigger campaigns_touch before update on public.campaigns
  for each row execute function public.forge_touch_updated_at();

alter table public.campaigns enable row level security;
drop policy if exists "campaigns_owner_all" on public.campaigns;
create policy "campaigns_owner_all" on public.campaigns
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 4. STORY BANK
--
-- The user's real facts. Drafts may only state personal facts that trace back
-- to a row here; anything else is written as a [bracket] for the user to fill.
-- -----------------------------------------------------------------------------

create table if not exists public.story_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  kind text not null default 'story'
    check (kind in ('story', 'metric', 'win', 'failure', 'opinion', 'fact')),
  title text not null check (char_length(title) between 1 and 140),
  body text not null check (char_length(body) between 1 and 4000),
  occurred_on date,
  tags text[] not null default '{}',
  source text not null default 'manual' check (source in ('manual', 'chat', 'import', 'onboarding')),
  use_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists story_items_user_idx on public.story_items (user_id, workspace_id, updated_at desc);
create index if not exists story_items_search_idx on public.story_items
  using gin (to_tsvector('english', title || ' ' || body));

drop trigger if exists story_items_touch on public.story_items;
create trigger story_items_touch before update on public.story_items
  for each row execute function public.forge_touch_updated_at();

alter table public.story_items enable row level security;
drop policy if exists "story_items_owner_all" on public.story_items;
create policy "story_items_owner_all" on public.story_items
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 5. VOICE
-- -----------------------------------------------------------------------------

create table if not exists public.voice_samples (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  platform text not null default 'x' check (platform in ('x', 'linkedin', 'threads', 'bluesky', 'newsletter', 'other')),
  body text not null check (char_length(body) between 1 and 10000),
  external_id text,
  posted_at timestamptz,
  source text not null default 'paste' check (source in ('paste', 'x_import', 'upload', 'posted_draft')),
  created_at timestamptz not null default now()
);

create index if not exists voice_samples_user_idx on public.voice_samples (user_id, workspace_id, created_at desc);
create unique index if not exists voice_samples_external_uidx
  on public.voice_samples (user_id, platform, external_id) where external_id is not null;

alter table public.voice_samples enable row level security;
drop policy if exists "voice_samples_owner_all" on public.voice_samples;
create policy "voice_samples_owner_all" on public.voice_samples
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- One fingerprint per (user, workspace). A null workspace is the personal
-- brand, which a plain unique constraint cannot express, hence coalesce.
create table if not exists public.voice_fingerprints (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  profile jsonb not null,
  traits text[] not null default '{}',
  sample_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists voice_fingerprints_scope_uidx
  on public.voice_fingerprints (user_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.voice_fingerprints enable row level security;
drop policy if exists "voice_fingerprints_owner_all" on public.voice_fingerprints;
create policy "voice_fingerprints_owner_all" on public.voice_fingerprints
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 6. DRAFTS
-- -----------------------------------------------------------------------------

create table if not exists public.drafts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- cascade, not set null: a client's drafts must never fall back into the
  -- owner's personal brand when the client workspace is deleted.
  workspace_id uuid references public.workspaces (id) on delete cascade,
  session_id uuid references public.chat_sessions (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  parent_draft_id uuid references public.drafts (id) on delete set null,
  platform text not null check (platform in ('x', 'linkedin', 'threads', 'bluesky', 'instagram', 'newsletter')),
  kind text not null default 'post' check (kind in ('post', 'thread', 'carousel')),
  title text,
  body text not null default '',
  segments text[] not null default '{}',
  notes text,
  grade jsonb,
  voice_score smallint check (voice_score between 0 and 100),
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'posted', 'archived')),
  scheduled_for timestamptz,
  -- Publish at scheduled_for through the connected account, instead of only
  -- reminding. Only honoured for platforms with a stored connection.
  auto_publish boolean not null default false,
  publish_error text,
  calendar_event_id uuid,
  posted_at timestamptz,
  post_url text,
  external_id text,
  approval_status text check (approval_status in ('pending', 'approved', 'changes_requested')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists drafts_user_idx on public.drafts (user_id, updated_at desc);
create index if not exists drafts_user_status_idx on public.drafts (user_id, status, posted_at desc);
create index if not exists drafts_session_idx on public.drafts (session_id);
create index if not exists drafts_external_idx on public.drafts (platform, external_id) where external_id is not null;

drop trigger if exists drafts_touch on public.drafts;
create trigger drafts_touch before update on public.drafts
  for each row execute function public.forge_touch_updated_at();

alter table public.drafts enable row level security;
drop policy if exists "drafts_owner_all" on public.drafts;
create policy "drafts_owner_all" on public.drafts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Edits the user made to a draft before it went out. The raw material for
-- edit-diff learning.
create table if not exists public.draft_edits (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  draft_id uuid not null references public.drafts (id) on delete cascade,
  before_text text not null,
  after_text text not null,
  signals jsonb not null default '{}'::jsonb,
  origin text not null default 'user' check (origin in ('user', 'assist')),
  created_at timestamptz not null default now()
);

create index if not exists draft_edits_user_idx on public.draft_edits (user_id, created_at desc);

alter table public.draft_edits enable row level security;
drop policy if exists "draft_edits_owner_all" on public.draft_edits;
create policy "draft_edits_owner_all" on public.draft_edits
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Writing rules Forge applies to every generation: accepted suggestions from
-- edit learning and preferences the user stated in chat.
create table if not exists public.learned_rules (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  rule text not null check (char_length(rule) between 3 and 280),
  kind text not null default 'preference'
    check (kind in ('preference', 'banned_phrase', 'structure', 'format')),
  signal_key text,
  evidence_count integer not null default 0,
  status text not null default 'accepted' check (status in ('suggested', 'accepted', 'rejected')),
  source text not null default 'chat' check (source in ('chat', 'edits', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learned_rules_user_idx on public.learned_rules (user_id, status);
-- Not partial: PostgREST upserts need a plain unique index to target, and
-- unique indexes already treat NULLs as distinct, so rules without a signal
-- key never collide.
create unique index if not exists learned_rules_signal_uidx
  on public.learned_rules (user_id, signal_key);

drop trigger if exists learned_rules_touch on public.learned_rules;
create trigger learned_rules_touch before update on public.learned_rules
  for each row execute function public.forge_touch_updated_at();

alter table public.learned_rules enable row level security;
drop policy if exists "learned_rules_owner_all" on public.learned_rules;
create policy "learned_rules_owner_all" on public.learned_rules
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 7. POST RESULTS
-- -----------------------------------------------------------------------------

create table if not exists public.post_metrics (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  draft_id uuid not null references public.drafts (id) on delete cascade,
  platform text not null,
  checkpoint text not null check (checkpoint in ('1h', '24h', '7d', 'manual')),
  impressions integer check (impressions >= 0),
  likes integer check (likes >= 0),
  replies integer check (replies >= 0),
  reposts integer check (reposts >= 0),
  quotes integer check (quotes >= 0),
  bookmarks integer check (bookmarks >= 0),
  clicks integer check (clicks >= 0),
  followers_gained integer,
  source text not null default 'manual' check (source in ('manual', 'screenshot', 'x_api', 'bluesky', 'threads', 'linkedin')),
  raw jsonb,
  captured_at timestamptz not null default now()
);

create index if not exists post_metrics_draft_idx on public.post_metrics (draft_id, captured_at desc);
create index if not exists post_metrics_user_idx on public.post_metrics (user_id, captured_at desc);
-- One row per checkpoint per draft. A manual entry is replaced when the user
-- corrects it, so 'manual' is unique too.
create unique index if not exists post_metrics_checkpoint_uidx
  on public.post_metrics (draft_id, checkpoint);

alter table public.post_metrics enable row level security;
drop policy if exists "post_metrics_owner_all" on public.post_metrics;
create policy "post_metrics_owner_all" on public.post_metrics
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 8. X INTELLIGENCE
-- -----------------------------------------------------------------------------

create table if not exists public.watch_accounts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default 'x' check (platform in ('x')),
  handle text not null check (handle ~ '^[A-Za-z0-9_]{1,15}$'),
  external_user_id text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create unique index if not exists watch_accounts_user_handle_uidx
  on public.watch_accounts (user_id, platform, lower(handle));

alter table public.watch_accounts enable row level security;
drop policy if exists "watch_accounts_owner_all" on public.watch_accounts;
create policy "watch_accounts_owner_all" on public.watch_accounts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Shared, server-only cache for paid upstream reads (X API, web search) and
-- model summaries of them. Shared on purpose: two users in the same niche
-- asking for the same pulse within the TTL cost one upstream call.
create table if not exists public.forge_cache (
  key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists forge_cache_expiry_idx on public.forge_cache (expires_at);
alter table public.forge_cache enable row level security;

-- Public X profile audits. Readable by anyone holding the id (share links),
-- written only by the server.
create table if not exists public.profile_audits (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users (id) on delete set null,
  platform text not null default 'x',
  handle text not null,
  report jsonb not null,
  requester_hash text,
  created_at timestamptz not null default now()
);

create index if not exists profile_audits_handle_idx on public.profile_audits (lower(handle), created_at desc);
alter table public.profile_audits enable row level security;

-- Shareable grade cards. Public by id, written only by the server.
create table if not exists public.grade_cards (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users (id) on delete set null,
  hook text not null check (char_length(hook) between 1 and 600),
  score smallint not null check (score between 0 and 50),
  verdict text not null,
  breakdown jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.grade_cards enable row level security;

-- Aggregated, anonymised niche patterns. No user ids; rows exist only where
-- the k-anonymity floor in the aggregation job was met.
create table if not exists public.niche_signals (
  id uuid primary key default uuid_generate_v4(),
  niche text not null,
  dimension text not null,
  bucket text not null,
  contributor_count integer not null,
  post_count integer not null,
  median_engagement numeric not null,
  lift numeric not null,
  window_start date not null,
  window_end date not null,
  computed_at timestamptz not null default now()
);

create unique index if not exists niche_signals_uidx
  on public.niche_signals (niche, dimension, bucket, window_end);
alter table public.niche_signals enable row level security;
drop policy if exists "niche_signals_read" on public.niche_signals;
create policy "niche_signals_read" on public.niche_signals
  for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- 9. PLATFORM CONNECTIONS
--
-- Tokens are encrypted by the application (AES-256-GCM, FORGE_ENCRYPTION_KEY)
-- before they reach this table. RLS has no policies: only the service role
-- reads them, so a compromised browser session cannot exfiltrate a token.
-- -----------------------------------------------------------------------------

create table if not exists public.platform_connections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Null for the personal brand. A client workspace connects the client's
  -- own accounts, so an agency never posts a client's draft as itself.
  workspace_id uuid references public.workspaces (id) on delete cascade,
  platform text not null check (platform in ('linkedin', 'threads', 'bluesky')),
  account_id text not null,
  account_handle text,
  account_name text,
  access_token_enc text not null,
  refresh_token_enc text,
  secret_enc text,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists platform_connections_uidx
  on public.platform_connections (user_id, platform, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid));

drop trigger if exists platform_connections_touch on public.platform_connections;
create trigger platform_connections_touch before update on public.platform_connections
  for each row execute function public.forge_touch_updated_at();

alter table public.platform_connections enable row level security;

-- One-time OAuth state values (CSRF protection for connect flows).
create table if not exists public.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  platform text not null,
  code_verifier text,
  -- Where to send the user after the provider redirects back.
  return_to text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.oauth_states enable row level security;

-- -----------------------------------------------------------------------------
-- 10. APPROVAL LINKS (client sign-off)
-- -----------------------------------------------------------------------------

create table if not exists public.approval_requests (
  id uuid primary key default uuid_generate_v4(),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  user_id uuid not null references auth.users (id) on delete cascade,
  draft_id uuid not null references public.drafts (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested')),
  client_comment text check (client_comment is null or char_length(client_comment) <= 2000),
  snapshot_body text not null,
  decided_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

create index if not exists approval_requests_draft_idx on public.approval_requests (draft_id, created_at desc);

alter table public.approval_requests enable row level security;
drop policy if exists "approval_requests_owner_read" on public.approval_requests;
create policy "approval_requests_owner_read" on public.approval_requests
  for select to authenticated using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 11. BROWSER EXTENSION TOKENS
--
-- Only a SHA-256 hash of the token is stored. The plaintext is shown once at
-- creation and cannot be recovered.
-- -----------------------------------------------------------------------------

create table if not exists public.extension_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default 'Chrome extension',
  token_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists extension_tokens_user_idx on public.extension_tokens (user_id);

alter table public.extension_tokens enable row level security;
drop policy if exists "extension_tokens_owner_read" on public.extension_tokens;
create policy "extension_tokens_owner_read" on public.extension_tokens
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "extension_tokens_owner_revoke" on public.extension_tokens;
create policy "extension_tokens_owner_revoke" on public.extension_tokens
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 12. FREE PLAN ALLOWANCE
--
-- Raises the free window so a new user can try drafting and grading before
-- hitting a wall. Must mirror PLANS.free.limits in lib/billing/plans.ts.
-- Guarded: plan_limits is managed outside this file, so the update only runs
-- when the expected columns exist.
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'plan_limits' and column_name = 'window_budget_micros'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'plan_limits' and column_name = 'monthly_budget_micros'
  ) then
    execute $sql$
      update public.plan_limits
      set window_budget_micros = 100000, monthly_budget_micros = 400000
      where plan_id::text = 'free'
    $sql$;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 13. SCHEDULED JOBS (Supabase pg_cron + pg_net)
--
-- Run once, after replacing <APP_URL> and <CRON_SECRET>. Kept commented
-- because secrets do not belong in a migration file.
--
-- select cron.schedule('forge-publish-scheduled', '*/5 * * * *', $$
--   select net.http_get(
--     url := '<APP_URL>/api/cron/publish-scheduled',
--     headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
--   );
-- $$);
--
-- select cron.schedule('forge-post-metrics', '*/30 * * * *', $$
--   select net.http_get(
--     url := '<APP_URL>/api/cron/post-metrics',
--     headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
--   );
-- $$);
--
-- select cron.schedule('forge-niche-insights', '15 3 * * *', $$
--   select net.http_get(
--     url := '<APP_URL>/api/cron/niche-insights',
--     headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
--   );
-- $$);
--
-- select cron.schedule('forge-competitor-digest', '0 4 * * 1', $$
--   select net.http_get(
--     url := '<APP_URL>/api/cron/competitor-digest',
--     headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
--   );
-- $$);
--
-- select cron.schedule('forge-cache-sweep', '45 * * * *', $$
--   delete from public.forge_cache where expires_at < now() - interval '1 day';
--   delete from public.oauth_states where expires_at < now();
-- $$);
-- -----------------------------------------------------------------------------
