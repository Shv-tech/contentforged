-- =============================================================================
-- FORGE PLATFORM
--
-- The data model behind three updates:
--
--   1. The ten-minute week: captures (voice notes, email-in, shared links,
--      connected sources, interviews), story proposals, the idea queue, the
--      weekly plan, brand kits for rendered visuals, repurposing lineage,
--      push subscriptions and product events.
--   2. The learning system: predictions, experiments, short links and goal
--      events, the comment inbox, client reports, writing language.
--   3. The platform: workspace members and invites, draft comments, version
--      history, an audit trail, live-editing channel authorisation, API
--      keys, shared formats.
--
-- Additive and idempotent, like 20261025000000_forge_intelligence.sql. Run
-- that one first.
--
-- SHARING MODEL
--
-- Until now every row was visible to its user_id alone. A workspace can now
-- have members, so rows that carry a workspace_id are visible to everyone in
-- that workspace and writable by its owner and editors. Rows with a null
-- workspace_id (the personal brand) stay private to their user_id. The
-- decision lives in three SECURITY DEFINER functions so every policy asks the
-- same question the same way.
-- =============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. MEMBERSHIP
-- -----------------------------------------------------------------------------

alter table public.workspaces
  add column if not exists kind text not null default 'client',
  add column if not exists writing_language text not null default 'en';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workspaces_kind_check') then
    alter table public.workspaces add constraint workspaces_kind_check check (kind in ('client', 'company'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workspaces_writing_language_check') then
    alter table public.workspaces add constraint workspaces_writing_language_check check (writing_language in ('en', 'hi', 'hinglish'));
  end if;
end;
$$;

comment on column public.workspaces.kind is
  'client: one brand voice that every member writes in (an agency client). company: brand rules shared, each member writes in their own measured voice.';

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('editor', 'reviewer', 'client')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx on public.workspace_members (user_id);

create table if not exists public.workspace_invites (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  role text not null check (role in ('editor', 'reviewer', 'client')),
  -- Only the SHA-256 of the token is stored; the link carries the token.
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists workspace_invites_workspace_idx on public.workspace_invites (workspace_id, created_at desc);

-- The caller's role in a workspace: 'owner', 'editor', 'reviewer', 'client',
-- or null. SECURITY DEFINER so policies on member tables can ask without
-- recursing into those tables' own policies.
create or replace function public.forge_workspace_role(p_workspace uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_workspace is null then null
    when exists (select 1 from public.workspaces w where w.id = p_workspace and w.owner_id = auth.uid()) then 'owner'
    else (select m.role from public.workspace_members m where m.workspace_id = p_workspace and m.user_id = auth.uid())
  end
$$;

create or replace function public.forge_can_read(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.forge_workspace_role(p_workspace) is not null
$$;

create or replace function public.forge_can_write(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.forge_workspace_role(p_workspace) in ('owner', 'editor'), false)
$$;

revoke all on function public.forge_workspace_role(uuid) from public;
revoke all on function public.forge_can_read(uuid) from public;
revoke all on function public.forge_can_write(uuid) from public;
grant execute on function public.forge_workspace_role(uuid) to authenticated;
grant execute on function public.forge_can_read(uuid) to authenticated;
grant execute on function public.forge_can_write(uuid) to authenticated;

alter table public.workspace_members enable row level security;
drop policy if exists "workspace_members_read" on public.workspace_members;
create policy "workspace_members_read" on public.workspace_members
  for select to authenticated using (user_id = auth.uid() or public.forge_can_read(workspace_id));

alter table public.workspace_invites enable row level security;
drop policy if exists "workspace_invites_read" on public.workspace_invites;
create policy "workspace_invites_read" on public.workspace_invites
  for select to authenticated using (public.forge_workspace_role(workspace_id) in ('owner', 'editor'));

-- Members can see the workspaces they belong to.
drop policy if exists "workspaces_member_read" on public.workspaces;
create policy "workspaces_member_read" on public.workspaces
  for select to authenticated using (public.forge_can_read(id));

-- Shared policies for every table that carries (user_id, workspace_id).
-- Inserting requires acting as yourself; updating and deleting a shared row
-- requires write access to its workspace.
create or replace function public.forge_apply_scoped_policies(p_table text)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format('drop policy if exists %I on public.%I', p_table || '_owner_all', p_table);
  execute format('drop policy if exists %I on public.%I', p_table || '_read', p_table);
  execute format('drop policy if exists %I on public.%I', p_table || '_insert', p_table);
  execute format('drop policy if exists %I on public.%I', p_table || '_update', p_table);
  execute format('drop policy if exists %I on public.%I', p_table || '_delete', p_table);

  execute format(
    'create policy %I on public.%I for select to authenticated using ((workspace_id is null and user_id = auth.uid()) or (workspace_id is not null and public.forge_can_read(workspace_id)))',
    p_table || '_read', p_table
  );
  execute format(
    'create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid() and (workspace_id is null or public.forge_can_write(workspace_id)))',
    p_table || '_insert', p_table
  );
  execute format(
    'create policy %I on public.%I for update to authenticated using ((workspace_id is null and user_id = auth.uid()) or (workspace_id is not null and public.forge_can_write(workspace_id))) with check ((workspace_id is null and user_id = auth.uid()) or (workspace_id is not null and public.forge_can_write(workspace_id)))',
    p_table || '_update', p_table
  );
  execute format(
    'create policy %I on public.%I for delete to authenticated using ((workspace_id is null and user_id = auth.uid()) or (workspace_id is not null and public.forge_can_write(workspace_id)))',
    p_table || '_delete', p_table
  );
end;
$$;

select public.forge_apply_scoped_policies('story_items');
select public.forge_apply_scoped_policies('voice_samples');
select public.forge_apply_scoped_policies('voice_fingerprints');
select public.forge_apply_scoped_policies('drafts');
select public.forge_apply_scoped_policies('learned_rules');
select public.forge_apply_scoped_policies('campaigns');

-- A learned rule's signal key is unique per brand, not per user: the same
-- habit can be learned for a personal brand and for a client separately.
drop index if exists public.learned_rules_signal_uidx;
create unique index if not exists learned_rules_scope_signal_uidx
  on public.learned_rules (user_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), signal_key);

-- Results belong to a draft; whoever can see the draft can see its results,
-- and whoever can edit it can record them.
create or replace function public.forge_can_read_draft(p_draft uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.drafts d
    where d.id = p_draft
      and ((d.workspace_id is null and d.user_id = auth.uid()) or (d.workspace_id is not null and public.forge_can_read(d.workspace_id)))
  )
$$;

create or replace function public.forge_can_write_draft(p_draft uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.drafts d
    where d.id = p_draft
      and ((d.workspace_id is null and d.user_id = auth.uid()) or (d.workspace_id is not null and public.forge_can_write(d.workspace_id)))
  )
$$;

revoke all on function public.forge_can_read_draft(uuid) from public;
revoke all on function public.forge_can_write_draft(uuid) from public;
grant execute on function public.forge_can_read_draft(uuid) to authenticated;
grant execute on function public.forge_can_write_draft(uuid) to authenticated;

drop policy if exists "post_metrics_owner_all" on public.post_metrics;
drop policy if exists "post_metrics_read" on public.post_metrics;
drop policy if exists "post_metrics_write" on public.post_metrics;
create policy "post_metrics_read" on public.post_metrics
  for select to authenticated using (public.forge_can_read_draft(draft_id));
create policy "post_metrics_write" on public.post_metrics
  for all to authenticated using (public.forge_can_write_draft(draft_id)) with check (public.forge_can_write_draft(draft_id));

drop policy if exists "approval_requests_member_read" on public.approval_requests;
create policy "approval_requests_member_read" on public.approval_requests
  for select to authenticated using (workspace_id is not null and public.forge_can_read(workspace_id));

-- -----------------------------------------------------------------------------
-- 2. WRITING LANGUAGE AND PROFILE SETTINGS
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists writing_language text not null default 'en';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_writing_language_check') then
    alter table public.profiles add constraint profiles_writing_language_check check (writing_language in ('en', 'hi', 'hinglish'));
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. CAPTURE
--
-- A capture is raw material: a transcribed voice note, a forwarded email, a
-- shared link, a week of commits. Forge proposes stories from it; nothing
-- enters the Story Bank until a person keeps the proposal.
-- -----------------------------------------------------------------------------

create table if not exists public.captures (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  source text not null check (source in ('voice', 'interview', 'email', 'share', 'extension', 'manual', 'github', 'linear', 'notion', 'calendar')),
  title text check (title is null or char_length(title) <= 200),
  raw_text text not null default '' check (char_length(raw_text) <= 200000),
  -- Transcript segments: [{ "start": seconds, "end": seconds, "text": "..." }]
  segments jsonb,
  metadata jsonb not null default '{}'::jsonb,
  external_id text,
  audio_path text,
  duration_seconds numeric,
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  error text,
  proposal_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists captures_scope_idx on public.captures (user_id, workspace_id, created_at desc);
create unique index if not exists captures_external_uidx
  on public.captures (user_id, source, external_id) where external_id is not null;

drop trigger if exists captures_touch on public.captures;
create trigger captures_touch before update on public.captures
  for each row execute function public.forge_touch_updated_at();

select public.forge_apply_scoped_policies('captures');

create table if not exists public.story_proposals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  capture_id uuid not null references public.captures (id) on delete cascade,
  kind text not null default 'story' check (kind in ('story', 'metric', 'win', 'failure', 'opinion', 'fact')),
  title text not null check (char_length(title) between 1 and 140),
  body text not null check (char_length(body) between 1 and 4000),
  -- The words the proposal came from, so the person can check it is true.
  quote text check (quote is null or char_length(quote) <= 1200),
  quote_start_seconds numeric,
  occurred_on date,
  status text not null default 'pending' check (status in ('pending', 'kept', 'discarded')),
  story_id uuid references public.story_items (id) on delete set null,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists story_proposals_inbox_idx on public.story_proposals (user_id, workspace_id, status, created_at desc);
create index if not exists story_proposals_capture_idx on public.story_proposals (capture_id);

select public.forge_apply_scoped_policies('story_proposals');

alter table public.story_items
  add column if not exists capture_id uuid references public.captures (id) on delete set null,
  add column if not exists quote text,
  add column if not exists quote_start_seconds numeric;

alter table public.story_items drop constraint if exists story_items_source_check;
alter table public.story_items add constraint story_items_source_check
  check (source in ('manual', 'chat', 'import', 'onboarding', 'capture', 'interview'));

-- Email-in addresses: <local_part>@<FORGE_INBOUND_DOMAIN>.
create table if not exists public.capture_addresses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  local_part text not null unique check (local_part ~ '^[a-z0-9]{10,40}$'),
  -- Mail is accepted only from the account's own address and these.
  allowed_senders text[] not null default '{}',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists capture_addresses_user_idx on public.capture_addresses (user_id, workspace_id) where revoked_at is null;

alter table public.capture_addresses enable row level security;
drop policy if exists "capture_addresses_owner_read" on public.capture_addresses;
create policy "capture_addresses_owner_read" on public.capture_addresses
  for select to authenticated using (user_id = auth.uid());

-- Connected sources. Secrets are encrypted by the application; no client
-- policy exists, so only the service role reads this table.
create table if not exists public.source_connections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  provider text not null check (provider in ('github', 'linear', 'notion', 'calendar')),
  label text,
  config jsonb not null default '{}'::jsonb,
  secret_enc text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists source_connections_uidx
  on public.source_connections (user_id, provider, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid));

drop trigger if exists source_connections_touch on public.source_connections;
create trigger source_connections_touch before update on public.source_connections
  for each row execute function public.forge_touch_updated_at();

alter table public.source_connections enable row level security;

-- -----------------------------------------------------------------------------
-- 4. IDEAS AND REPURPOSING
-- -----------------------------------------------------------------------------

create table if not exists public.repurpose_sources (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('newsletter', 'podcast', 'video', 'article', 'post', 'notes')),
  title text not null check (char_length(title) between 1 and 200),
  url text,
  body text not null check (char_length(body) between 1 and 200000),
  created_at timestamptz not null default now()
);

create index if not exists repurpose_sources_scope_idx on public.repurpose_sources (user_id, workspace_id, created_at desc);
select public.forge_apply_scoped_policies('repurpose_sources');

create table if not exists public.ideas (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  source text not null check (source in ('capture', 'story', 'pulse', 'repost', 'reply_question', 'manual', 'format', 'experiment')),
  angle text not null check (char_length(angle) between 3 and 500),
  rationale text check (rationale is null or char_length(rationale) <= 600),
  platform text,
  story_ids uuid[] not null default '{}',
  capture_id uuid references public.captures (id) on delete set null,
  source_draft_id uuid references public.drafts (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'planned', 'drafted', 'dismissed')),
  draft_id uuid references public.drafts (id) on delete set null,
  score numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ideas_queue_idx on public.ideas (user_id, workspace_id, status, score desc, created_at desc);

drop trigger if exists ideas_touch on public.ideas;
create trigger ideas_touch before update on public.ideas
  for each row execute function public.forge_touch_updated_at();

select public.forge_apply_scoped_policies('ideas');

-- -----------------------------------------------------------------------------
-- 5. THE WEEKLY PLAN
-- -----------------------------------------------------------------------------

create table if not exists public.plan_settings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  enabled boolean not null default true,
  weekly_goal smallint not null default 3 check (weekly_goal between 1 and 14),
  platforms text[] not null default '{linkedin}',
  -- Local weekday (0 = Sunday) and hour the plan is delivered.
  delivery_weekday smallint not null default 1 check (delivery_weekday between 0 and 6),
  delivery_hour smallint not null default 7 check (delivery_hour between 0 and 23),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists plan_settings_scope_uidx
  on public.plan_settings (user_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid));

drop trigger if exists plan_settings_touch on public.plan_settings;
create trigger plan_settings_touch before update on public.plan_settings
  for each row execute function public.forge_touch_updated_at();

alter table public.plan_settings enable row level security;
drop policy if exists "plan_settings_owner_all" on public.plan_settings;
create policy "plan_settings_owner_all" on public.plan_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Everyone already onboarded gets the weekly plan with the defaults. New
-- people get their row when they finish onboarding.
insert into public.plan_settings (user_id)
select p.id from public.profiles p
where p.onboarded_at is not null
on conflict do nothing;

create table if not exists public.weekly_plans (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  week_start date not null,
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed')),
  error text,
  draft_count integer not null default 0,
  experiment_id uuid,
  notified_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists weekly_plans_scope_week_uidx
  on public.weekly_plans (user_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), week_start);

drop trigger if exists weekly_plans_touch on public.weekly_plans;
create trigger weekly_plans_touch before update on public.weekly_plans
  for each row execute function public.forge_touch_updated_at();

select public.forge_apply_scoped_policies('weekly_plans');

-- -----------------------------------------------------------------------------
-- 6. EXPERIMENTS AND FORMATS (referenced by drafts below)
-- -----------------------------------------------------------------------------

create table if not exists public.experiments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  variable text not null check (variable in ('opening', 'length', 'ending', 'daypart', 'format')),
  arm_a text not null check (char_length(arm_a) between 1 and 80),
  arm_b text not null check (char_length(arm_b) between 1 and 80),
  hypothesis text check (hypothesis is null or char_length(hypothesis) <= 400),
  target_per_arm smallint not null default 4 check (target_per_arm between 3 and 20),
  status text not null default 'running' check (status in ('running', 'complete', 'stopped')),
  result jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists experiments_one_running_uidx
  on public.experiments (user_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'running';

select public.forge_apply_scoped_policies('experiments');

create table if not exists public.formats (
  id uuid primary key default uuid_generate_v4(),
  author_id uuid references auth.users (id) on delete set null,
  title text not null check (char_length(title) between 3 and 80),
  summary text check (summary is null or char_length(summary) <= 300),
  platform text,
  -- [{ "label": "The admission", "guidance": "One line admitting..." }, ...]
  structure jsonb not null,
  example text check (example is null or char_length(example) <= 3000),
  source_draft_id uuid references public.drafts (id) on delete set null,
  visibility text not null default 'public' check (visibility in ('public', 'unlisted')),
  use_count integer not null default 0,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists formats_gallery_idx on public.formats (visibility, use_count desc, created_at desc) where removed_at is null;

drop trigger if exists formats_touch on public.formats;
create trigger formats_touch before update on public.formats
  for each row execute function public.forge_touch_updated_at();

alter table public.formats enable row level security;
drop policy if exists "formats_read" on public.formats;
create policy "formats_read" on public.formats
  for select to authenticated using (removed_at is null and (visibility = 'public' or author_id = auth.uid()));

-- Aggregated, k-anonymous results per format. Written by the niche job.
create table if not exists public.format_stats (
  format_id uuid primary key references public.formats (id) on delete cascade,
  user_count integer not null,
  post_count integer not null,
  median_relative numeric not null,
  computed_at timestamptz not null default now()
);

alter table public.format_stats enable row level security;
drop policy if exists "format_stats_read" on public.format_stats;
create policy "format_stats_read" on public.format_stats for select to authenticated using (true);

-- Atomic use counter, so two people applying a format at once both count.
create or replace function public.forge_bump_format_use(p_format_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.formats set use_count = use_count + 1 where id = p_format_id and removed_at is null;
$$;

revoke all on function public.forge_bump_format_use(uuid) from public;
grant execute on function public.forge_bump_format_use(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 7. DRAFTS: new columns
-- -----------------------------------------------------------------------------

alter table public.drafts
  add column if not exists created_by uuid references auth.users (id) on delete set null,
  add column if not exists plan_id uuid references public.weekly_plans (id) on delete set null,
  add column if not exists review_status text,
  add column if not exists idea_id uuid references public.ideas (id) on delete set null,
  add column if not exists capture_id uuid references public.captures (id) on delete set null,
  add column if not exists source_id uuid references public.repurpose_sources (id) on delete set null,
  add column if not exists experiment_id uuid references public.experiments (id) on delete set null,
  add column if not exists experiment_arm text,
  add column if not exists format_id uuid references public.formats (id) on delete set null,
  add column if not exists language text not null default 'en',
  add column if not exists visual jsonb,
  add column if not exists composer_filled_at timestamptz,
  -- The slot the weekly plan proposes; it becomes scheduled_for on approval.
  add column if not exists suggested_for timestamptz,
  add column if not exists comments_synced_at timestamptz,
  -- Live-editing state: a base64 Yjs update holding the full document.
  add column if not exists ydoc text,
  -- Which live document ydoc is. A new one is minted whenever the text is
  -- reset from outside live editing (a restore, a plain edit), so editors
  -- holding the old document reload instead of merging two histories.
  add column if not exists ydoc_epoch text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drafts_review_status_check') then
    alter table public.drafts add constraint drafts_review_status_check check (review_status is null or review_status in ('pending', 'approved', 'skipped'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'drafts_experiment_arm_check') then
    alter table public.drafts add constraint drafts_experiment_arm_check check (experiment_arm is null or experiment_arm in ('a', 'b'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'drafts_language_check') then
    alter table public.drafts add constraint drafts_language_check check (language in ('en', 'hi', 'hinglish'));
  end if;
end;
$$;

create index if not exists drafts_plan_idx on public.drafts (plan_id) where plan_id is not null;
create index if not exists drafts_workspace_idx on public.drafts (workspace_id, updated_at desc) where workspace_id is not null;
create index if not exists drafts_review_queue_idx on public.drafts (user_id, review_status, platform) where review_status = 'approved' and status <> 'posted';

alter table public.weekly_plans drop constraint if exists weekly_plans_experiment_fk;
alter table public.weekly_plans add constraint weekly_plans_experiment_fk
  foreign key (experiment_id) references public.experiments (id) on delete set null;

-- -----------------------------------------------------------------------------
-- 8. BRAND KITS (rendered visuals)
-- -----------------------------------------------------------------------------

create table if not exists public.brand_kits (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  handle text check (handle is null or char_length(handle) <= 60),
  font text not null default 'sans' check (font in ('sans', 'serif', 'mono')),
  background text not null default '#0B0B0B' check (background ~ '^#[0-9A-Fa-f]{6}$'),
  ink text not null default '#FFFFFF' check (ink ~ '^#[0-9A-Fa-f]{6}$'),
  accent text not null default '#FF8A2B' check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  headshot_path text,
  logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One kit for the personal brand, one per workspace.
create unique index if not exists brand_kits_personal_uidx on public.brand_kits (user_id) where workspace_id is null;
create unique index if not exists brand_kits_workspace_uidx on public.brand_kits (workspace_id) where workspace_id is not null;

drop trigger if exists brand_kits_touch on public.brand_kits;
create trigger brand_kits_touch before update on public.brand_kits
  for each row execute function public.forge_touch_updated_at();

select public.forge_apply_scoped_policies('brand_kits');

-- Private buckets. Uploads go through signed URLs minted by the server, and
-- reads through the service role, so no client storage policy is needed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('captures', 'captures', false, 26214400, array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'video/mp4', 'video/webm']),
  ('brand-assets', 'brand-assets', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 9. PREDICTIONS, GOALS, COMMENTS, REPORTS
-- -----------------------------------------------------------------------------

create table if not exists public.predictions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  draft_id uuid not null unique references public.drafts (id) on delete cascade,
  platform text not null,
  -- All three are relative engagement: 1.0 = the author's usual on this platform.
  expected numeric not null,
  low numeric not null,
  high numeric not null,
  basis_count integer not null,
  model text not null,
  features jsonb not null default '{}'::jsonb,
  actual numeric,
  landed boolean,
  evaluated_at timestamptz,
  -- Set once the author has been told about an unusual result, so they are told once.
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.predictions add column if not exists notified_at timestamptz;

create index if not exists predictions_scope_idx on public.predictions (user_id, workspace_id, created_at desc);
select public.forge_apply_scoped_policies('predictions');

create table if not exists public.short_links (
  code text primary key check (code ~ '^[A-Za-z0-9]{7}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  draft_id uuid references public.drafts (id) on delete set null,
  destination text not null check (char_length(destination) between 8 and 2000),
  click_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists short_links_draft_idx on public.short_links (draft_id);
select public.forge_apply_scoped_policies('short_links');

create table if not exists public.link_clicks (
  id bigint generated always as identity primary key,
  code text not null references public.short_links (code) on delete cascade,
  clicked_at timestamptz not null default now(),
  referrer_host text,
  country text
);

create index if not exists link_clicks_code_idx on public.link_clicks (code, clicked_at desc);
alter table public.link_clicks enable row level security;

-- Counting a click is one statement, so concurrent clicks never lose an update.
create or replace function public.forge_record_click(p_code text, p_referrer text, p_country text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_destination text;
begin
  update public.short_links set click_count = click_count + 1 where code = p_code returning destination into v_destination;
  if v_destination is not null then
    insert into public.link_clicks (code, referrer_host, country) values (p_code, left(p_referrer, 120), left(p_country, 8));
  end if;
  return v_destination;
end;
$$;

revoke all on function public.forge_record_click(text, text, text) from public;
grant execute on function public.forge_record_click(text, text, text) to service_role;

create table if not exists public.goal_endpoints (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  provider text not null check (provider in ('calcom', 'calendly', 'webhook')),
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{24,64}$'),
  secret_enc text,
  last_event_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists goal_endpoints_scope_uidx
  on public.goal_endpoints (user_id, provider, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.goal_endpoints enable row level security;

create table if not exists public.goal_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  endpoint_id uuid references public.goal_endpoints (id) on delete set null,
  kind text not null check (kind in ('booking', 'signup', 'purchase', 'custom')),
  provider text not null,
  external_id text,
  short_code text references public.short_links (code) on delete set null,
  draft_id uuid references public.drafts (id) on delete set null,
  value numeric,
  currency text,
  label text check (label is null or char_length(label) <= 140),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists goal_events_external_uidx
  on public.goal_events (user_id, provider, external_id) where external_id is not null;
create index if not exists goal_events_scope_idx on public.goal_events (user_id, workspace_id, occurred_at desc);
create index if not exists goal_events_draft_idx on public.goal_events (draft_id) where draft_id is not null;
select public.forge_apply_scoped_policies('goal_events');

create table if not exists public.post_comments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  draft_id uuid not null references public.drafts (id) on delete cascade,
  platform text not null,
  external_id text not null,
  author_handle text,
  author_name text,
  author_url text,
  body text not null check (char_length(body) <= 5000),
  posted_at timestamptz,
  is_question boolean not null default false,
  status text not null default 'new' check (status in ('new', 'replied', 'dismissed')),
  reply_text text check (reply_text is null or char_length(reply_text) <= 3000),
  idea_id uuid references public.ideas (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists post_comments_external_uidx on public.post_comments (draft_id, external_id);
create index if not exists post_comments_inbox_idx on public.post_comments (user_id, workspace_id, status, posted_at desc);

drop trigger if exists post_comments_touch on public.post_comments;
create trigger post_comments_touch before update on public.post_comments
  for each row execute function public.forge_touch_updated_at();

select public.forge_apply_scoped_policies('post_comments');

alter table public.ideas drop constraint if exists ideas_comment_fk;
alter table public.ideas add column if not exists comment_id uuid;
alter table public.ideas add constraint ideas_comment_fk foreign key (comment_id) references public.post_comments (id) on delete set null;

create table if not exists public.client_reports (
  id uuid primary key default uuid_generate_v4(),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  data jsonb not null,
  note text check (note is null or char_length(note) <= 2000),
  expires_at timestamptz not null default (now() + interval '120 days'),
  created_at timestamptz not null default now(),
  constraint client_reports_period_ordered check (period_end >= period_start)
);

create unique index if not exists client_reports_period_uidx on public.client_reports (workspace_id, period_start);
select public.forge_apply_scoped_policies('client_reports');

-- -----------------------------------------------------------------------------
-- 10. COLLABORATION
-- -----------------------------------------------------------------------------

create table if not exists public.draft_comments (
  id uuid primary key default uuid_generate_v4(),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid references public.draft_comments (id) on delete cascade,
  -- The quoted words a comment is pinned to, and where they were.
  anchor_text text check (anchor_text is null or char_length(anchor_text) <= 500),
  anchor_start integer,
  anchor_end integer,
  body text not null check (char_length(body) between 1 and 2000),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists draft_comments_draft_idx on public.draft_comments (draft_id, created_at);

drop trigger if exists draft_comments_touch on public.draft_comments;
create trigger draft_comments_touch before update on public.draft_comments
  for each row execute function public.forge_touch_updated_at();

alter table public.draft_comments enable row level security;
drop policy if exists "draft_comments_read" on public.draft_comments;
drop policy if exists "draft_comments_insert" on public.draft_comments;
drop policy if exists "draft_comments_update" on public.draft_comments;
drop policy if exists "draft_comments_delete" on public.draft_comments;
create policy "draft_comments_read" on public.draft_comments
  for select to authenticated using (public.forge_can_read_draft(draft_id));
-- Reviewers and clients can comment; that is most of what they are for.
create policy "draft_comments_insert" on public.draft_comments
  for insert to authenticated with check (user_id = auth.uid() and public.forge_can_read_draft(draft_id));
create policy "draft_comments_update" on public.draft_comments
  for update to authenticated
  using (user_id = auth.uid() or public.forge_can_write_draft(draft_id))
  with check (user_id = auth.uid() or public.forge_can_write_draft(draft_id));
create policy "draft_comments_delete" on public.draft_comments
  for delete to authenticated using (user_id = auth.uid());

create table if not exists public.draft_versions (
  id uuid primary key default uuid_generate_v4(),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  body text not null,
  segments text[] not null default '{}',
  reason text not null check (reason in ('edit', 'assist', 'restore', 'approval', 'plan', 'collab', 'created')),
  created_at timestamptz not null default now()
);

create index if not exists draft_versions_draft_idx on public.draft_versions (draft_id, created_at desc);

alter table public.draft_versions enable row level security;
drop policy if exists "draft_versions_read" on public.draft_versions;
create policy "draft_versions_read" on public.draft_versions
  for select to authenticated using (public.forge_can_read_draft(draft_id));

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) between 1 and 64),
  target_type text,
  target_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_workspace_idx on public.audit_events (workspace_id, created_at desc);

alter table public.audit_events enable row level security;
drop policy if exists "audit_events_read" on public.audit_events;
create policy "audit_events_read" on public.audit_events
  for select to authenticated using (public.forge_workspace_role(workspace_id) in ('owner', 'editor'));

-- Live editing runs over Supabase Realtime private channels named
-- "draft:<uuid>". Only people who can read a draft may join its channel, and
-- only people who can edit it may broadcast changes. Applied only where the
-- Realtime authorisation schema exists.
create or replace function public.forge_uuid_or_null(p_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'realtime' and table_name = 'messages') then
    execute 'drop policy if exists "forge_draft_channel_read" on realtime.messages';
    execute 'drop policy if exists "forge_draft_channel_write" on realtime.messages';
    execute $policy$
      create policy "forge_draft_channel_read" on realtime.messages
        for select to authenticated
        using (
          realtime.topic() like 'draft:%'
          and public.forge_can_read_draft(public.forge_uuid_or_null(split_part(realtime.topic(), ':', 2)))
        )
    $policy$;
    execute $policy$
      create policy "forge_draft_channel_write" on realtime.messages
        for insert to authenticated
        with check (
          realtime.topic() like 'draft:%'
          and (
            -- Edits travel as broadcasts: only people who can change the draft.
            public.forge_can_write_draft(public.forge_uuid_or_null(split_part(realtime.topic(), ':', 2)))
            -- Presence (who is looking) is open to everyone who can read it,
            -- so reviewers and clients show up beside the editors.
            or (
              realtime.messages.extension = 'presence'
              and public.forge_can_read_draft(public.forge_uuid_or_null(split_part(realtime.topic(), ':', 2)))
            )
          )
        )
    $policy$;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 11. API KEYS
--
-- The extension's personal access tokens become general access tokens: an
-- 'api' token carries scopes and may be pinned to one workspace.
-- -----------------------------------------------------------------------------

alter table public.extension_tokens
  add column if not exists kind text not null default 'extension',
  add column if not exists scopes text[] not null default '{}',
  add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade,
  add column if not exists prefix text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'extension_tokens_kind_check') then
    alter table public.extension_tokens add constraint extension_tokens_kind_check check (kind in ('extension', 'api'));
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 12. NOTIFICATIONS AND PUSH
-- -----------------------------------------------------------------------------

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan_email boolean not null default true,
  plan_push boolean not null default true,
  comments_email boolean not null default true,
  comments_push boolean not null default true,
  reports_email boolean not null default true,
  results_email boolean not null default false,
  updated_at timestamptz not null default now()
);

drop trigger if exists notification_preferences_touch on public.notification_preferences;
create trigger notification_preferences_touch before update on public.notification_preferences
  for each row execute function public.forge_touch_updated_at();

alter table public.notification_preferences enable row level security;
drop policy if exists "notification_preferences_owner_all" on public.notification_preferences;
create policy "notification_preferences_owner_all" on public.notification_preferences
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subscriptions_owner_read" on public.push_subscriptions;
create policy "push_subscriptions_owner_read" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 13. PRODUCT EVENTS
--
-- What people do, so the roadmap is checked against behaviour every week.
-- Server-written only; never readable from a browser.
-- -----------------------------------------------------------------------------

create table if not exists public.product_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  name text not null check (name ~ '^[a-z][a-z0-9_.]{1,63}$'),
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists product_events_name_idx on public.product_events (name, created_at desc);
create index if not exists product_events_user_idx on public.product_events (user_id, created_at desc);
alter table public.product_events enable row level security;

-- Aggregates for the internal insights page. Service role only: they read
-- across every account, and return counts, never rows.

create or replace function public.forge_insights_daily(p_days integer)
returns table (day date, name text, users bigint, events bigint)
language sql
stable
security definer
set search_path = public
as $$
  select (created_at at time zone 'UTC')::date as day, name, count(distinct user_id) as users, count(*) as events
  from public.product_events
  where created_at >= now() - make_interval(days => greatest(1, least(p_days, 180)))
  group by 1, 2
  order by 1, 2;
$$;

create or replace function public.forge_insights_reach(p_days integer)
returns table (name text, users bigint)
language sql
stable
security definer
set search_path = public
as $$
  select name, count(distinct user_id) as users
  from public.product_events
  where created_at >= now() - make_interval(days => greatest(1, least(p_days, 180))) and user_id is not null
  group by name;
$$;

create or replace function public.forge_insights_prop(p_days integer, p_name text, p_key text)
returns table (value text, users bigint, events bigint)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(props ->> p_key, '(none)') as value, count(distinct user_id) as users, count(*) as events
  from public.product_events
  where created_at >= now() - make_interval(days => greatest(1, least(p_days, 180))) and name = p_name
  group by 1
  order by 3 desc
  limit 100;
$$;

-- Weekly cohorts by first session, and how many came back each later week.
create or replace function public.forge_insights_retention(p_weeks integer)
returns table (cohort date, week integer, users bigint)
language sql
stable
security definer
set search_path = public
as $$
  with sessions as (
    select user_id, date_trunc('week', created_at)::date as week
    from public.product_events
    where name = 'session.started' and user_id is not null
      and created_at >= date_trunc('week', now()) - make_interval(weeks => greatest(1, least(p_weeks, 26)))
    group by 1, 2
  ),
  firsts as (
    select user_id, min(week) as cohort from sessions group by 1
  )
  select f.cohort, ((s.week - f.cohort) / 7)::integer as week, count(distinct s.user_id) as users
  from sessions s join firsts f using (user_id)
  group by 1, 2
  order by 1, 2;
$$;

revoke all on function public.forge_insights_daily(integer) from public;
revoke all on function public.forge_insights_reach(integer) from public;
revoke all on function public.forge_insights_prop(integer, text, text) from public;
revoke all on function public.forge_insights_retention(integer) from public;
grant execute on function public.forge_insights_daily(integer) to service_role;
grant execute on function public.forge_insights_reach(integer) to service_role;
grant execute on function public.forge_insights_prop(integer, text, text) to service_role;
grant execute on function public.forge_insights_retention(integer) to service_role;

-- -----------------------------------------------------------------------------
-- 14. ACCOUNT DELETION
--
-- Tables from the original schema reference auth.users without ON DELETE,
-- which makes deleting an account fail. Those references become CASCADE.
-- Only legacy tables are touched, and only when their reference has no
-- delete action.
-- -----------------------------------------------------------------------------

do $$
declare
  ref record;
  column_name text;
begin
  for ref in
    select c.conname, c.conrelid::regclass as table_name, c.conkey
    from pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.connamespace = 'public'::regnamespace
      and c.confdeltype in ('a', 'r')
      and c.conrelid::regclass::text in ('chat_sessions', 'user_context', 'device_sessions', 'ebooks', 'calendar_events', 'brand_dna_sources', 'scraped_profiles')
  loop
    select a.attname into column_name
    from pg_attribute a
    where a.attrelid = ref.table_name and a.attnum = ref.conkey[1];

    execute format('alter table %s drop constraint %I', ref.table_name, ref.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references auth.users (id) on delete cascade', ref.table_name, ref.conname, column_name);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 14b. LONG FORM
--
-- Books and guides compiled from a brand's own posts and stories land in the
-- existing ebooks table, so they open in My Ebooks with the same reader,
-- sharing and PDF export. Guarded: ebooks predates these migrations.
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.ebooks') is null then
    return;
  end if;

  alter table public.ebooks
    add column if not exists workspace_id uuid references public.workspaces (id) on delete set null,
    add column if not exists origin text not null default 'chat',
    -- Which posts, stories and sources each chapter drew on: [{ "chapter": 0, "refs": ["d:<uuid>", "s:<uuid>"] }]
    add column if not exists lineage jsonb;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ebooks' and column_name = 'session_id' and is_nullable = 'NO'
  ) then
    alter table public.ebooks alter column session_id drop not null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ebooks_origin_check') then
    alter table public.ebooks add constraint ebooks_origin_check check (origin in ('chat', 'compiled'));
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 15. SCHEDULED JOBS
--
-- Add alongside the jobs in 20261025000000_forge_intelligence.sql, after
-- replacing <APP_URL> and <CRON_SECRET>.
--
-- select cron.schedule('forge-weekly-plan', '5 * * * *', $$
--   select net.http_get(url := '<APP_URL>/api/cron/weekly-plan',
--     headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'));
-- $$);
--
-- select cron.schedule('forge-sources-sync', '20 */6 * * *', $$
--   select net.http_get(url := '<APP_URL>/api/cron/sources-sync',
--     headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'));
-- $$);
--
-- select cron.schedule('forge-comments-sync', '40 */2 * * *', $$
--   select net.http_get(url := '<APP_URL>/api/cron/comments-sync',
--     headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'));
-- $$);
--
-- select cron.schedule('forge-client-reports', '30 3 1 * *', $$
--   select net.http_get(url := '<APP_URL>/api/cron/client-reports',
--     headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'));
-- $$);
--
-- select cron.schedule('forge-events-sweep', '10 4 * * *', $$
--   delete from public.product_events where created_at < now() - interval '400 days';
--   delete from public.workspace_invites where accepted_at is null and expires_at < now() - interval '30 days';
-- $$);
-- -----------------------------------------------------------------------------
