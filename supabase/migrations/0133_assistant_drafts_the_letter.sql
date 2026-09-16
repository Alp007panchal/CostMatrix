-- 0133  The assistant may propose the quotation's wording.
--
-- Roadmap 3.7's middle third: "drafting cover letters, follow-ups and
-- clarification questions". This is the cover letter — the subject, the opening,
-- the closing and the notes on offer that Annexure I carries — drafted from the
-- costing, the enquiry and the company's own defaults, on the Release page.
--
-- The only thing the database needs is room for the new proposal type. Its
-- check constraint has listed three types since 0102; a fourth is a relaxation,
-- so nothing already stored can become invalid.
--
-- WHY IT PROPOSES RATHER THAN WRITES. The assistant's standing rule is that it
-- proposes and a person applies (spec §6.3), and a quotation's wording is the
-- last thing that should slip past a person: it goes out on the company
-- letterhead over a named signatory. So a drafted letter lands as a proposal
-- like any other, the approver reads it beside their own defaults, and the words
-- reach the quotation only when they press Release — the same button, doing the
-- same thing, as before.
--
-- WHY THERE IS NO NEW SWITCH. It rides the `assistant` feature, which is off by
-- default and master-administrator-only. A letter can only be drafted from the
-- assistant panel, so a second switch would gate a door that is already locked,
-- and an extra row on the Features screen that never means anything on its own
-- is how that screen stops being read.
--
-- NOTHING HERE CAN MOVE A PRICE. The payload is four pieces of text. No line,
-- quantity, rate or margin is reachable from it, and `apply_proposal` is not
-- extended to this type at all: the Release form is where it lands.

alter table public.assistant_proposals
  drop constraint if exists assistant_proposals_type_known;

alter table public.assistant_proposals
  add constraint assistant_proposals_type_known
  check (type in ('draft_costing', 'review', 'line_change', 'quotation_wording'));

comment on column public.assistant_proposals.type is
  'What the assistant is proposing. draft_costing, review and line_change are
   applied through app.apply_proposal onto the costing. quotation_wording (0133)
   is not: it is the cover letter''s subject, opening, closing and notes, which
   the approver reads on the Release page and carries into the form by hand, so
   that words going out on the letterhead are always somebody''s own choice.';

-- ---------------------------------------------------------------------------
-- Taking the words: the record that a person chose them
-- ---------------------------------------------------------------------------
-- A drafted letter is carried into the Release form by hand, so nothing else
-- marks it as dealt with, and it would sit open for ever. This is the one write
-- it does: the proposal becomes `applied`, stamped with who took it and when,
-- and the activity log carries `quotation.wording_used`. It touches no costing,
-- no price and no quotation row — pressing Release is still what releases.

create or replace function app.use_quotation_wording(proposal uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  p public.assistant_proposals;
begin
  select * into p from public.assistant_proposals where id = proposal;
  if p.id is null then raise exception 'no such proposal, or it is not visible to you'; end if;
  if p.type <> 'quotation_wording' then
    raise exception 'that is a % proposal, not drafted wording', p.type;
  end if;
  if p.status in ('applied', 'rejected', 'expired') then
    raise exception 'this proposal is already %', p.status;
  end if;
  update public.assistant_proposals
     set status = 'applied', applied_by = auth.uid(), applied_at = now()
   where id = proposal;
  perform app.write_activity(p.entity_type, p.entity_id, 'quotation.wording_used', null,
    jsonb_build_object('proposal_id', proposal),
    'Used the assistant''s wording for the quotation letter', 'user');
end;
$$;

create or replace function public.use_quotation_wording(proposal uuid) returns void
  language sql security invoker as $$ select app.use_quotation_wording(proposal) $$;

-- ---------------------------------------------------------------------------
-- Applying: refused in a sentence rather than by accident
-- ---------------------------------------------------------------------------
-- `app.apply_proposal` (0104) has a branch per type and none for this one, so a
-- wording proposal would fall through every branch and fail on a null status —
-- a refusal, but spelled as a database error. The web calls the wrapper, so the
-- wrapper is where the sentence goes; recreating the 120-line function to add
-- one `elsif` would be a copy nobody could review.

create or replace function public.apply_proposal(proposal uuid, decisions jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  kind text;
begin
  select type into kind from public.assistant_proposals where id = proposal;
  if kind = 'quotation_wording' then
    raise exception 'a drafted letter is not applied to the costing: open the Release page, read it and use it there';
  end if;
  return app.apply_proposal(proposal, decisions);
end;
$$;

grant execute on function
  app.use_quotation_wording(uuid), public.use_quotation_wording(uuid),
  public.apply_proposal(uuid, jsonb)
to authenticated;
