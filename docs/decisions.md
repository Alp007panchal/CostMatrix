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
| D-080 | 2026-09-04 | History triggers (component prices, material rates) are SECURITY DEFINER because nobody holds an insert grant on the history tables: history is written by the system as a side effect, so it cannot be forged or tidied away. Found when a price edit failed outright. |
| D-081 | 2026-09-04 | A component is `fixed` or `weight_rate`, enforced by a check constraint so a row can never be half-configured: fixed needs a price and no weight, weight_rate needs a weight and a rate code and no price. |
| D-082 | 2026-09-04 | A master assembly may use only master components, and a private assembly only master or its own; enforced by trigger, so a company can always open its own costings. |
| D-083 | 2026-09-04 | Effective prices and hours live in views (`v_component_prices`, `v_assembly_hours`, `v_material_rates`), so discount, currency conversion and hour overrides are computed in one place rather than in each screen. |
| D-084 | 2026-09-04 | The app is live at cost-matrix-theta.vercel.app, Supabase project `mssqjuzgycfpfmtjukvq` in eu-west-1. Slice 0 verified in production on 2026-09-04. |
| D-085 | 2026-09-04 | Every costing child row carries both its parent and its costing, tied by a composite foreign key, so a row cannot drift into another costing and the policies stay simple and fast. |
| D-086 | 2026-09-04 | Immutability is enforced by the database, not the screens: the write policies require the costing to be a current draft, so a submitted or approved costing cannot be edited even by a direct API call. |
| D-087 | 2026-09-04 | Status changes go through SECURITY DEFINER functions that check the role, check the current status and write the history in the same transaction, so the log can never disagree with the costing. |
| D-088 | 2026-09-04 | `app.create_costing` freezes the company's currency, rate, discount, margins, rounding, VAT and hourly rates at creation. A rate rise next month cannot silently reprice an existing job. |
| D-089 | 2026-09-04 | A revision is a deep copy of the approved costing at the prices it froze, not a re-pricing. Refreshing prices is a separate, deliberate act on individual lines. |
| D-090 | 2026-09-04 | The API client reaches only the public schema, so the six costing functions have thin public wrappers that pass straight through to app. The app schema stays internal; the API surface is exactly what a screen may ask for. |
| D-091 | 2026-09-04 | Every edit in the costing editor reloads the costing from the database afterwards. The screen never computes a total; it shows what the views return. |
| D-092 | 2026-09-04 | Editable fields commit on blur rather than on every keystroke, so a person can type a number without a save firing mid-way, and the database round-trip happens once per change. |
| D-093 | 2026-09-08 | Spreadsheet reading and writing uses exceljs, loaded by dynamic import so its megabyte is fetched only by the person who clicks Download or Upload, never by someone costing a panel. |
| D-094 | 2026-09-08 | Upload matching order: the id column, then part number within the same make, then code, then make plus name. The rules are pure functions with unit tests, because matching is the easiest part of a bulk upload to get wrong. |
| D-095 | 2026-09-08 | The upload reader finds the header row rather than assuming row 1, and skips a sheet's own sub-headings, so the old costing workbooks upload directly without being reshaped first. |
| D-096 | 2026-09-08 | Duplicate codes within one uploaded file are rejected after the first, rather than applied in sequence to the same component, so the outcome does not depend on row order. |
| D-097 | 2026-09-08 | Releasing a quotation is one database function: approver only, approved and current only, issues the family's sequence on first release, freezes wording and letterhead, writes history. There is no insert or update policy on quotations; the functions are the only way in. |
| D-098 | 2026-09-08 | The PDF is rendered in the browser and stored before the release is recorded. If storing fails, nothing is recorded, so a quotation never exists without its document. |
| D-099 | 2026-09-08 | The quotation wording is pre-filled from company_settings and editable by the approver at release, then frozen on the quotation row. Blanks fall back to the company defaults inside the database function, not in the browser. |
| D-100 | 2026-09-08 | Storage buckets `quotations` and `logos` are private; object paths start with the company id and the policies check that first folder. Bucket creation is guarded on the storage schema existing, so the migration also runs on plain PostgreSQL in the test harness. |
| D-101 | 2026-09-08 | Turning a costing into the PDF's data is a pure step (prepare.ts) separate from drawing it (Document.tsx), so option grouping, numbering and wording defaults are unit-tested without rendering. |
| D-102 | 2026-09-08 | Logos are uploaded through the app into the private bucket and embedded in the PDF as data URLs. The reference files in docs/reference/logos are the source copies, not what the app reads. |
| D-103 | 2026-09-08 | @react-pdf/renderer is loaded by dynamic import from a single module (pdf/build.tsx), landing in its own chunk; the main bundle is 266 kB. |
| D-104 | 2026-09-08 | BOM exports read `v_costing_items_by_category`, which already multiplies quantities through assembly and panel quantities; the app groups and formats, never recomputes. Four category exports plus an all-in-one workbook, each as .xlsx or CSV. |
| D-105 | 2026-09-08 | The four category groups are always present in order, even when empty, so the export buttons are stable and an empty category is visibly empty rather than missing. |
| D-106 | 2026-09-08 | CSV is RFC 4180 with CRLF line ends and a UTF-8 byte-order mark, so Excel opens it correctly without an import wizard. |
| D-107 | 2026-09-08 | CRM rows (contacts, projects, enquiries) point at their customer through a composite key (customer id, company id), so a contact can never belong to a customer of another company whatever the row claims. |
| D-108 | 2026-09-08 | Enquiries are inserted only through `create_enquiry`, which issues EN-YYYY-NNNN; there is no insert policy on the table. |
| D-109 | 2026-09-08 | A costing's enquiry is optional in the database but offered first on the new-costing form, and a revision inherits it. Forcing an enquiry on every costing would have blocked a first-time user with an empty CRM. |
| D-110 | 2026-09-08 | The enquiry follows its quotation: marking a quotation sent moves an open enquiry to quoted; won or lost moves it to won or lost. Done inside `set_quotation_status`, so the two cannot disagree. |
| D-111 | 2026-09-08 | The release page picks a customer record, which fills the printed name and address; both stay editable, and the quotation keeps the record ids alongside the printed text. |
| D-112 | 2026-09-08 | Costing engineers may create customers, contacts, projects, enquiries and follow-ups; only enquiry numbering and quotation release are function-only. |
| D-113 | 2026-09-08 | `create_costing` gained an optional enquiry parameter by dropping and recreating the function rather than overloading it, so the API call cannot become ambiguous. |
| D-114 | 2026-09-09 | The owner's zip held raw catalogue CSVs and kit-export workbooks, not the processed files it described. They are committed unedited under `data/raw/` and the seed under `data/seed/` is derived from them by `scripts/build_seed.py` and `scripts/build_kits.py`, so a correction is made once in the raw file or the rule, never by hand in the seed. |
| D-115 | 2026-09-09 | `docs/reference/current-costing-and-quotation-reference.md` §5 (thirteen decisions) is the source of truth over other documents and existing code. Nine decisions are the owner's; 4, 10, 12 and 13 are proposed from the brief and marked so until the owner confirms. |
| D-116 | 2026-09-09 | Adapt, do not rebuild: slices 0–4 stay live; where §5 conflicts with the schema a forward migration (0008 onward) reshapes it. |
| D-117 | 2026-09-09 | One pull request per feature, reviewed and merged by the owner. Supersedes D-078's fast-forward to `main`; migrations reach production only when the owner merges. |
| D-118 | 2026-09-09 | Master EUR conversion is 113 KES per EUR × landed-cost factor 1.7699115 = 200 KES per EUR, back-solved from the NPP-192 Option 1 sheet where every matched catalogue part is priced at exactly EUR × 200. The owner may replace the factor with the real freight-duty-clearing figure. |
| D-119 | 2026-09-09 | Busbar stays priced by kg per metre × copper rate (decision 3) even though the workbook used catalogue metre prices; kg per metre is width × thickness × 8.96 g/cm³. The resulting 18,072 KES difference on Option 1 is an accepted, itemised difference (§6.2). |
| D-120 | 2026-09-09 | Heading rows in the catalogue (no part number and no price, or a part number repeated as description with no category) are skipped; rows kits reference but the catalogue lacks become placeholder parts with no price, flagged, so every kit imports. |
| D-121 | 2026-09-09 | Kit identity ignores case, spaces and commas; the main device is the marked line or else the first line that is not busbar, cable or controls; mislabelled lines are flagged `stray-line`, never moved. The SAMPLE kit workbook is a format sample and is not imported. |
| D-122 | 2026-09-09 | Labour hours per kit group are the owner's to supply through `data/seed/kit-group-labour-template.csv`; the exports carry none. Until filled, the app's selling price is compared with the workbook on material subtotals only. |
| D-123 | 2026-09-09 | Acceptance for the costing engine is the §6.2 table: switchgear 2,386,422.24 and busbar & cable 1,218,288.00 from the seed for NPP-192 Option 1, plus exact margin, rounding and VAT arithmetic on the workbook's material subtotal. |
| D-124 | 2026-09-09 | Session 1 runs on a branch stacked on PR 1 (`…-s1-foundation`, PR 2 targets PR 1's branch) so the owner reviews the seed and the schema separately; GitHub retargets PR 2 to `main` when PR 1 merges. The owner accepted that a §5 correction may mean redoing part of the schema. |
| D-125 | 2026-09-09 | `components.unit_price`/`currency_code` are renamed `purchase_price`/`purchase_currency` rather than kept beside new columns: one price, never two that can disagree. Existing KES rows are purchase KES at factor 1, so nothing reprices; private rows of a non-KES company are marked with that company's currency, which is what they always meant. |
| D-126 | 2026-09-09 | The landed factor is stored with eight decimals (EUR 1.76991150) because 113 × 1.769912 lands at 200.00006 and showed as 2 cents on a 380 EUR cubicle; with eight decimals the error is under a millionth. |
| D-127 | 2026-09-09 | Currency factors follow the material-rate pattern: master rows, optional company override, history by trigger, the company's own row wins in `v_component_prices`. Only currencies with a master row exist; the master admin adds them; a component in a currency without a row is refused at save. |
| D-128 | 2026-09-09 | The enclosure uplift is applied per cubicle line when a kit enters a costing (unit price × (1 + uplift)) and the percentage is frozen on the line and on the costing, so the schedule and the BOM agree and an old costing explains itself. |
| D-129 | 2026-09-09 | Hours precedence is costing line → company override → kit's own row → kit group → zero, resolved in `v_assembly_hours` so `add_assembly_to_costing` needed no change; `source = kit_group` is recorded on the costing labour line. |
| D-130 | 2026-09-09 | The `assemblies` table keeps its name; screens, buttons and messages say "kit". Renaming 200 identifiers would buy nothing and risk the live app. |
| D-131 | 2026-09-09 | The Excel round-trip gained a Currency column (or a currency word in front of the price, KSH read as KES) and an Enclosure cubicle column; a blank currency means KES so old sheets still upload. |
| D-132 | 2026-09-09 | With the eight-decimal factor (D-126) the NPP-192 Option 1 acceptance figures from the seed are switchgear 2,386,421.80 and material 4,012,709.80 (difference −152,288.00 to the shilling); D-123's 2,386,422.24 carried the 0.00006 rounding and is superseded. |
| D-133 | 2026-09-09 | The seed import runs in the database: three functions with an `apply` flag validate, compare and (when true) write in one transaction; the preview is the same function without writing, so the screen and the test suite obey one set of rules. The Excel round-trip stays for ad-hoc edits. |
| D-134 | 2026-09-09 | A part with no purchase price is a placeholder: allowed and flagged so every kit imports, refused by `add_assembly_to_costing` with the part named, and un-flagged the moment a price is entered. |
| D-135 | 2026-09-09 | A kit is rejected whole when it lacks a main device, has two, uses a part the library does not hold, or a non-positive quantity; re-importing a changed kit replaces its lines and keeps its hours and any company overrides. Imports never delete. |
| D-136 | 2026-09-09 | A kit's code is derived from its name (`app.kit_code`: letters and digits, hyphens between) so the seed needs no code column and the same name always maps to the same kit. |
| D-137 | 2026-09-09 | Test 14 loads the real `data/seed` CSVs with `\copy` and leaves them in the throwaway database, so the session-3 acceptance test builds NPP-192 Option 1 on the actual seed. |
| D-138 | 2026-09-09 | A panel has one *components and enclosure* holder (`kind = free`, quantity fixed at 1, no labour) for catalogue components added on their own and for typed lines, so the existing panel → line → item shape carries them and every total, BOM and PDF works unchanged. |
| D-139 | 2026-09-09 | A typed line (`is_manual`) is a name, category, price and quantity that lives in the costing only; it is how the workbook's uncatalogued parts and the enclosure figure are entered until the catalogue has them. |
| D-140 | 2026-09-09 | One function, `app.freeze_component`, prices a catalogue component into a costing; kits and loose components both call it, so the uplift, the frozen workings and the placeholder refusal cannot drift apart. |
| D-141 | 2026-09-09 | `create_costing_revision` had copied costing lines with the 0004 column list and dropped the frozen purchase price, factor and uplift; fixed and covered by a test. |
| D-142 | 2026-09-09 | The NPP-192 arithmetic proof uses one material margin of 28 % (the workbook's ÷0.8 and ÷0.9 combined) because the app has no labour-as-a-percentage; the material figure itself is asserted from the seed to the cent, and the app's category split differs from the workbook's by the 106,800 of cable the workbook filed under its APFC section. |
| D-143 | 2026-09-09 | The technical offer (Annexure IV) is drafted from the panel's own kits and lines by one pure function, on a button while costing and automatically at release when the engineer left it blank; the engineer's text always wins. Grouping is by kit group, then other components, then enclosure. |
| D-144 | 2026-09-09 | The four bills of materials and the price schedule needed no change for sessions 1–3: the BOM view already carries loose and typed lines with their category and the uplifted price, and the schedule reads the panel price view. Checked, not rebuilt. |
| D-145 | 2026-09-09 | Sessions 5 and 6 were a review, not a build: the database already isolated companies, applied the master discount, converted currencies and let the master admin read everything. The gaps were on screen — the master admin's lists mixed every company's rows with nothing to tell them apart — and are closed with a Company column and filter on Costings, Quotations, Customers, Enquiries and People, and a company choice on the invitation. |
| D-146 | 2026-09-09 | The home page shows open follow-ups (overdue first) so the reminder loop starts itself; a customer's details can be corrected in place (released quotations keep what they printed); a company admin edits only kits that belong to their company, on screen as in the database. |
| D-147 | 2026-09-09 | Test 16 asserts what earlier files implied: a private kit built from a master part and a private part, invisible to another company and refused by a master kit; the master admin reads another company's costing, customer and enquiry and cannot change or add to them. |
| D-148 | 2026-09-09 | The owner read §5 and confirmed decisions 4, 10, 12 and 13 as written; all thirteen are now the owner's. Supersedes the "proposed" note in D-115. |
