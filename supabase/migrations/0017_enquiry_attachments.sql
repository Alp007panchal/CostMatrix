-- 0017  Files kept with the enquiry.
--
-- An enquiry arrives with a drawing, a specification, a single-line diagram, an
-- email thread. Until now those lived in somebody's mailbox, and the job in the
-- app carried no trace of them. They belong with the enquiry, where whoever
-- costs it next can find them.
--
-- The files themselves go into a private bucket; the row here is the record of
-- what was uploaded, by whom and when. Deleting the row does not delete the
-- file, so a removal in the app never loses the original silently; the storage
-- object is removed by the screen in the same step.

create table public.enquiry_attachments (
  id          uuid primary key default gen_random_uuid(),
  enquiry_id  uuid not null,
  company_id  uuid not null references public.companies(id) on delete cascade,
  file_name   text not null check (length(btrim(file_name)) > 0),
  path        text not null unique,
  mime_type   text,
  size_bytes  bigint,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  -- Composite, as everywhere else here: a file can never hang off another
  -- company's enquiry, whatever is typed.
  foreign key (enquiry_id, company_id) references public.enquiries (id, company_id) on delete cascade
);

comment on table public.enquiry_attachments is
  'Drawings, specifications, emails and anything else that came with an enquiry.
   One row per file in the private attachments bucket; the path starts with the
   company id, which is what the storage policy checks.';

create index enquiry_attachments_enquiry_idx on public.enquiry_attachments (enquiry_id, created_at desc);

select app.add_audit_triggers('public.enquiry_attachments');

alter table public.enquiry_attachments enable row level security;

create policy enquiry_attachments_read on public.enquiry_attachments for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());
create policy enquiry_attachments_write on public.enquiry_attachments for all to authenticated
  using (company_id = app.current_company_id() and app.can_edit_costings())
  with check (company_id = app.current_company_id() and app.can_edit_costings());

grant select, insert, update, delete on public.enquiry_attachments to authenticated;

-- ---------------------------------------------------------------------------
-- The bucket
--
-- Same shape as the two buckets of 0006: private, the object path starts with
-- the company id, and the policy checks that first folder. Guarded on the
-- storage schema so this also runs on a plain PostgreSQL in the test harness.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'no storage schema here; skipping bucket setup (fine outside Supabase)';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('attachments', 'attachments', false, 20971520, null)
  on conflict (id) do nothing;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'attachments_read_own') then
    execute $p$ create policy attachments_read_own on storage.objects for select to authenticated
      using (bucket_id = 'attachments'
             and ((storage.foldername(name))[1] = app.current_company_id()::text or app.is_master_admin())) $p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'attachments_write_own') then
    execute $p$ create policy attachments_write_own on storage.objects for all to authenticated
      using (bucket_id = 'attachments'
             and (storage.foldername(name))[1] = app.current_company_id()::text
             and app.can_edit_costings())
      with check (bucket_id = 'attachments'
                  and (storage.foldername(name))[1] = app.current_company_id()::text
                  and app.can_edit_costings()) $p$;
  end if;
end;
$$;
