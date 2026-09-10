-- 0013  The history log says who, not just what.
--
-- costing_history has always carried user_id, written by the status functions
-- from auth.uid(), but nothing ever showed it: the column is a bare uuid with
-- no foreign key to profiles, so the API client has no relationship to follow
-- and the screen printed only the action and the time. Reading a colleague's
-- profile was never the obstacle — profiles_read (0002) allows exactly that,
-- "so a costing can show who submitted it". The obstacle was the missing join.
--
-- A view rather than a foreign key: the key would be the tidier schema, but
-- history rows outlive the people in them (a person removed by 0012 leaves
-- their history behind, which is the point of an audit log), and a foreign key
-- with on delete set null would erase the very fact the log exists to keep.
-- The left join leaves the uuid in place and simply has no name to show.

create or replace view public.v_costing_history
with (security_invoker = true)
as
select
  h.id,
  h.costing_id,
  h.company_id,
  h.user_id,
  p.full_name,
  h.action,
  h.details,
  h.at
from public.costing_history h
left join public.profiles p on p.id = h.user_id;

comment on view public.v_costing_history is
  'The costing history with the operator''s name. full_name is null when the
   person has since been removed, or when a master admin reads another
   company''s history: the row still shows what happened and when.';

grant select on public.v_costing_history to authenticated;
