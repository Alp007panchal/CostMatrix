-- 0134  The master administrator switches the assistant on for another company.
--
-- Roadmap 3.7's last third: "external companies switched on per company". The
-- permission for it has existed since 0102 — `company_options_write_master`
-- lets a master administrator write any company's options, and
-- `app.protect_master_options` refuses everybody else the `ai_*` keys. What was
-- missing was on the screen: `AssistantSettingsPage` read `company.id` from the
-- session, so the only person allowed to switch the assistant on could switch it
-- on for their own company and nobody else's.
--
-- The screen is most of this change. The database's part is that two functions
-- answer for the caller's company and nothing else:
--
--   app.assistant_allowance()  (0103) — is it on, what is the budget, what is spent
--   app.assistant_usage()      (0104) — six months of turns, tokens, cost, people
--
-- Shown beside a switch for **Beta**, they would report **Alpha's** figures. A
-- wrong number next to a real decision is worse than no number, so both now take
-- the company they are asked about.
--
-- WHO MAY ASK ABOUT WHOM. Null means the caller's own company, which is what
-- every existing caller gets and why the Edge Function needs no change. Naming a
-- different company is refused unless `app.is_master_admin()`. That is the same
-- rule the options policy already applies, stated once here so a figure can
-- never leak by a company id typed into an rpc call.
--
-- WHY DROP AND RECREATE. `create or replace` cannot add a parameter, and adding
-- a defaulted one alongside would leave two candidates for `assistant_usage()`
-- and every call ambiguous. So the old pair goes and the new pair arrives, with
-- the wrappers and grants in the 0005 pattern.

drop function if exists public.assistant_usage();
drop function if exists app.assistant_usage();
drop function if exists public.assistant_allowance();
drop function if exists app.assistant_allowance();

-- Which company a reader may ask about: their own, or — for the master
-- administrator — any. Raises rather than returning null, so a caller can never
-- read a figure it did not ask for.
create or replace function app.assistant_company(for_company uuid default null)
returns uuid
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  mine uuid := app.current_company_id();
begin
  if for_company is null or for_company = mine then return mine; end if;
  if app.is_master_admin() then return for_company; end if;
  raise exception 'only the master administrator may read another company''s assistant settings';
end;
$$;

comment on function app.assistant_company(uuid) is
  'The company an assistant reading is about (0134): yours by default, another
   only for the master administrator, who is the only person who may switch the
   assistant on for a company anyway.';

create or replace function app.assistant_allowance(for_company uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with who as (select app.assistant_company(for_company) as company_id),
  usage as (
    select coalesce(sum(coalesce(m.tokens_in, 0) + coalesce(m.tokens_out, 0)), 0)::bigint as used
    from public.assistant_messages m
    join public.assistant_conversations c on c.id = m.conversation_id
    where c.company_id = (select company_id from who)
      and m.created_at >= date_trunc('month', now())
  ),
  recent as (
    select count(*)::integer as n
    from public.assistant_messages m
    join public.assistant_conversations c on c.id = m.conversation_id
    where c.user_id = auth.uid()
      and m.role = 'user'
      and m.created_at >= now() - interval '60 seconds'
  ),
  options as (
    select
      coalesce((select value from public.company_options
                 where company_id = (select company_id from who) and key = 'ai_enabled'),
               'false'::jsonb) as enabled,
      coalesce((select value from public.company_options
                 where company_id = (select company_id from who) and key = 'ai_monthly_token_budget'),
               '0'::jsonb) as budget
  )
  select jsonb_build_object(
    'company_id', (select company_id from who),
    'enabled', coalesce(o.enabled::text::boolean, false),
    'monthly_token_budget', coalesce(o.budget::text::numeric, 0),
    'used_this_month', u.used,
    'recent_requests', r.n,
    'rate_limit_per_minute', 20)
  from usage u, recent r, options o
$$;

comment on function app.assistant_allowance(uuid) is
  'Whether a company has the assistant switched on, the month''s budget and what
   has been spent of it, and how many requests this user made in the last minute.
   The Edge Function reads it with no argument, for the caller''s own company;
   the master administrator may name another (0134). The rate limit is always
   about the person asking, never about the company being looked at.';

create or replace function app.assistant_usage(for_company uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with who as (select app.assistant_company(for_company) as company_id)
  select jsonb_build_object(
    'company_id', (select company_id from who),
    'months', coalesce((
      select jsonb_agg(m order by m ->> 'month' desc) from (
        select jsonb_build_object(
          'month', to_char(date_trunc('month', msg.created_at), 'YYYY-MM'),
          'turns', count(*) filter (where msg.role = 'assistant'),
          'tokens_in', coalesce(sum(msg.tokens_in), 0),
          'tokens_out', coalesce(sum(msg.tokens_out), 0),
          'conversations', count(distinct msg.conversation_id)) as m
        from public.assistant_messages msg
        join public.assistant_conversations c on c.id = msg.conversation_id
        where c.company_id = (select company_id from who)
          and msg.created_at >= date_trunc('month', now()) - interval '5 months'
        group by date_trunc('month', msg.created_at)) x), '[]'::jsonb),
    'cost_usd_this_month', coalesce((
      select sum(c.cost_usd) from public.assistant_conversations c
      where c.company_id = (select company_id from who)
        and c.updated_at >= date_trunc('month', now())), 0),
    'by_user_this_month', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', u.user_id, 'name', pr.full_name, 'turns', u.turns, 'tokens', u.tokens)
                       order by u.tokens desc)
      from (select c.user_id, count(*) filter (where msg.role = 'assistant') as turns,
                   coalesce(sum(coalesce(msg.tokens_in, 0) + coalesce(msg.tokens_out, 0)), 0) as tokens
            from public.assistant_messages msg
            join public.assistant_conversations c on c.id = msg.conversation_id
            where c.company_id = (select company_id from who)
              and msg.created_at >= date_trunc('month', now())
            group by c.user_id) u
      left join public.profiles pr on pr.id = u.user_id), '[]'::jsonb),
    'proposals', coalesce((
      select jsonb_object_agg(s.status, s.n) from (
        select status, count(*) as n from public.assistant_proposals
        where company_id = (select company_id from who) group by status) s), '{}'::jsonb),
    'allowance', app.assistant_allowance(for_company))
$$;

comment on function app.assistant_usage(uuid) is
  'Six months of the assistant''s use by a company: turns, tokens, cost, who used
   it, and the state of its proposals. Yours by default; the master administrator
   may name another company, which is how they see what they are switching on
   before they switch it on (0134).';

create or replace function public.assistant_allowance(for_company uuid default null) returns jsonb
  language sql stable security invoker as $$ select app.assistant_allowance(for_company) $$;
create or replace function public.assistant_usage(for_company uuid default null) returns jsonb
  language sql stable security invoker as $$ select app.assistant_usage(for_company) $$;

grant execute on function
  app.assistant_company(uuid),
  app.assistant_allowance(uuid), public.assistant_allowance(uuid),
  app.assistant_usage(uuid), public.assistant_usage(uuid)
to authenticated;
