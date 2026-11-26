-- =============================================================================
-- FORGE OPS
--
-- One table for everything the monitoring dashboard (/admin/ops) shows:
--
--   kind = 'request'   every API call Forge served: route, status, time taken,
--                      who (user id when signed in), and the error if any
--   kind = 'upstream'  calls Forge made to other services (Anthropic, X,
--                      Groq, Resend, Razorpay...), tied to the request that
--                      made them by request_id
--   kind = 'client'    errors that happened in someone's browser
--   kind = 'health'    a service check from /api/cron/ops-health
--
-- No request bodies, no post text, no query strings are stored: only names,
-- numbers and error messages. Service role only: there is no policy for
-- signed-in users, so the browser cannot read or write it directly.
--
-- Old rows are deleted by /api/cron/ops-health (OPS_RETENTION_DAYS, default
-- 14 days for normal rows, 90 for errors). Idempotent: safe to re-run.
-- =============================================================================

create table if not exists public.ops_events (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  kind         text not null check (kind in ('request', 'upstream', 'client', 'health')),
  level        text not null default 'ok' check (level in ('ok', 'warn', 'error')),
  request_id   text,
  feature      text not null default 'Other',
  name         text not null,
  method       text,
  path         text,
  status       integer,
  duration_ms  integer,
  user_id      uuid,
  message      text,
  detail       jsonb not null default '{}'::jsonb,
  weight       real not null default 1
);

create index if not exists ops_events_at_idx on public.ops_events (at desc);
create index if not exists ops_events_kind_at_idx on public.ops_events (kind, at desc);
create index if not exists ops_events_problems_idx on public.ops_events (at desc) where level <> 'ok';
create index if not exists ops_events_request_idx on public.ops_events (request_id) where request_id is not null;
create index if not exists ops_events_user_idx on public.ops_events (user_id, at desc) where user_id is not null;

alter table public.ops_events enable row level security;
revoke all on public.ops_events from anon, authenticated;

-- -----------------------------------------------------------------------------
-- ops_summary: every number on the dashboard in one round trip.
--   p_since   start of the window
--   p_bucket  width of each chart bar, for example '1 minute' or '1 hour'
-- -----------------------------------------------------------------------------
create or replace function public.ops_summary(p_since timestamptz, p_bucket interval)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with win as (
    select * from public.ops_events where at >= p_since
  ),
  req as (select * from win where kind = 'request'),
  up as (select * from win where kind = 'upstream'),
  cli as (select * from win where kind = 'client')
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'requests', coalesce(sum(weight), 0),
        'errors', coalesce(sum(weight) filter (where level = 'error'), 0),
        'warnings', coalesce(sum(weight) filter (where level = 'warn'), 0),
        'p50', percentile_cont(0.5) within group (order by duration_ms),
        'p95', percentile_cont(0.95) within group (order by duration_ms),
        'users', count(distinct user_id),
        'client_errors', (select count(*) from cli),
        'upstream_calls', (select coalesce(sum(weight), 0) from up),
        'upstream_failures', (select count(*) from up where level = 'error')
      )
      from req
    ),
    'series', coalesce((
      select jsonb_agg(row_to_json(s) order by s.bucket)
      from (
        select
          date_bin(p_bucket, at, p_since) as bucket,
          coalesce(sum(weight) filter (where kind = 'request'), 0) as requests,
          coalesce(sum(weight) filter (where kind = 'request' and level = 'error'), 0) as errors,
          coalesce(sum(weight) filter (where kind = 'request' and level = 'warn'), 0) as warnings,
          count(*) filter (where kind = 'client') as client_errors,
          count(*) filter (where kind = 'upstream' and level = 'error') as upstream_failures,
          percentile_cont(0.95) within group (order by duration_ms) filter (where kind = 'request') as p95
        from win
        where kind <> 'health'
        group by 1
      ) s
    ), '[]'::jsonb),
    'features', coalesce((
      select jsonb_agg(row_to_json(f) order by f.requests desc)
      from (
        select
          feature,
          coalesce(sum(weight), 0) as requests,
          coalesce(sum(weight) filter (where level = 'error'), 0) as errors,
          coalesce(sum(weight) filter (where level = 'warn'), 0) as warnings,
          percentile_cont(0.95) within group (order by duration_ms) as p95,
          max(at) filter (where level = 'error') as last_error_at,
          (array_agg(message order by at desc) filter (where level = 'error'))[1] as last_error
        from req
        group by feature
      ) f
    ), '[]'::jsonb),
    'feature_client_errors', coalesce((
      select jsonb_object_agg(feature, n) from (select feature, count(*) as n from cli group by feature) c
    ), '{}'::jsonb),
    'feature_series', coalesce((
      select jsonb_object_agg(feature, points)
      from (
        select feature, jsonb_agg(jsonb_build_array(bucket, requests, errors) order by bucket) as points
        from (
          select feature, date_bin(p_bucket, at, p_since) as bucket, sum(weight) as requests, coalesce(sum(weight) filter (where level = 'error'), 0) as errors
          from req group by 1, 2
        ) x
        group by feature
      ) y
    ), '{}'::jsonb),
    'routes', coalesce((
      select jsonb_agg(row_to_json(r))
      from (
        select
          name,
          feature,
          coalesce(sum(weight), 0) as requests,
          coalesce(sum(weight) filter (where level = 'error'), 0) as errors,
          coalesce(sum(weight) filter (where level = 'warn'), 0) as warnings,
          percentile_cont(0.5) within group (order by duration_ms) as p50,
          percentile_cont(0.95) within group (order by duration_ms) as p95
        from req
        group by name, feature
        order by coalesce(sum(weight) filter (where level = 'error'), 0) desc, percentile_cont(0.95) within group (order by duration_ms) desc nulls last
        limit 60
      ) r
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(row_to_json(u) order by u.calls desc)
      from (
        select
          name,
          coalesce(sum(weight), 0) as calls,
          count(*) filter (where level = 'error') as failures,
          percentile_cont(0.95) within group (order by duration_ms) as p95,
          max(at) filter (where level = 'error') as last_failure_at,
          (array_agg(message order by at desc) filter (where level = 'error'))[1] as last_failure,
          max(at) as last_call_at
        from up
        group by name
      ) u
    ), '[]'::jsonb),
    'health', coalesce((
      select jsonb_agg(row_to_json(h))
      from (
        select distinct on (name) name, at, level, duration_ms, message, detail
        from public.ops_events
        where kind = 'health' and at >= now() - interval '1 hour'
        order by name, at desc
      ) h
    ), '[]'::jsonb),
    'health_history', coalesce((
      select jsonb_object_agg(name, points)
      from (
        select name, jsonb_agg(jsonb_build_array(at, level) order by at) as points
        from public.ops_events
        where kind = 'health' and at >= greatest(p_since, now() - interval '24 hours')
        group by name
      ) hh
    ), '{}'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(row_to_json(j))
      from (
        select
          name,
          count(*) as runs,
          count(*) filter (where level = 'error') as failures,
          max(at) as last_run_at,
          (array_agg(status order by at desc))[1] as last_status,
          (array_agg(duration_ms order by at desc))[1] as last_duration_ms,
          (array_agg(message order by at desc) filter (where level = 'error'))[1] as last_error
        from public.ops_events
        where kind = 'request' and path like '/api/cron/%' and at >= now() - interval '7 days'
        group by name
      ) j
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.ops_summary(timestamptz, interval) from public, anon, authenticated;
grant execute on function public.ops_summary(timestamptz, interval) to service_role;

-- -----------------------------------------------------------------------------
-- Schedule (run once per environment, replacing <APP_URL> and <CRON_SECRET>):
--
-- select cron.schedule('forge-ops-health', '*/5 * * * *', $$
--   select net.http_get(url := '<APP_URL>/api/cron/ops-health',
--     headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'));
-- $$);
-- -----------------------------------------------------------------------------
