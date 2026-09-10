-- 0016  One enquiry, one decision.
--
-- A job that went to three revisions read as three quotations on the list, each
-- with its own Won and Lost buttons, as if they were three different jobs. They
-- are one job: one enquiry, one family of costings, several revisions of the
-- same offer. Only one of them can be won, and when it is, the others are not
-- lost — they are simply no longer on the table.
--
-- So the decision moves onto the **enquiry**, where it belongs, and names the
-- quotation that won it. The siblings become `superseded`, a new status that
-- says exactly that. A quotation with no enquiry behind it — a costing raised
-- without one — is still decided on its own row, because there is nowhere else
-- to decide it.

alter type public.quotation_status add value if not exists 'superseded';

-- Needed for the composite foreign key below, which is how every link in this
-- schema stays inside one company.
alter table public.quotations add constraint quotations_id_company unique (id, company_id);

alter table public.enquiries
  add column won_quotation_id uuid,
  add column lost_reason      text;

alter table public.enquiries
  add constraint enquiries_won_quotation_fkey
  foreign key (won_quotation_id, company_id)
  references public.quotations (id, company_id) on delete set null;

comment on column public.enquiries.won_quotation_id is
  'The quotation that won the job. Null while the enquiry is open, or when it
   was lost. Set by app.decide_enquiry, never by hand.';
comment on column public.enquiries.lost_reason is
  'Why the job was lost, in the words of whoever heard. What the sales reports
   are built on later, so it is required when an enquiry is marked lost.';

-- ---------------------------------------------------------------------------
-- The decision
-- ---------------------------------------------------------------------------

create or replace function app.decide_enquiry(
  target uuid,
  decision text,
  winning_quotation uuid default null,
  reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  e public.enquiries;
  q public.quotations;
  superseded integer := 0;
  decided integer := 0;
begin
  select * into e from public.enquiries
   where id = target and company_id = app.current_company_id();
  if e.id is null then raise exception 'no such enquiry'; end if;
  if not app.can_edit_costings() then raise exception 'you may not decide an enquiry'; end if;
  if decision not in ('won', 'lost') then
    raise exception 'an enquiry is won or lost, not %', decision;
  end if;

  if decision = 'won' then
    if winning_quotation is null then raise exception 'say which quotation won it'; end if;
    select qq.* into q
    from public.quotations qq
    join public.costings c on c.id = qq.costing_id
    where qq.id = winning_quotation and c.enquiry_id = target and qq.company_id = e.company_id;
    if q.id is null then
      raise exception 'that quotation does not belong to this enquiry';
    end if;

    update public.quotations
       set status = 'won', decided_at = now(), lost_reason = null
     where id = q.id;
    decided := 1;

    -- The offers that were still live are not lost; they are off the table.
    update public.quotations
       set status = 'superseded', decided_at = now()
     where company_id = e.company_id
       and id <> q.id
       and status in ('released', 'sent')
       and costing_id in (select id from public.costings where enquiry_id = target);
    get diagnostics superseded = row_count;

    update public.enquiries
       set status = 'won', won_quotation_id = q.id, lost_reason = null
     where id = target;
  else
    if coalesce(btrim(reason), '') = '' then raise exception 'say why it was lost'; end if;

    update public.quotations
       set status = 'lost', decided_at = now(), lost_reason = btrim(reason)
     where company_id = e.company_id
       and status in ('released', 'sent')
       and costing_id in (select id from public.costings where enquiry_id = target);
    get diagnostics decided = row_count;

    update public.enquiries
       set status = 'lost', won_quotation_id = null, lost_reason = btrim(reason)
     where id = target;
  end if;

  insert into public.costing_history (costing_id, company_id, user_id, action, details)
  select c.id, c.company_id, auth.uid(), 'enquiry ' || decision,
         jsonb_build_object(
           'enquiry_no', e.enquiry_no,
           'won_quotation_id', winning_quotation,
           'reason', nullif(btrim(coalesce(reason, '')), ''))
  from public.costings c
  where c.enquiry_id = target and c.is_current;

  return jsonb_build_object(
    'enquiry_id', target, 'decision', decision,
    'decided', decided, 'superseded', superseded);
end;
$$;

comment on function app.decide_enquiry(uuid, text, uuid, text) is
  'Decides a whole enquiry: won, naming the quotation that won it and marking
   the offers still live as superseded; or lost with a reason, which every live
   quotation of the enquiry takes. Writes one history line per current costing.';

create or replace function public.decide_enquiry(
  target uuid, decision text, winning_quotation uuid default null, reason text default null)
returns jsonb language sql
as $$ select app.decide_enquiry(target, decision, winning_quotation, reason) $$;

grant execute on function public.decide_enquiry(uuid, text, uuid, text) to authenticated;
revoke execute on all functions in schema public from anon;
