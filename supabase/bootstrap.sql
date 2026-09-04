-- Bootstrap: creates your own company and makes you the master administrator.
--
-- WHY THIS EXISTS
-- Only an administrator can add people, and at the very beginning there are no
-- administrators. Something has to create the first one, so it is this, run by
-- hand, once.
--
-- HOW TO RUN IT
-- 1. In the Supabase dashboard, open Authentication → Users → Add user, and
--    create an account with your own email address and a password. That gives
--    you a login but no company and no roles yet.
-- 2. Open SQL Editor, paste this whole file, change the three values in the
--    settings block below, and run it.
-- 3. Sign in to CostMatrix. You should land on the home screen as the master
--    administrator.
--
-- Running it twice is harmless: it changes nothing the second time.

do $$
declare
  -- ---- change these three -------------------------------------------------
  your_email      text := 'you@yourcompany.com';
  your_full_name  text := 'Your Name';
  your_company    text := 'Your Company Ltd';
  -- -------------------------------------------------------------------------

  -- Prefixed names: plain user_id and company_id would be ambiguous against
  -- the columns of the same name inside the statements below.
  found_user_id    uuid;
  found_company_id uuid;
begin
  select id into found_user_id from auth.users where lower(email) = lower(your_email);

  if found_user_id is null then
    raise exception
      'No account with the email %. Create it first under Authentication → Users.', your_email;
  end if;

  -- The in-house company: discount 0, since master prices are already its own
  -- prices. Margins and VAT can be adjusted afterwards on the Company screen.
  select id into found_company_id from public.companies where kind = 'in_house' limit 1;

  if found_company_id is null then
    insert into public.companies (name, kind, currency_code, currency_label, exchange_rate,
                                  discount_pct, tax_pct)
    values (your_company, 'in_house', 'KES', 'KSH', 1, 0, 16)
    returning id into found_company_id;
    raise notice 'Created company % (%)', your_company, found_company_id;
  else
    raise notice 'Using the existing in-house company (%)', found_company_id;
  end if;

  insert into public.profiles (id, company_id, full_name, email, is_master_admin)
  values (found_user_id, found_company_id, your_full_name, your_email, true)
  on conflict (id) do update
    set is_master_admin = true,
        is_active = true,
        company_id = excluded.company_id;

  insert into public.user_roles (user_id, company_id, role)
  values (found_user_id, found_company_id, 'company_admin'),
         (found_user_id, found_company_id, 'costing_engineer'),
         (found_user_id, found_company_id, 'approver')
  on conflict (user_id, role) do nothing;

  raise notice 'Done. % is now the master administrator of %.', your_email, your_company;
end;
$$;
