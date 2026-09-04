-- Local development data. Applied by `supabase db reset`, never to production.
--
-- Passwords are not set here: sign in locally through the Supabase studio at
-- http://localhost:54323 (Authentication → Users → send a magic link), or use
-- the CLI. The rows below only give those accounts a company and roles.

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000e1', 'master@example.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'admin@alpha.test'),
  ('00000000-0000-0000-0000-0000000000e3', 'engineer@alpha.test')
on conflict (id) do nothing;

insert into public.companies (id, name, kind, currency_code, currency_label, exchange_rate,
                              discount_pct, material_margin_pct, labour_margin_pct, tax_pct,
                              quotation_prefix, address)
values
  ('00000000-0000-0000-0000-0000000000d1', 'Your Company Ltd', 'in_house', 'KES', 'KSH', 1,
   0, 10, 20, 16, 'QT', 'Nairobi, Kenya'),
  ('00000000-0000-0000-0000-0000000000d2', 'Alpha Contractors', 'external', 'KES', 'KSH', 1,
   10, 12, 20, 16, 'ALP', 'Mombasa, Kenya')
on conflict (id) do nothing;

insert into public.profiles (id, company_id, full_name, email, is_master_admin)
values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', 'Master Admin',   'master@example.test',   true),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2', 'Alpha Admin',    'admin@alpha.test',      false),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d2', 'Alpha Engineer', 'engineer@alpha.test',   false)
on conflict (id) do nothing;

insert into public.user_roles (user_id, company_id, role)
values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', 'company_admin'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', 'approver'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2', 'company_admin'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2', 'approver'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d2', 'costing_engineer')
on conflict (user_id, role) do nothing;
