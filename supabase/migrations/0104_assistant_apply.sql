-- 0104  Applying and rejecting what the assistant proposed (AI spec §3.2, §6.5; step 3 PR B)
--
-- A proposal sits in assistant_proposals until a person decides. Applying it
-- calls the ORDINARY engine functions — add_assembly_to_costing and
-- add_component_to_costing, the same ones the kit picker calls — so every line
-- is priced and frozen exactly as a manual one would be, then marks the lines
-- origin = ai_proposal with origin_ref = the proposal, records what was created
-- on the proposal, and writes the activity-log rows of spec §6.5. Rejecting is
-- a status and a note.
--
-- SECURITY INVOKER throughout: the person applying must already be allowed to
-- edit the costing, and row-level security says whether they may see the
-- proposal at all. Nothing here loosens a rule the engine has.

-- ===========================================================================
-- 1. One line in, through the engine, with its provenance stamped
-- ===========================================================================
create or replace function app.apply_proposal_line(
  proposal uuid, target_panel uuid, line_kind text, ref uuid, qty numeric, line_section text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  new_line uuid;
  holder uuid;
  already uuid;
begin
  if line_kind = 'kit' then
    new_line := app.add_assembly_to_costing(target_panel, ref, qty, line_section);
    update public.costing_assemblies set origin = 'ai_proposal', origin_ref = proposal where id = new_line;
    update public.costing_items set origin = 'ai_proposal', origin_ref = proposal where costing_assembly_id = new_line;
    return jsonb_build_object('kind', 'kit', 'costing_assembly_id', new_line, 'ref_id', ref, 'qty', qty);

  elsif line_kind = 'component' then
    -- The engine adds to the quantity of a component already in that section
    -- rather than making a second line. A line a person put there keeps its own
    -- provenance: the proposal says "merged" instead of claiming it.
    select i.id into already
    from public.costing_items i
    join public.costing_assemblies ca on ca.id = i.costing_assembly_id
    where ca.panel_id = target_panel and i.source_component_id = ref and not i.is_manual
      and ca.section is not distinct from line_section
    limit 1;

    new_line := app.add_component_to_costing(target_panel, ref, qty, line_section);
    select i.costing_assembly_id into holder from public.costing_items i where i.id = new_line;
    if already is distinct from new_line then
      update public.costing_items set origin = 'ai_proposal', origin_ref = proposal where id = new_line;
    end if;
    return jsonb_build_object('kind', 'component', 'costing_item_id', new_line, 'costing_assembly_id', holder,
                              'ref_id', ref, 'qty', qty, 'merged', already is not distinct from new_line);
  else
    raise exception 'a proposed line is a kit or a component, not %', coalesce(line_kind, 'nothing');
  end if;
end;
$$;

-- ===========================================================================
-- 2. One line_change, as the review card's inline fix or on its own
-- ===========================================================================
create or replace function app.apply_line_change(proposal uuid, target_costing uuid, change jsonb, hint_panel uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  action text := change ->> 'action';
  named uuid := nullif(change ->> 'panel_line_item_id', '')::uuid;
  target_panel uuid;
  target_line uuid;
  qty numeric := nullif(change ->> 'qty', '')::numeric;
  before_qty numeric;
  kind text;
begin
  case action
    when 'add' then
      -- The panel: the one chosen on screen, else the one the model named (a
      -- panel, or a line whose panel we take), else the costing's first.
      target_panel := hint_panel;
      if target_panel is null and named is not null then
        select id into target_panel from public.costing_panels where id = named and costing_id = target_costing;
        if target_panel is null then
          select panel_id into target_panel from public.costing_assemblies where id = named and costing_id = target_costing;
        end if;
      end if;
      if target_panel is null then
        select id into target_panel from public.costing_panels where costing_id = target_costing order by sort_order limit 1;
      end if;
      if target_panel is null then raise exception 'the costing has no panel to add the line to'; end if;
      kind := case when exists (select 1 from public.assemblies where id = (change ->> 'ref')::uuid) then 'kit' else 'component' end;
      return app.apply_proposal_line(proposal, target_panel, kind, (change ->> 'ref')::uuid, coalesce(qty, 1), change ->> 'section');

    when 'change_qty' then
      target_line := coalesce(nullif(change ->> 'line_id', '')::uuid, named);
      select quantity into before_qty from public.costing_assemblies where id = target_line and costing_id = target_costing;
      if before_qty is null then raise exception 'the line to change is not on this costing'; end if;
      if qty is null or qty <= 0 then raise exception 'the new quantity must be greater than zero'; end if;
      update public.costing_assemblies set quantity = qty where id = target_line;
      return jsonb_build_object('kind', 'change_qty', 'costing_assembly_id', target_line, 'from', before_qty, 'to', qty);

    when 'remove' then
      target_line := coalesce(nullif(change ->> 'line_id', '')::uuid, named);
      if not exists (select 1 from public.costing_assemblies where id = target_line and costing_id = target_costing) then
        raise exception 'the line to remove is not on this costing';
      end if;
      delete from public.costing_assemblies where id = target_line;
      return jsonb_build_object('kind', 'remove', 'costing_assembly_id', target_line);

    when 'set_parameter' then
      target_panel := coalesce(hint_panel, named);
      if not exists (select 1 from public.costing_panels where id = target_panel and costing_id = target_costing) then
        raise exception 'the panel to change is not on this costing';
      end if;
      if not app.costing_is_editable(target_costing) then raise exception 'this costing is not open for editing'; end if;
      update public.costing_panels
         set parameters = parameters || jsonb_build_object(change ->> 'parameter', change -> 'value')
       where id = target_panel;
      return jsonb_build_object('kind', 'set_parameter', 'panel_id', target_panel,
                                'parameter', change ->> 'parameter', 'value', change -> 'value');
    else
      raise exception 'unknown line change %', coalesce(action, 'nothing');
  end case;
end;
$$;

-- ===========================================================================
-- 3. Apply: the person's decisions on one proposal
-- ===========================================================================
-- decisions, from the screen:
--   draft_costing  {"lines": [{"panel": 0, "line": 2, "kind": "kit", "ref_id": "<uuid>", "qty": 1, "section": "Outgoers"}],
--                   "title": "<for a costing created from an enquiry>"}
--                  Only the lines listed are applied: Accept keeps the model's
--                  line, Change replaces ref_id and qty, Reject leaves it out.
--   review         {"finding": 1, "panel_id": "<optional uuid>"}   one finding's inline fix
--   line_change    {"panel_id": "<optional uuid>"}
create or replace function app.apply_proposal(proposal uuid, decisions jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  p public.assistant_proposals;
  target_costing uuid;
  created_costing boolean := false;
  c public.costings;
  panel_json jsonb;
  line jsonb;
  panel_ids uuid[] := '{}';
  new_panel uuid;
  applied jsonb := '[]'::jsonb;
  proposed_lines integer := 0;
  idx integer := 0;
  finding_index integer;
  finding jsonb;
  done_findings jsonb;
  total_findings integer;
  new_status text;
  hint_panel uuid := nullif(decisions ->> 'panel_id', '')::uuid;
begin
  select * into p from public.assistant_proposals where id = proposal;
  if p.id is null then raise exception 'no such proposal, or it is not visible to you'; end if;
  if p.status not in ('open', 'partially_applied') then
    raise exception 'this proposal is already %', p.status;
  end if;
  if not app.can_edit_costings() then raise exception 'you may not change costings'; end if;

  -- ---- where the lines go ------------------------------------------------
  if p.entity_type = 'costing' then
    target_costing := p.entity_id;
  elsif p.type = 'draft_costing' then
    -- A draft from an enquiry becomes a new draft costing against that enquiry.
    c := app.create_costing(
      coalesce(nullif(decisions ->> 'title', ''), nullif(p.payload ->> 'summary', ''), 'Drafted by the assistant'),
      null, p.entity_id);
    target_costing := c.id;
    created_costing := true;
  else
    raise exception 'a % proposal needs a costing to apply to', p.type;
  end if;
  if not app.costing_is_editable(target_costing) then
    raise exception 'this costing is not open for editing';
  end if;

  -- ---- by type -------------------------------------------------------------
  if p.type = 'draft_costing' then
    if jsonb_typeof(decisions -> 'lines') is distinct from 'array' or jsonb_array_length(decisions -> 'lines') = 0 then
      raise exception 'nothing was accepted: choose at least one line to apply';
    end if;
    select count(*) into proposed_lines
      from jsonb_array_elements(p.payload -> 'panels') pn, jsonb_array_elements(pn -> 'lines');

    -- One panel per proposed panel that has an accepted line, in the order
    -- proposed. A panel nobody accepted a line from is not created at all; the
    -- index is kept in step with a null so `panel` still means "the nth panel
    -- of the proposal".
    idx := 0;
    for panel_json in select * from jsonb_array_elements(p.payload -> 'panels') loop
      new_panel := null;
      if exists (select 1 from jsonb_array_elements(decisions -> 'lines') d where (d ->> 'panel')::int = idx) then
        insert into public.costing_panels (costing_id, company_id, name, quantity, uom, parameters, sort_order)
        values (target_costing, p.company_id, coalesce(nullif(panel_json ->> 'name', ''), 'Panel'),
                coalesce(nullif(panel_json ->> 'qty', '')::numeric, 1), 'PC',
                coalesce(panel_json -> 'parameters', '{}'::jsonb),
                (select count(*) from public.costing_panels where costing_id = target_costing))
        returning id into new_panel;
      end if;
      panel_ids := panel_ids || new_panel;
      idx := idx + 1;
    end loop;

    for line in select * from jsonb_array_elements(decisions -> 'lines') loop
      new_panel := panel_ids[(line ->> 'panel')::int + 1];
      if new_panel is null then raise exception 'line names a panel the proposal does not have'; end if;
      applied := applied || (
        app.apply_proposal_line(proposal, new_panel, line ->> 'kind', (line ->> 'ref_id')::uuid,
                                coalesce(nullif(line ->> 'qty', '')::numeric, 1), line ->> 'section')
        || jsonb_build_object('panel', (line ->> 'panel')::int, 'line', (line ->> 'line')::int, 'panel_id', new_panel));
    end loop;
    new_status := case when jsonb_array_length(decisions -> 'lines') >= proposed_lines then 'applied' else 'partially_applied' end;

  elsif p.type = 'line_change' then
    applied := applied || app.apply_line_change(proposal, target_costing, p.payload, hint_panel);
    new_status := 'applied';

  elsif p.type = 'review' then
    finding_index := nullif(decisions ->> 'finding', '')::int;
    if finding_index is null then raise exception 'say which finding to apply'; end if;
    finding := p.payload -> 'findings' -> finding_index;
    if finding is null or finding -> 'proposal' is null then
      raise exception 'that finding has no change to apply';
    end if;
    done_findings := coalesce(p.result -> 'findings_applied', '[]'::jsonb);
    if done_findings @> to_jsonb(finding_index) then raise exception 'that finding was already applied'; end if;
    applied := applied || (app.apply_line_change(proposal, target_costing, finding -> 'proposal', hint_panel)
                           || jsonb_build_object('finding', finding_index));
    done_findings := done_findings || to_jsonb(finding_index);
    select count(*) into total_findings from jsonb_array_elements(p.payload -> 'findings') f where f -> 'proposal' is not null;
    new_status := case when jsonb_array_length(done_findings) >= total_findings then 'applied' else 'partially_applied' end;
  end if;

  -- ---- the record ------------------------------------------------------------
  update public.assistant_proposals
     set status = new_status,
         applied_by = auth.uid(),
         applied_at = now(),
         result = coalesce(result, '{}'::jsonb)
                  || jsonb_build_object(
                       'costing_id', target_costing,
                       'created_costing', created_costing,
                       'lines', coalesce(result -> 'lines', '[]'::jsonb) || applied)
                  || case when p.type = 'review' then jsonb_build_object('findings_applied', done_findings) else '{}'::jsonb end
   where id = proposal;

  perform app.write_activity('costing', target_costing, 'proposal.applied', null,
    jsonb_build_object('proposal_id', proposal, 'type', p.type, 'status', new_status, 'lines', applied,
                       'created_costing', created_costing),
    format('Applied %s line(s) from the assistant''s %s proposal', jsonb_array_length(applied), replace(p.type, '_', ' ')),
    'user');
  if p.entity_type = 'enquiry' then
    perform app.write_activity('enquiry', p.entity_id, 'proposal.applied', null,
      jsonb_build_object('proposal_id', proposal, 'costing_id', target_costing), 'Draft costing created from the assistant''s proposal', 'user');
  end if;

  return jsonb_build_object('costing_id', target_costing, 'created_costing', created_costing,
                            'status', new_status, 'lines', applied);
end;
$$;

comment on function app.apply_proposal(uuid, jsonb) is
  'Applies the lines a person accepted from an assistant proposal through the
   ordinary engine functions, stamps them origin = ai_proposal, records the
   result on the proposal and writes proposal.applied to the activity log.';

-- ===========================================================================
-- 4. Reject
-- ===========================================================================
create or replace function app.reject_proposal(proposal uuid, reason text default null)
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
  if p.status in ('applied', 'rejected', 'expired') then raise exception 'this proposal is already %', p.status; end if;
  update public.assistant_proposals
     set status = 'rejected', applied_by = auth.uid(), applied_at = now(),
         result = coalesce(result, '{}'::jsonb) || jsonb_build_object('rejected_reason', reason)
   where id = proposal;
  perform app.write_activity(p.entity_type, p.entity_id, 'proposal.rejected', null,
    jsonb_build_object('proposal_id', proposal, 'type', p.type, 'reason', reason),
    coalesce(nullif(reason, ''), 'Rejected the assistant''s proposal'), 'user');
end;
$$;

-- ===========================================================================
-- 5. Usage, for the company admin's screen (spec §8: "the company admin sees
--    monthly usage")
-- ===========================================================================
create or replace function app.assistant_usage()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
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
        where c.company_id = app.current_company_id()
          and msg.created_at >= date_trunc('month', now()) - interval '5 months'
        group by date_trunc('month', msg.created_at)) x), '[]'::jsonb),
    'cost_usd_this_month', coalesce((
      select sum(c.cost_usd) from public.assistant_conversations c
      where c.company_id = app.current_company_id() and c.updated_at >= date_trunc('month', now())), 0),
    'by_user_this_month', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', u.user_id, 'name', pr.full_name, 'turns', u.turns, 'tokens', u.tokens)
                       order by u.tokens desc)
      from (select c.user_id, count(*) filter (where msg.role = 'assistant') as turns,
                   coalesce(sum(coalesce(msg.tokens_in, 0) + coalesce(msg.tokens_out, 0)), 0) as tokens
            from public.assistant_messages msg
            join public.assistant_conversations c on c.id = msg.conversation_id
            where c.company_id = app.current_company_id() and msg.created_at >= date_trunc('month', now())
            group by c.user_id) u
      left join public.profiles pr on pr.id = u.user_id), '[]'::jsonb),
    'proposals', coalesce((
      select jsonb_object_agg(s.status, s.n) from (
        select status, count(*) as n from public.assistant_proposals
        where company_id = app.current_company_id() group by status) s), '{}'::jsonb),
    'allowance', app.assistant_allowance())
$$;

-- ===========================================================================
-- Public wrappers and grants
-- ===========================================================================
create or replace function public.apply_proposal(proposal uuid, decisions jsonb default '{}'::jsonb) returns jsonb
  language plpgsql security invoker as $$ begin return app.apply_proposal(proposal, decisions); end $$;
create or replace function public.reject_proposal(proposal uuid, reason text default null) returns void
  language sql security invoker as $$ select app.reject_proposal(proposal, reason) $$;
create or replace function public.assistant_usage() returns jsonb
  language sql stable security invoker as $$ select app.assistant_usage() $$;

grant execute on function
  app.apply_proposal_line(uuid, uuid, text, uuid, numeric, text),
  app.apply_line_change(uuid, uuid, jsonb, uuid),
  app.apply_proposal(uuid, jsonb), public.apply_proposal(uuid, jsonb),
  app.reject_proposal(uuid, text), public.reject_proposal(uuid, text),
  app.assistant_usage(), public.assistant_usage()
to authenticated;
