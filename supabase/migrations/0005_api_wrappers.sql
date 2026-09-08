-- 0005  Public wrappers for the costing functions.
--
-- The API client reaches only the public schema. The real functions live in
-- app, which stays internal; these pass straight through, so the API surface
-- is exactly the six things a screen may ask for and nothing else.

create or replace function public.create_costing(title text, notes text default null)
returns public.costings
language sql
as $$ select app.create_costing(title, notes) $$;

create or replace function public.add_assembly_to_costing(
  target_panel_id uuid, source_assembly uuid, qty numeric default 1)
returns uuid
language sql
as $$ select app.add_assembly_to_costing(target_panel_id, source_assembly, qty) $$;

create or replace function public.submit_costing(target uuid)
returns void
language sql
as $$ select app.submit_costing(target) $$;

create or replace function public.approve_costing(target uuid)
returns void
language sql
as $$ select app.approve_costing(target) $$;

create or replace function public.return_costing(target uuid, comment text)
returns void
language sql
as $$ select app.return_costing(target, comment) $$;

create or replace function public.create_costing_revision(target uuid)
returns public.costings
language sql
as $$ select app.create_costing_revision(target) $$;

grant execute on function public.create_costing(text, text)                        to authenticated;
grant execute on function public.add_assembly_to_costing(uuid, uuid, numeric)       to authenticated;
grant execute on function public.submit_costing(uuid)                               to authenticated;
grant execute on function public.approve_costing(uuid)                              to authenticated;
grant execute on function public.return_costing(uuid, text)                         to authenticated;
grant execute on function public.create_costing_revision(uuid)                      to authenticated;

-- Nothing for the anonymous role: CostMatrix has no public pages.
revoke execute on all functions in schema public from anon;
