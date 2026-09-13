-- 0126  What is on your desk.
--
-- Signing in shows follow-ups, your roles and how the company is set up. It does
-- not show the work waiting on **you**: a costing sent back with a comment, a job
-- somebody submitted for your approval, a quotation released weeks ago that
-- nobody ever marked as sent. All of it is in the database already, on screens
-- you have to think to go and look at.
--
-- Four things, and each is chosen because nothing else in the app will ever
-- mention it again on its own:
--
--   returned_to_you      a costing you submitted, sent back with a comment. It
--                        is a draft again, so it looks like any other draft.
--   waiting_for_you      a submitted costing, shown only to somebody who can
--                        actually approve it. To anybody else it is noise.
--   released_not_sent    the PDF exists and the customer has never been told.
--                        The quietest of the four and the easiest to lose.
--   sent_unanswered      sent, and neither won nor lost since. Not a fault —
--                        just the oldest one, so it is asked about.
--
-- Read-only, and deliberately **not** a to-do list: nothing here can be ticked
-- off, because every one of the four is cleared by doing the actual work.
-- `days` is what a person sorts by, so it is worked out here rather than in the
-- browser, where two time zones would disagree about yesterday.

create or replace view public.v_my_desk
with (security_invoker = true)
as
with mine as (
  select
    'returned_to_you'::text                  as kind,
    10                                       as sort_order,
    c.id                                     as entity_id,
    'costing'::text                          as entity,
    c.costing_no || case when c.revision_no > 0 then ' rev ' || c.revision_no else '' end as reference,
    c.title,
    c.returned_at                            as since,
    coalesce(nullif(btrim(c.return_comment), ''), 'No comment was left') as detail
  from public.costings c
  where c.status = 'draft'
    and c.returned_at is not null
    and c.is_current
    -- The person who sent it up is the person it comes back to. Where nobody
    -- submitted it, whoever created it.
    and coalesce(c.submitted_by, c.created_by) = auth.uid()

  union all

  select
    'waiting_for_you', 20, c.id, 'costing',
    c.costing_no || case when c.revision_no > 0 then ' rev ' || c.revision_no else '' end,
    c.title,
    c.submitted_at,
    'Submitted, and waiting for an approver'
  from public.costings c
  -- Only to somebody who could actually act on it. A costing engineer watching a
  -- queue they cannot clear is a screen they learn to ignore.
  where c.status = 'submitted' and c.is_current and app.has_role('approver')

  union all

  select
    'released_not_sent', 30, q.id, 'quotation',
    q.reference_no, q.customer_name, q.released_at,
    'Released, and never marked as sent'
  from public.quotations q
  where q.status = 'released'

  union all

  select
    'sent_unanswered', 40, q.id, 'quotation',
    q.reference_no, q.customer_name,
    coalesce(q.sent_at, q.released_at),
    'Sent, and neither won nor lost since'
  from public.quotations q
  where q.status = 'sent'
)
select
  kind,
  sort_order,
  entity,
  entity_id,
  reference,
  title,
  since,
  -- Whole days, worked out where the database's own clock is, so the screen and
  -- a report cannot disagree about what "3 days" means.
  greatest((current_date - since::date), 0) as days,
  detail
from mine;

comment on view public.v_my_desk is
  'The work waiting on the signed-in person: a costing returned to them with a
   comment, a costing submitted and waiting for an approver (shown only to an
   approver), a quotation released but never marked as sent, and one sent that
   has been neither won nor lost. Read-only, and nothing here can be ticked off:
   each is cleared by doing the work.';

grant select on public.v_my_desk to authenticated;

-- ===========================================================================
-- A switch of its own
-- ===========================================================================

insert into public.features (code, name, blurb, changes_costings, option_key, sort_order) values
  ('my_desk', 'What is on your desk',
   'A card on the home page listing the work waiting on the person signed in: a costing sent back to them with a comment, a costing waiting for an approver (only if they are one), a quotation released but never marked as sent, and one sent that nobody has answered. It reads only, and nothing on it can be ticked off — each line is cleared by doing the work.',
   false, 'feature.my_desk', 210)
on conflict (code) do nothing;

select app.seed_feature_options(id) from public.companies;
