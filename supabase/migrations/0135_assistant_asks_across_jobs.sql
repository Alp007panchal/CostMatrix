-- 0135  The assistant can be asked about the company's own jobs, not just the
--       record on screen.
--
-- Roadmap 3.7's remaining third: "natural-language questions over the company's
-- own data". Until now every assistant conversation hung off one enquiry or one
-- costing, and the question task said so in as many words: *"questions across
-- all costings and the CRM are not available yet, so say so if asked."*
--
-- Two things make the difference, and neither of them is a new permission.
--
-- 1. A CONVERSATION MAY BE ABOUT THE COMPANY. `assistant_conversations` gains
--    'company' as a third entity type, with the company's own id as the entity.
--    `assistant_proposals` is deliberately NOT relaxed: a proposal must land on
--    a costing or an enquiry, so the existing check constraint is what stops a
--    company-wide conversation proposing anything. A question answers; it does
--    not change a costing, and now it cannot.
--
-- 2. ONE NEW READ. `app.search_costings` looks across the company's costings and
--    the quotations released from them. It is `security invoker`, so row-level
--    security decides what comes back exactly as it does for the screens — the
--    assistant sees what the person asking could see by clicking, and nothing
--    more. No new grant, no new policy, no service role.
--
-- WHAT IT DOES NOT DO. It reports; it never totals across jobs into a figure
-- somebody might quote. Each row carries that costing's own frozen figures, and
-- the model is told to name the jobs rather than add them up: a sum across
-- costings in different currencies, revisions and states is exactly the kind of
-- number that reads as authoritative and means nothing.

alter table public.assistant_conversations
  drop constraint if exists assistant_conversations_entity_known;

alter table public.assistant_conversations
  add constraint assistant_conversations_entity_known
  check (entity_type in ('enquiry', 'costing', 'company'));

comment on column public.assistant_conversations.entity_type is
  'What the conversation is about: one enquiry, one costing, or (0135) the
   company itself, which is how a question ranges over its own jobs. A proposal
   still may not be about a company — assistant_proposals keeps the two-value
   constraint, so a question can never become a change.';

-- ---------------------------------------------------------------------------
-- The one new read: the company's own jobs
-- ---------------------------------------------------------------------------
-- Shaped like app.search_kits (0103): a text match, a small filters object, a
-- limit, and jsonb out. Filters, all optional:
--   status        draft | submitted | approved
--   current_only  true to ignore superseded revisions
--   quoted        true for costings with a released quotation, false for without
--   won           true for jobs whose quotation was won
--   since, until  dates against the costing's creation
create or replace function app.search_costings(
  q text default null,
  filters jsonb default '{}'::jsonb,
  lim integer default 20)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with matched as (
    select
      c.id, c.costing_no, c.revision_no, c.is_current, c.title, c.status::text as status,
      c.created_at, c.approved_at, c.currency_label,
      cu.name as customer_name,
      e.enquiry_no,
      t.material_cost, t.labour_cost, t.subtotal, t.grand_total,
      qq.reference_no, qq.status::text as quotation_status, qq.released_at, qq.valid_until
    from public.costings c
    left join public.enquiries e on e.id = c.enquiry_id
    left join public.customers cu on cu.id = e.customer_id
    left join public.v_costing_totals t on t.costing_id = c.id
    left join public.quotations qq on qq.costing_id = c.id
    where (nullif(trim(coalesce(q, '')), '') is null
           or c.costing_no ilike '%' || trim(q) || '%'
           or c.title      ilike '%' || trim(q) || '%'
           or cu.name      ilike '%' || trim(q) || '%'
           or e.enquiry_no ilike '%' || trim(q) || '%'
           or qq.reference_no ilike '%' || trim(q) || '%')
      and (filters ->> 'status' is null or c.status::text = filters ->> 'status')
      and (coalesce((filters ->> 'current_only')::boolean, false) is not true or c.is_current)
      and ((filters ->> 'quoted') is null
           or (filters ->> 'quoted')::boolean = (qq.id is not null))
      and ((filters ->> 'won') is null
           or ((filters ->> 'won')::boolean) = (qq.status::text = 'won'))
      and (filters ->> 'since' is null or c.created_at >= (filters ->> 'since')::timestamptz)
      and (filters ->> 'until' is null or c.created_at <  (filters ->> 'until')::timestamptz)
    order by c.created_at desc
    limit greatest(1, least(coalesce(lim, 20), 50))
  )
  select jsonb_build_object(
    'costings', coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id,
      'costing_no', m.costing_no,
      'revision_no', m.revision_no,
      'is_current', m.is_current,
      'title', m.title,
      'status', m.status,
      'customer', m.customer_name,
      'enquiry_no', m.enquiry_no,
      'created_at', m.created_at,
      'approved_at', m.approved_at,
      'currency', m.currency_label,
      'material_cost', m.material_cost,
      'labour_cost', m.labour_cost,
      'subtotal_ex_vat', m.subtotal,
      'grand_total', m.grand_total,
      'quotation', case when m.reference_no is null then null else jsonb_build_object(
        'reference_no', m.reference_no, 'status', m.quotation_status,
        'released_at', m.released_at, 'valid_until', m.valid_until) end)
      order by m.created_at desc), '[]'::jsonb),
    'returned', count(*),
    'note', 'Each row carries that costing''s own frozen figures in its own currency. Do not add them together.')
  from matched m
$$;

comment on function app.search_costings(text, jsonb, integer) is
  'The company''s own costings and the quotations released from them, for a
   question that ranges wider than one record (0135). Security invoker, so it
   returns exactly what the person asking could see by clicking. Figures are
   each costing''s own frozen ones; the note tells the model not to total them.';

create or replace function public.search_costings(
  q text default null, filters jsonb default '{}'::jsonb, lim integer default 20)
returns jsonb
  language sql stable security invoker as $$ select app.search_costings(q, filters, lim) $$;

grant execute on function
  app.search_costings(text, jsonb, integer),
  public.search_costings(text, jsonb, integer)
to authenticated;
