-- 0124  Error reporting in the browser (slice 6, monitoring).
--
-- When a screen breaks for somebody, the app should say so. Today it does not:
-- `ErrorBoundary` writes to the browser console and asks the person to tell the
-- administrator, which is a step most people never take, and the console is a
-- place nobody looks.
--
-- Two kinds of failure, and the second is the common one:
--
--   · a **render** crash — React stops drawing the screen. That is what the
--     error boundary catches, and it is what the 9 September blank page was.
--   · a failed **load** — a query that comes back with an error. It never
--     reaches the boundary at all, because TanStack Query catches it and the
--     screen renders a red line instead. Every one of those has been invisible.
--
-- Shaped after `activity_log` (0101), which is this repository's model for an
-- append-only log: no insert grant on the table, one SECURITY DEFINER writer,
-- read for the company and the master administrator, and no audit triggers,
-- because a log wants neither `updated_at` nor `created_by`.
--
-- A table of its own rather than activity_log rows: an error wants columns that
-- table has not got, and a crash arriving a thousand times must not drown the
-- activity feed the CRM reads.
--
-- Not behind a feature switch. This is plumbing, not something to try out.

-- ===========================================================================
-- 1. The table
-- ===========================================================================

create table if not exists public.error_reports (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  -- Null only if the session went away between the failure and the report.
  user_id       uuid,
  kind          text not null
    constraint error_reports_kind_known check (kind in ('render', 'load')),
  -- The route, not the full URL: an id in the path is enough to find the job
  -- and a query string could carry anything.
  path          text not null default '',
  message       text not null,
  -- The component stack for a render crash; for a load, which query failed.
  detail        text,
  user_agent    text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  times_seen    integer not null default 1
);

comment on table public.error_reports is
  'What broke, for whom, and how often. Append-only: written only through
   app.report_error, which collapses repeats rather than recording each one.
   Rows delete themselves after 90 days.';

comment on column public.error_reports.message is
  'The error''s own words, truncated. It can quote a value that caused the
   failure, so the terms page says this is kept; it is not scrubbed, because
   scrubbing an arbitrary message gives false confidence rather than privacy.';

create index if not exists error_reports_company_idx
  on public.error_reports (company_id, last_seen_at desc);

-- What "the same error again" means, and what makes the collapse cheap.
create unique index if not exists error_reports_same_idx
  on public.error_reports (company_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, path, md5(message));

-- ===========================================================================
-- 2. The one way to write it
-- ===========================================================================

-- Beyond this many distinct reports from one person in an hour, stop writing.
-- A loop that reports on every render must not be able to fill the table, and
-- being unable to record an error is never worth an outage.
-- The parameters are prefixed because the table's columns are called `kind`,
-- `path` and `message` too, and inside the insert below Postgres cannot tell
-- which one is meant. The public wrapper keeps the plain names, because those
-- are what the browser sends.
create or replace function app.report_error(
  in_kind text,
  in_path text default '',
  in_message text default '',
  in_detail text default null,
  in_agent text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company uuid := app.current_company_id();
  who            uuid := auth.uid();
  recent         integer;
  row_id         uuid;
  cap constant integer := 20;
begin
  if target_company is null then return null; end if;
  if in_kind not in ('render', 'load') then return null; end if;
  if coalesce(btrim(in_message), '') = '' then return null; end if;

  -- Is this one we have already seen? A repeat is one row being counted, so it
  -- is never capped — capping it would lose the count that makes a flood
  -- legible. The cap is for *distinct* faults, which is what fills a table.
  select r.id into row_id
    from public.error_reports r
   where r.company_id = target_company
     and r.user_id is not distinct from who
     and r.kind = in_kind
     and r.path = left(coalesce(in_path, ''), 200)
     and md5(r.message) = md5(left(in_message, 500));

  if row_id is null then
    select count(*) into recent
      from public.error_reports r
     where r.company_id = target_company
       and r.user_id is not distinct from who
       and r.first_seen_at > now() - interval '1 hour';
    if recent >= cap then return null; end if;
  end if;

  insert into public.error_reports
    (company_id, user_id, kind, path, message, detail, user_agent)
  values (
    target_company, who, in_kind,
    left(coalesce(in_path, ''), 200),
    left(in_message, 500),
    left(in_detail, 2000),
    left(in_agent, 300))
  on conflict (company_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, path, md5(message))
  do update set
    times_seen   = error_reports.times_seen + 1,
    last_seen_at = now(),
    -- Keep the newest stack: the oldest is rarely the informative one.
    detail       = coalesce(excluded.detail, error_reports.detail)
  returning id into row_id;

  -- Sweep this company's old rows while we are here, so there is no scheduled
  -- job to own and the table cannot grow for ever.
  delete from public.error_reports
   where company_id = target_company
     and last_seen_at < now() - interval '90 days';

  return row_id;
end;
$$;

comment on function app.report_error(text, text, text, text, text) is
  'Record that a screen broke. Collapses a repeat within the same company, person,
   kind, route and message into a count; refuses quietly past 20 distinct reports
   an hour from one person; returns null rather than raising, because failing to
   report an error must never itself break a screen.';

-- ===========================================================================
-- 3. What the screen reads
-- ===========================================================================

create or replace view public.v_error_reports
with (security_invoker = true) as
  select r.id,
         r.company_id,
         c.name as company_name,
         r.user_id,
         p.full_name,
         r.kind,
         r.path,
         r.message,
         r.detail,
         r.user_agent,
         r.first_seen_at,
         r.last_seen_at,
         r.times_seen
    from public.error_reports r
    join public.companies c on c.id = r.company_id
    left join public.profiles p on p.id = r.user_id;

comment on view public.v_error_reports is
  'Error reports with the company and the person named. Row-level security on
   the table underneath decides which rows come back.';

-- ===========================================================================
-- 4. Row-level security and grants
-- ===========================================================================

alter table public.error_reports enable row level security;

-- Read by an administrator of the company it happened to, and by the master
-- administrator. An engineer does not need to read the log of their own
-- mistakes, and an external company's failures are still their own business.
drop policy if exists error_reports_read on public.error_reports;
create policy error_reports_read on public.error_reports for select to authenticated
  using ((company_id = app.current_company_id() and app.has_role('company_admin'))
         or app.is_master_admin());

-- No insert policy and no insert grant, on purpose: rows arrive through
-- app.report_error, which is what makes this a log rather than a table.
grant select on public.error_reports to authenticated;
grant select on public.v_error_reports to authenticated;

-- ===========================================================================
-- 5. Wrappers and grants (the 0005 pattern)
-- ===========================================================================

create or replace function public.report_error(
  kind text, path text default '', message text default '',
  detail text default null, user_agent text default null)
returns uuid language sql security invoker as $$
  select app.report_error(kind, path, message, detail, user_agent)
$$;

grant execute on function app.report_error(text, text, text, text, text)    to authenticated;
grant execute on function public.report_error(text, text, text, text, text) to authenticated;
revoke execute on all functions in schema public from anon;
