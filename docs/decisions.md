# Decisions log

One line per decision. Never delete a line; if a decision is reversed, add a new line that
says so and references the old number.

| # | Date | Decision |
|---|---|---|
| D-001 | 2026-09-04 | Labour is fixed hours × hourly rate per process type, never a percentage of material. |
| D-002 | 2026-09-04 | Three process types: panel/component assembly, wiring, busbar fabrication and assembly. Each has its own hourly rate. |
| D-003 | 2026-09-04 | Kit and standard assembly are one concept, one level; called "assembly" in the app, "kit" mentioned as a synonym. |
| D-004 | 2026-09-04 | KES is the master currency; all master prices and master default rates are in KES. |
| D-005 | 2026-09-04 | A company may work in another currency. Company admin sets currency and exchange rate. |
| D-006 | 2026-09-04 | Exchange rate is stored as KES per 1 unit of company currency, and is frozen into each costing. |
| D-007 | 2026-09-04 | Master labour hours are visible to all companies; a company admin may override them per assembly at company level. |
| D-008 | 2026-09-04 | Labour hours of a private assembly are set by the company admin. |
| D-009 | 2026-09-04 | In-house company uses the same discount mechanism with 0 %; there is no separate cost price. |
| D-010 | 2026-09-04 | A costing contains several panels, each with a quantity, each with its own assemblies. |
| D-011 | 2026-09-04 | Master admin has read-only access to all company data and full control of company settings, users and discounts. |
| D-012 | 2026-09-04 | Prices, discount, exchange rate, hours, rates, margins and VAT % are frozen into the costing when used. |
| D-013 | 2026-09-04 | Margin is two percentages, material and labour, with a "same for both" shortcut in the UI. (Arithmetic: see D-036.) |
| D-014 | 2026-09-04 | VAT is a per-company percentage, default 16, applied after margin. |
| D-015 | 2026-09-04 | Money is stored with 2 decimals; rounding happens only at displayed or printed totals. |
| D-016 | 2026-09-04 | Numbering per company per year: CM-YYYY-NNNN costings, QT-YYYY-NNNN quotations, EN-YYYY-NNNN enquiries. (Quotation part superseded by D-035.) |
| D-017 | 2026-09-04 | Lifecycle is draft → submitted → approved. An approver may return a submitted costing to draft; a comment is mandatory and logged. |
| D-018 | 2026-09-04 | After approval any change creates a new revision; older revisions stay approved and read-only. |
| D-019 | 2026-09-04 | Only the approver role can approve a costing and release the PDF quotation. |
| D-020 | 2026-09-04 | Hours on a costing line are editable; the source hours are shown beside the edited value. |
| D-021 | 2026-09-04 | Buyer companies are full tenants in release 1. |
| D-022 | 2026-09-04 | One user belongs to exactly one company and may hold several roles in it. |
| D-023 | 2026-09-04 | Component categories are master-only and seeded: switchgear, busbar, accessories & hardware, fabricated enclosure parts. |
| D-024 | 2026-09-04 | Private components get no discount and no currency conversion; they are priced in the company currency. |
| D-025 | 2026-09-04 | Supabase region is eu-west-2 (London). **Superseded by D-075.** |
| D-026 | 2026-09-04 | All schema changes are numbered SQL migrations under supabase/migrations/; the database must rebuild from scratch. |
| D-027 | 2026-09-04 | Tenant isolation is Postgres row-level security keyed on company_id; shared master rows use company_id IS NULL. |
| D-028 | 2026-09-04 | Frontend is a Vite + React + TypeScript single-page app deployed as static files (Vercel or Netlify). |
| D-029 | 2026-09-04 | Costing totals are calculated in Postgres views and functions; the UI never re-implements the formula. |
| D-030 | 2026-09-04 | PDFs are generated once at release time and stored in a private Supabase Storage bucket. |
| D-031 | 2026-09-04 | Code is organised by concern (auth, admin, library, costing, quotation, crm); no file over ~300 lines. |
| D-032 | 2026-09-04 | Backups: Supabase daily backups and PITR, plus a weekly off-site dump, plus a restore drill before go-live and quarterly. |
| D-033 | 2026-09-04 | First build slice is "cost one panel end to end"; PDF and CRM follow. |
| D-034 | 2026-09-04 | English only in release 1. |
| D-035 | 2026-09-04 | Supersedes the quotation part of D-016: the printed quotation reference is company prefix + sequence + -REVn (e.g. NPP-193-REV1); year optional per company; default prefix QT. Internal costing numbers stay CM-YYYY-NNNN. |
| D-036 | 2026-09-04 | Margins are applied by division, cost ÷ (1 − margin %), as in the existing sheets; the UI shows the equivalent markup. |
| D-037 | 2026-09-04 | A third, optional negotiation margin per costing (default 0) is applied to the whole panel price after material and labour margins. |
| D-038 | 2026-09-04 | The panel unit selling price is rounded up to a company rounding step, default 100 in the company currency; costs underneath stay exact. |
| D-039 | 2026-09-04 | Busbar is a rate-based component: weight per unit × a material rate per kg; material rates follow the master-default-plus-company-override pattern of labour rates. |
| D-040 | 2026-09-04 | Fabricated enclosure and sheet-metal parts are ordinary fixed-price components in the enclosure category; their cost comes from the separate fabrication costing application. |
| D-041 | 2026-09-04 | A costing may offer alternatives: panels carry an optional option label, and the price schedule prints one table with subtotal, VAT and total per option. |
| D-042 | 2026-09-04 | Each panel carries a technical description, enclosure dimensions and unit of measure for Annexure IV; the app drafts the description from the panel's contents. |
| D-043 | 2026-09-04 | Quotation layout follows docs/quotation-template.md, derived from quotation NPP-192-REV1; approver-editable text is frozen with the released quotation. |
| D-044 | 2026-09-04 | The PDF prints amounts in the company currency only, labelled with the company's currency word (e.g. KSH). |
| D-045 | 2026-09-04 | Material rates follow the labour-rate pattern: a master default in KES with a per-company override. Copper busbar is the only rate-based material in release 1. |
| D-046 | 2026-09-04 | Manufacturer data sheets stay outside the app in release 1; the quotation PDF ends with the technical offer. |
| D-047 | 2026-09-04 | Letterhead is one company logo in the header; partner logos (Siemens, C&S) and certification marks are a footer strip any company may fill. |
| D-048 | 2026-09-04 | Follow-up reminders are an in-app due and overdue list in phase 1; no email digest. |
| D-049 | 2026-09-04 | Supabase, the web host and GitHub are owned by the operator's own account; alerts and backup failures go to alp007panchal@gmail.com. |
| D-050 | 2026-09-04 | Data protection is covered by a short plain-language terms page in the app, shown at sign-up, rather than a signed agreement per company. |
| D-051 | 2026-09-04 | The master copper rate is seeded at 3,000 KES per kg and is editable at any time; every change is recorded like a component price change. |
| D-052 | 2026-09-04 | No finished master component list exists, so the library is built and maintained inside the app by Excel upload and download; the round-trip is part of slice 1, not a go-live afterthought. |
| D-053 | 2026-09-04 | An upload matches existing rows by id column, else manufacturer part number within make, else make plus item plus description; it shows a preview of new, changed, unchanged and rejected rows before saving anything. |
| D-054 | 2026-09-04 | Uploads never delete rows; removing a component is a separate deliberate action. Price changes made by upload go to the price history with the user, time and batch. |
| D-055 | 2026-09-04 | Every library list can be downloaded to Excel, and the download doubles as the upload template. |
| D-056 | 2026-09-04 | Vercel hosts the web app. Netlify is equivalent; Vercel is named so the operations guide can give one exact set of steps. |
| D-057 | 2026-09-04 | Supersedes the three-environment plan in D-028's architecture: local and production to start, staging added in slice 6 when there is data worth rehearsing against. |
| D-058 | 2026-09-04 | Supabase free tier during building; move to the paid tier (daily backups and point-in-time recovery) before the first real quotation is released. |
| D-059 | 2026-09-04 | *(key names updated by D-077)* The project URL and browser key are public by design and live in the browser; the service role key and database password live only in GitHub secrets and a password manager, and are never shared. |
| D-060 | 2026-09-04 | Migrations reach production through a GitHub Actions workflow using repository secrets, never from a laptop. |
| D-061 | 2026-09-04 | Planning documents merged to main without a pull request, at the owner's request; work continues on the planning branch. |
| D-062 | 2026-09-04 | Security predicates (`app.current_company_id`, `is_master_admin`, `has_role`) are SECURITY DEFINER and STABLE: definer to stop a policy recursing through the table it protects, stable so they run once per statement. Enforced by a test. |
| D-063 | 2026-09-04 | People are never deleted, only deactivated: their name must stay attached to the costings they built. No delete policy exists on profiles. |
| D-064 | 2026-09-04 | Row-level security says which rows you may touch; a column guard trigger says which columns. Found during slice 0: the self-service clause on profiles let any user set is_master_admin on their own row and read every company. |
| D-065 | 2026-09-04 | user_roles carries a composite foreign key to (profiles.id, profiles.company_id), so a role row cannot name a person from another company. |
| D-066 | 2026-09-04 | company_counters stores last_no, the last number issued, and is written only by app.next_number; nobody holds an update grant on it. |
| D-067 | 2026-09-04 | A quotation number without the year runs its own continuous sequence, matching the existing NPP-192 style where the number counts all quotations ever, not per year. |
| D-068 | 2026-09-04 | The master admin can read every company but cannot edit a company's own quotation wording: support means looking, not editing someone's commercial text. |
| D-069 | 2026-09-04 | Database tests run as ordinary signed-in users against the real policies, not as an administrator, and every "must be refused" assertion states the expected error so a typo cannot masquerade as a working control. |
| D-070 | 2026-09-04 | Inviting a person runs in a Supabase Edge Function, not the browser: creating a login needs the service role key, which bypasses every rule and must never reach a browser. The function checks the caller may invite into that company before using the key. |
| D-071 | 2026-09-04 | supabase/bootstrap.sql creates the first company and master administrator by hand, because only an administrator can add people and at the start there are none. It is idempotent and covered by a test. |
| D-072 | 2026-09-04 | A database connection with no signed-in user (migration, bootstrap, service role) is treated as trusted by the column guard triggers; the API always has a signed-in user. |
| D-073 | 2026-09-04 | Route guards and hidden buttons in the web app are for tidiness only. Row-level security is the security boundary, and every rule the UI applies is enforced again in Postgres. |
| D-074 | 2026-09-04 | The toolchain is Vite, React, TypeScript strict, TanStack Query and plain CSS. No linter and no component library: fewer moving parts for someone learning to operate this, with TypeScript strict catching most of what a linter would. |
| D-075 | 2026-09-04 | Supersedes D-025: the Supabase project lives in eu-west-1 (Ireland), not London. About five milliseconds further from Nairobi, and in the EU rather than outside it. The data-protection note says Ireland. |
| D-076 | 2026-09-04 | The service role key is never collected or stored by us: Supabase provides it to the Edge Function from its own environment. The secrets a person handles are a personal access token, the project ref and the database password. |
| D-077 | 2026-09-04 | Supabase renamed its API keys: `anon` became the **publishable** key (`sb_publishable_…`) and `service_role` became the **secret** key. The app reads `VITE_SUPABASE_PUBLISHABLE_KEY` and falls back to `VITE_SUPABASE_ANON_KEY` for older projects. |
| D-078 | 2026-09-04 | The invite-user function validates the caller's token with the privileged client rather than building a second client from the browser key. One fewer environment variable, and immune to a key rename. |
| D-079 | 2026-09-04 | Two-factor authentication on GitHub, Supabase and Vercel is required before real customer data exists, with recovery codes stored alongside the database password. The app holds other companies' commercial data, so account takeover is the likeliest route to a breach. |
