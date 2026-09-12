# Data model

Proposed tables for release 1. Names are final unless a migration says otherwise. Reading
guide: **bold** is a table, `code` is a column, → is a foreign key.

## Conventions

- Every table has `id uuid primary key default gen_random_uuid()`, `created_at`, `updated_at`, `created_by → profiles`.
- Every tenant-owned table has `company_id → companies`. Row-level security uses it.
- Library tables (components, assemblies, labour rates) allow `company_id NULL`, meaning "master row, visible to all companies".
- Money columns are `numeric(14,2)`. Percentages are `numeric(6,3)` holding e.g. `16.000`. Hours are `numeric(8,2)`. Quantities are `numeric(12,3)`.
- Statuses are Postgres enums so invalid values are impossible.
- Soft delete is done with `is_active` flags on library and CRM tables; costings are never deleted.

## Relationship overview

```
companies ─┬─ profiles ── user_roles
           ├─ company_settings
           ├─ company_counters
           ├─ labour_rates (also master rows with company NULL)
           ├─ material_rates (also master rows) ── material_rate_history
           ├─ import_batches (also master-library uploads)
           ├─ components (also master rows) ─┬─ component_price_history
           │                                 └─ → material_rates (rate-based components)
           ├─ assemblies (also master rows) ─┬─ assembly_components → components
           │                                 └─ assembly_labour
           ├─ company_assembly_hours → assemblies
           ├─ customers ─┬─ contacts
           │             └─ projects
           ├─ enquiries → customers, contacts, projects
           ├─ costings → enquiries
           │     ├─ costing_labour_rates
           │     ├─ costing_panels ── costing_assemblies ─┬─ costing_items
           │     │                                        └─ costing_labour
           │     └─ costing_history
           └─ quotations → costings, customers, contacts
                 └─ quotation_followups
```

## 1. Tenancy and auth

**companies**
- `name`, `kind` enum (`in_house`, `external`, `buyer`)
- `currency_code` char(3), `exchange_rate` numeric(14,6) — KES per 1 unit of currency (1 for KES)
- `currency_label` text, default `KES` — the word printed on quotations (the reference prints "KSH")
- `discount_pct` — set only by master admin
- `material_margin_pct`, `labour_margin_pct`, `tax_pct` default 16
- `price_rounding_step` numeric default 100 — panel unit price is rounded up to a multiple of this
- `quotation_prefix` text default `QT`, `quotation_no_includes_year` boolean default false
- `address`, `tax_pin`, `logo_path` (header logo), `is_active`

**company_settings** (one row per company)
- `company_id` unique
- Letterhead: `po_box`, `street_address`, `phones`, `email`
- Footer: partner and certification marks (see **company_footer_logos**)
- Cover letter defaults: `salutation`, `intro_text`, `closing_text`, `signatory_name`, `signatory_email`
- Annexure defaults: `default_notes_on_offer`, `scope_of_supply`, `validity_days` (default 30), `payment_terms`, `delivery_terms`, `delivery_timelines`
- `bank_details`, `quotation_footer`

**company_footer_logos**
- `company_id`, `image_path`, `caption` (optional, e.g. `Siemens`), `sort_order`
- Printed as a strip in the quotation footer: partner logos (Siemens, C&S) and certification marks. Any company may add its own.

**profiles** (one row per auth user)
- `id` = `auth.users.id`
- `company_id`, `full_name`, `email`, `is_master_admin` boolean, `is_active`

**user_roles**
- `user_id → profiles`, `company_id`, `role` enum (`company_admin`, `costing_engineer`, `approver`)
- unique (`user_id`, `role`)

**company_counters**
- `company_id`, `kind` enum (`costing`, `quotation`, `enquiry`), `year` int (0 when the number has no year), `last_no` int (the last number issued)
- unique (`company_id`, `kind`, `year`)
- Function `app.next_number(kind)` locks the row and returns e.g. `CM-2026-0007` or, for quotations, the bare sequence that the release function formats as `NPP-193-REV0` using the company prefix and the costing revision.

## 2. Library

**component_categories** (master-only, seeded)
- `code` (`switchgear`, `busbar`, `accessories_hardware`, `enclosure_parts`), `name`, `sort_order`

**components**
- `company_id` NULL = master
- `category_id → component_categories`
- `code`, `name`, `description`, `unit`, `manufacturer` (make), `part_number` (manufacturer reference)
- `pricing_mode` enum (`fixed`, `weight_rate`)
- fixed: `unit_price`, `currency_code` (KES for master rows; company currency for private rows)
- weight_rate: `weight_per_unit` (kg per unit, e.g. kg per metre of bar), `material_rate_id → material_rates`; `unit_price` NULL
- `is_active`
- unique (`company_id`, `code`) — Postgres treats NULLs as distinct, so a unique index uses `coalesce(company_id, '00000000-…')`

**component_price_history**
- `component_id`, `old_price`, `new_price`, `changed_by`, `changed_at`, `import_batch_id` nullable
- Filled by a trigger on `components` when `unit_price` changes, whether the change came from a screen or from an Excel upload.

**process_types** (seeded, fixed)
- `code` (`assembly`, `wiring`, `busbar`), `name`, `sort_order`

**labour_rates**
- `company_id` NULL = master default in KES
- `process_type → process_types`, `hourly_rate`
- unique (`company_id`, `process_type`)

**material_rates**
- `company_id` NULL = master default in KES
- `code` (e.g. `copper_busbar`), `name`, `unit` (kg), `rate`
- unique (`company_id`, `code`)
- Seeded with copper busbar at 3,000 KES/kg. Editable by the master admin (master row) or company admin (own row).

**material_rate_history**
- `material_rate_id`, `old_rate`, `new_rate`, `changed_by`, `changed_at`
- Filled by a trigger, like `component_price_history`.

**import_batches** (audit of every Excel upload)
- `company_id` (NULL for a master-library upload), `user_id`, `target` enum (`components`, `assemblies`), `file_name`, `at`
- Counts: `rows_new`, `rows_changed`, `rows_unchanged`, `rows_rejected`
- `details` jsonb — the rejected rows and their reasons, kept so a user can see what went wrong
- Components and assemblies created or changed by an upload carry `import_batch_id` so a bad upload can be traced.

**assemblies**
- `company_id` NULL = master
- `code`, `name`, `description`, `is_active`

**assembly_components**
- `assembly_id`, `component_id`, `quantity`, `sort_order`
- Check (trigger): a master assembly may only reference master components; a private assembly may reference master components or components of the same company.

**assembly_labour**
- `assembly_id`, `process_type`, `hours`
- unique (`assembly_id`, `process_type`)

**company_assembly_hours** (company override of master hours)
- `company_id`, `assembly_id`, `process_type`, `hours`
- unique (`company_id`, `assembly_id`, `process_type`)

View **v_component_prices** — for the calling user's company: every visible component with
`unit_price` already discounted and converted, or computed from weight × the company's material
rate for `weight_rate` components. Master admin sees master price, discount and
converted price side by side.

View **v_assembly_hours** — for the calling user's company: each assembly and process type
with `effective_hours`, `source` (`master`, `company_override`, `private`) and `master_hours`.

### Added by migrations 0008 and 0009 (reference document §5, decisions 1, 2, 11)

**currency_factors** (decision 2)
- `company_id` NULL = master default; `currency_code` (three letters), `landed_factor` (**KES per 1 unit, landed**: exchange rate, freight, duty and handling in one admin-maintained number, decision 2), `note`
- unique (`company_id`, `currency_code`); master rows seeded `KES 1` and `EUR 200` (the NPP-192 figure); the migration also adds a master row for any currency an existing company already works in, at that company's exchange rate
- **currency_factor_history** filled by a SECURITY DEFINER trigger on either column

View **v_currency_factors** — per master currency: the company's own figures where set, else the master's, with `source`, the master figures, `master_id` and `own_id`.

**components** — `unit_price` and `currency_code` were **renamed** `purchase_price` (four decimals) and `purchase_currency` (one price, never two that can disagree); `is_enclosure_cubicle` added (decision 1); `rating`, `poles`, `breaking_capacity`, `frame_size` (text, parsed from the catalogue by the owner's clean-up; informational). A trigger upper-cases the currency and refuses one with no master factor row. `component_price_history` gained `purchase_currency`.

**material_rates** — `currency_code` (default KES); the master copper row is **15 EUR per kg** (decision 3). `v_material_rates` lands the rate through that currency's factor (`kes_per_kg` = 15 × 200 = 3,000) and converts into the company currency (`rate`); `rate_entered`/`currency_code` show the row as typed. The kg-per-metre table is the busbar components' `weight_per_unit`, seeded as catalogue EUR ÷ 15.

`v_component_prices` now computes `landed_price_kes = purchase × landed_factor` (company row else master row for that currency), then the discount (master rows only) and the company currency; `raw_price` is the purchase price; new columns `purchase_currency`, `landed_factor`, `landed_price_kes`, `is_enclosure_cubicle`, `rating`, `poles`.

**kit_groups** (decision 11) — `company_id` NULL = master; `name`, `description`, `sort_order`; unique name per owner.

**kit_group_labour** — `kit_group_id`, `process_type`, `hours`; unique per pair. Applies to every kit in the group unless the kit's own `assembly_labour` row overrides that process type.

**assemblies** (= kits) — added `kit_group_id → kit_groups`, `rating`, `rating_unit` (`A` | `KVAR`), `poles` (1–4). Trigger: a master kit may only join a master group; a private kit a master group or its own.

**assembly_components** — added `is_main_device`; partial unique index: at most one main device per kit.

`v_assembly_hours`: `effective_hours = coalesce(company override, kit's own, kit group's, 0)`; `source` gains `kit_group`; new column `group_hours`.

### Added by migration 0010 — the seed importer

- **components.is_placeholder** — a part the kits use but the catalogue does not price. The pricing check allows a null `purchase_price` only for a placeholder; `add_assembly_to_costing` refuses a kit whose line prices to null ("… has no price yet").
- **import_batches.target** also `kits`, `kit_group_hours`.
- **app.import_components(rows jsonb, category_map jsonb, to_company uuid, apply boolean, file_name text)**, **app.import_kits(rows jsonb, kit_template jsonb, to_company uuid, apply boolean, file_name text)**, **app.import_kit_group_hours(rows jsonb, to_company uuid, apply boolean)** — SECURITY DEFINER; the master admin imports into the master library (`to_company null`), a company admin into their own. The rows are the owner's files as they are (`components.csv` in the supplier template columns, `category-map.csv`, `kits.csv`, `kit-labour-template.csv`, the wide `kit-group-labour-template.csv`). Components: BOM category from the map (`app.bom_code`), overridden by a `BOM category:` note; BUSBAR rows become `weight_rate` with `weight_per_unit = price ÷ master copper rate` (reported as `busbar_kg_derived`); `rating`, `poles`, `breaking_capacity`, `frame_size` stored; a blank price makes a placeholder. Kits: group = the template's `labourGroup` (else the export section), main device = the template's `mainPart` (else the first non-busbar, non-cable, non-controls line); rating and poles parsed from the name by `app.parse_kit_name`; filled hours on a template row become `assembly_labour` overrides (`overrides` in the report); duplicate lines within a kit are merged with a warning. Each validates, compares with what exists and returns `{new, changed, unchanged, rejected[], warnings[], changes[], groups_new?, overrides?, skipped_blank?, busbar_kg_derived?}`; with `apply = true` it also writes, in one transaction, and records an `import_batches` row. A kit's code is `app.kit_code(name)`; a kit needs exactly one main device and every part in the library or it is rejected whole; a changed kit has its lines replaced and its hours kept. Public wrappers of the same names.
**companies** — `enclosure_uplift_pct` (company-set). **costings** — `enclosure_uplift_pct` frozen at creation. **costing_items** — frozen `purchase_price`, `purchase_currency`, `landed_factor`, and `uplift_pct` on cubicle lines; `master_price_kes` is the landed KES price before discount. `add_assembly_to_costing` applies the uplift to cubicles and freezes all of these.

## 3. Costing

**costings**
- `company_id`, `enquiry_id → enquiries` nullable (required from slice 4 onward for new costings)
- `costing_no` text e.g. `CM-2026-0007`, `revision_no` int default 0
- `family_id` uuid — shared by all revisions of one costing; `previous_revision_id → costings` nullable
- `is_current` boolean — exactly one true per family
- `title`, `notes`
- `status` enum (`draft`, `submitted`, `approved`)
- Frozen at creation: `currency_code`, `exchange_rate`, `discount_pct`, `material_margin_pct`, `labour_margin_pct`, `negotiation_margin_pct` (default 0, editable in draft), `price_rounding_step`, `tax_pct`
- `quotation_seq` int nullable — issued at first release, shared by all revisions of the family
- `submitted_by`, `submitted_at`, `approved_by`, `approved_at`, `returned_by`, `returned_at`, `return_comment`
- unique (`company_id`, `costing_no`, `revision_no`)

**costing_labour_rates** (frozen copy of company rates)
- `costing_id`, `process_type`, `hourly_rate`

**costing_panels**
- `costing_id`, `company_id`, `name`, `tag`, `quantity`, `uom` default `PC`, `sort_order`
- `option_label` text nullable — panels sharing a label form one priced option; the costing names
  which one it means in `chosen_option_label` (0109)
- `technical_description` text — printed in Annexure IV; drafted by the app, edited by the engineer
- `enclosure_dimensions` text, e.g. `2100(H) x 3500(W) x 800(D) mm`

**costing_assemblies**
- `panel_id → costing_panels`, `company_id`
- `source_assembly_id → assemblies` nullable (null if the assembly was later deleted or the line was created ad hoc)
- `code`, `name` snapshots, `quantity`, `sort_order`

**costing_items**
- `costing_assembly_id`, `company_id`
- `source_component_id → components` nullable
- Snapshots: `code`, `name`, `category_code`, `unit`
- `quantity`
- `pricing_mode`, `weight_per_unit` and `material_rate` (frozen, rate-based items only)
- `master_price_kes` nullable (null for private and rate-based components), `discount_pct`, `exchange_rate`, `unit_price` (company currency, frozen)

**costing_labour**
- `costing_assembly_id`, `company_id`, `process_type`
- `hours` (editable), `source_hours`, `source` (`master`, `company_override`, `private`, `manual`)
- `hourly_rate` (frozen)

**costing_history**
- `costing_id`, `company_id`, `user_id`, `action` text, `details` jsonb, `at`
- Append-only: no update or delete policy for anyone.

Views (the only place the formula lives):
- **v_costing_assembly_totals** — material, labour per costing assembly line and × quantity
- **v_costing_panel_costs** — material and labour cost of one panel
- **v_costing_panel_prices** — material sell, labour sell, negotiation, rounded unit price, panel total; grouped by `option_label`
- **v_costing_totals** — per option and overall: subtotal, VAT, grand total
- **v_costing_items_by_category** — flattened item list with effective quantity (item qty × assembly qty × panel qty), used by BOM exports

Functions:
- `app.create_costing(title, enquiry_id)` — issues number, freezes company settings and rates
- `app.add_assembly_to_costing(panel_id, assembly_id, qty)` — copies items with frozen prices and hours
- `app.submit_costing(id)`, `app.approve_costing(id)`, `app.return_costing(id, comment)` — status transitions with role checks and history rows
- `app.create_costing_revision(id)` — deep copy, revision_no + 1, moves `is_current`

### Added by migration 0011 — the costing engine

- **costing_assemblies.kind** `kit | free`. Each panel had at most one `free` holder (0014 makes it one per section), created on demand by `app.free_line(panel_id)`; a trigger keeps its quantity at 1. It holds components added on their own and typed lines; it has no labour.
- **costing_items.is_manual** — a typed line: `code MANUAL-nnn`, no source, price as entered.
- **app.freeze_component(costing, holder, company, component, qty, sort)** — the one place a catalogue component is priced into a costing (every frozen column, cubicle uplift, refusal of an unpriced part). `add_assembly_to_costing` loops over the kit's lines with it; **app.add_component_to_costing(panel, component, qty)** uses it for a loose component (same component twice adds quantities); **app.add_manual_item(panel, name, category, unit_price, qty, unit, make, part_no)** writes a typed line.
- **app.create_costing_revision** now copies `kind` and every column added since 0004 (`purchase_price`, `purchase_currency`, `landed_factor`, `uplift_pct`, `is_manual`, `enquiry_id`, `enclosure_uplift_pct`). Before 0011 a revision silently dropped the frozen workings.
- View **v_kits** — kits with `group_name`, `rating`, `poles`, `main_device_code/name`, `has_unpriced_part` (for the signed-in company) and `line_count`: what the costing picker lists.

## 4. Quotation

**quotations**
- `company_id`, `costing_id` (approved and current at release time)
- `reference_no` as printed, e.g. `NPP-193-REV1`; unique per company
- `customer_id`, `contact_id`, `client_snapshot` jsonb (name and address as printed)
- Cover letter: `subject`, `salutation`, `intro_text`, `closing_text`, `signatory_name`, `signatory_email`
- `notes_on_offer` text
- `terms` jsonb with keys `scope_of_supply`, `validity`, `payment`, `delivery_terms`, `delivery_timelines`
- `letterhead_snapshot` jsonb
- `pdf_path` (Storage object path), `released_by`, `released_at`
- `status` enum (`released`, `sent`, `won`, `lost`), `sent_at`, `decided_at`, `lost_reason`

**quotation_followups**
- `quotation_id`, `company_id`, `due_on` date, `note`, `assigned_to → profiles`, `done_at`

Function `app.release_quotation(costing_id, pdf_path, texts…)` — checks role and status, issues the quotation sequence on first release of the family, formats the reference from prefix, optional year, sequence and revision, inserts the row, writes history.

## 5. CRM

**customers** — `company_id`, `name`, `address`, `city`, `country`, `tax_pin`, `notes`, `is_active`
**contacts** — `company_id`, `customer_id`, `name`, `email`, `phone`, `job_title`, `is_primary`, `is_active`
**projects** — `company_id`, `customer_id`, `name`, `site_location`, `notes`, `is_active`
**enquiries** — `company_id`, `enquiry_no` e.g. `EN-2026-0012`, `customer_id`, `contact_id` nullable, `project_id` nullable, `received_on`, `description`, `source`, `status` enum (`open`, `quoted`, `won`, `lost`, `closed`), `stage` text nullable (reserved for pipeline), `owner_user_id → profiles`

Reserved for later phases (designed, not created in release 1):
- **activities** — `company_id`, `customer_id`, `enquiry_id`, `kind` (call, meeting, note), `note`, `at`, `user_id`
- **sales_targets** — `company_id`, `user_id`, `period_start`, `period_end`, `target_amount`
- **email_log** — `company_id`, `quotation_id`, `to`, `subject`, `sent_at`, `status`

## 6. Tenant isolation

### Helper functions (schema `app`, `security definer`, `stable`)
- `app.current_company_id()` — company of the signed-in user from `profiles`
- `app.is_master_admin()` — `profiles.is_master_admin`
- `app.has_role(text)` — true if `user_roles` has that role for the signed-in user
- Postgres caches these per statement, so policies stay fast.

### Policy pattern
For every tenant-owned table:

| Operation | Allowed when |
|---|---|
| SELECT | `company_id = app.current_company_id()` OR `app.is_master_admin()` |
| INSERT / UPDATE / DELETE | `company_id = app.current_company_id()` AND the role check for that table |

The master admin gets no write policy on tenant tables, so read-only is enforced by the
database, not by the UI.

For library tables with master rows:

| Operation | Allowed when |
|---|---|
| SELECT | `company_id IS NULL` OR `company_id = app.current_company_id()` |
| write on master rows (`company_id IS NULL`) | `app.is_master_admin()` |
| write on private rows | `company_id = app.current_company_id()` AND `app.has_role('company_admin')` |

Role checks per area:
- companies, company_settings, user_roles, labour_rates, material_rates: company_admin (own company), master admin (all, including `discount_pct` which company_admin cannot change — enforced by a trigger)
- costings and children: costing_engineer or approver for writes in draft; status functions check the approver role
- quotations: approver to release; costing_engineer or approver to change status and follow-ups
- CRM tables: costing_engineer or approver

### Added by migration 0012 — correcting a person added by mistake

- **app.person_columns()** — every `uuid` column in `public` named `created_by`, `submitted_by`, `approved_by`, `returned_by`, `released_by`, `changed_by`, `user_id`, `assigned_to` or `owner_user_id`, except on `profiles` and `user_roles`. Listed by query, not by hand, so a table added later is counted without another migration.
- **app.person_footprint(uid)** / **app.person_footprints()** — how many rows anywhere name a person; the second returns one row per person the caller administers (master admin: everybody; company admin: their own company; anyone else: nothing). Zero means an invitation can still be undone.
- **app.move_person(uid, to_company)** — master admin only; refuses a person with any records, the master admin, and an unknown or inactive company. Roles are rewritten for the new company because `user_roles` keys on `(user_id, company_id)`.
- Public wrappers `person_footprint`, `person_footprints`, `move_person`; `grant execute` to `authenticated`.
- Deleting a person is the **remove-user** Edge Function (it needs the secret key): master admin only, and only at a footprint of zero. `profiles.id` cascades from `auth.users`, so profile and roles go with the login.

### Added by migration 0014 — sections inside a panel

- **panel_sections** — `name` (primary key), `sort_order`. Master-only reference data with the
  same policies as `component_categories`: everybody reads, the master admin writes. Seeded
  Incomer, AVR bypass, ATS, 2nd incomer, Outgoers, Accessories, APFC bank.
- **costing_assemblies.section** — free text, nullable. Deliberately not a foreign key to
  `panel_sections`: the seeded names are what the pickers offer, not a constraint, so a panel
  can hold a section nobody thought of. Null means the line is in no section and sorts last.
- The unique index `costing_assemblies_one_free_per_panel` becomes
  **costing_assemblies_one_free_per_section** on `(panel_id, coalesce(section, ''))` where
  `kind = 'free'`: each section has its own loose-parts holder.
- **app.clean_section(text)** — null, blank and spaces all mean "no section"; every function
  below passes its argument through it.
- **app.free_line(panel, section)**, **app.add_assembly_to_costing(panel, kit, qty, section)**,
  **app.add_component_to_costing(panel, component, qty, section)** and
  **app.add_manual_item(…, section)** each take the section as a last argument defaulting to
  null. The old signatures are dropped rather than kept beside the new ones, because two
  functions of one name where the extra argument has a default cannot be told apart.
- **app.create_costing_revision** copies `section` — its column list drops anything not named
  in it, which is the bug fixed in 0011.

### Added by migration 0013 — the history says who

- **v_costing_history** (security invoker) — `costing_history` left-joined to `profiles` for
  `full_name`. `costing_history.user_id` is a bare uuid with no foreign key, so nothing could
  follow it to a name; the view supplies the join and the screen reads the view instead of the
  table. A **left** join and no foreign key on purpose: a history row outlives the person in it
  (0012 removes a person with no records, but an approval written years ago stays), so
  `full_name` is simply null when the person has gone, or when a master admin reads another
  company's row. Row visibility is unchanged — the view runs as the caller, so the table's
  policies still decide what is returned.

### Added by migration 0015 — copying

- **app.write_history(costing, action, details)** — the one way an ordinary function writes a
  history row: SECURITY DEFINER (a signed-in user has no insert of their own on
  `costing_history`, which is what makes it a log), and it still checks the costing belongs to
  the caller's company.
- **app.copy_panel(source_panel, target_costing, new_name)** — copies a panel with its
  sections, lines and hours into an editable draft of the same company. Not SECURITY DEFINER:
  it prices through `v_component_prices`, which resolves for the signed-in company, and every
  insert goes through the ordinary policies. Catalogue lines are re-frozen through
  `app.freeze_component` at today's rates; typed lines keep their price; a line that cannot be
  re-priced is copied as it was. Returns `{panel_id, repriced, kept}` where `kept` lists those
  lines with `code`, `name`, `unit_price` and a reason.
- **app.copy_costing(source, new_title, enquiry)** — `app.create_costing` for the new job (new
  number, new family, revision 0, today's company settings), then `copy_panel` for each panel,
  then a `copied` history row naming the source. Returns
  `{costing_id, costing_no, title, from_costing_no, repriced, kept}`.
- Public wrappers `copy_costing` and `copy_panel`; `grant execute` to `authenticated`.

### Added by migration 0016 — one enquiry, one decision

- **quotation_status** gains **superseded**: another offer against the same enquiry won, so this
  one is off the table. It is not "lost": nobody turned it down.
- **enquiries.won_quotation_id** (composite foreign key `(won_quotation_id, company_id) →
  quotations (id, company_id)`, `on delete set null`) and **enquiries.lost_reason**. The
  composite key needs `quotations` unique on `(id, company_id)`, added here.
- **app.decide_enquiry(enquiry, 'won'|'lost', winning_quotation, reason)** — SECURITY DEFINER,
  company and role checked. Won: the named quotation (which must belong to that enquiry) becomes
  `won` and every other `released`/`sent` quotation of the enquiry becomes `superseded`; the
  enquiry becomes `won` and names the winner. Lost: a reason is required, every live quotation of
  the enquiry becomes `lost` with it, and the enquiry keeps it too. One history line per current
  costing of the enquiry. Returns `{enquiry_id, decision, decided, superseded}`.
- `app.set_quotation_status` is unchanged and still decides a quotation whose costing has no
  enquiry — there is nowhere else to decide it.

### Added by migration 0017 — files kept with an enquiry

- **enquiry_attachments** — `enquiry_id`, `company_id`, `file_name`, `path` (unique), `mime_type`,
  `size_bytes`, `note`, timestamps, `created_by`. Composite foreign key
  `(enquiry_id, company_id) → enquiries (id, company_id)` on delete cascade, so a file can never
  hang off another company's enquiry and a deleted enquiry takes its records with it. Read for
  the company (and the master admin); write for whoever may edit costings; audit triggers.
- Bucket **attachments**, private, 20 MB a file, any type, in the same `do $$` storage guard as
  0006 so the test harness still runs. Path `{company_id}/{enquiry_id}/{timestamp}-{name}`; the
  policy checks the first folder, as the other two buckets do.
- The screen uploads the file first and writes the row second, taking the file back out if the
  row is refused, so the two never disagree.

### Added by migration 0100 — foundations F1 to F3 (advanced track)

The first advanced-track migration, numbered from 0100 so it can never collide with a
basic-track number on `main` (D-170). Nothing in it changes a price.

**components** (F1) — `supplier` (who invoices, as against `manufacturer`, which is the brand the
quotation prints); `attributes` jsonb typed by category; `replaced_by → components` with a check
that a part cannot replace itself; `datasheet_url`; `lead_time_days`; `price_valid_from` and
`price_source`. **`status`** is a **generated** column — `placeholder` when `is_placeholder`,
`obsolete` when not `is_active`, else `active` — because `is_placeholder` is load-bearing today
(the `components_pricing_fields` constraint allows a null price only for a placeholder, and
`app.freeze_component` refuses an unpriced non-placeholder). Writing it raises *"column status can
only be updated to DEFAULT"*, which is the point: a silent revert would be worse (D-175).
**component_price_history** gained `source`.

**assemblies** (= kits, F2) — `version` (default 1), `customer_wording`, `compatibility_rules`
jsonb, `tags text[]` with a GIN index, and a generated `status` of `active`/`retired` from
`is_active`. **assembly_components** — `qty_expression` (null everywhere today; the engine rule is
null means use `quantity`) and `customer_wording`.

**kit_parameters** — `assembly_id`, `name`, `value_type`, `unit`, `default_value`, `min_value`,
`max_value`, `sort_order`; unique per kit and name; `kit_parameters_min_not_above_max` named so the
message says what is wrong. Empty in phase 1. Parent-derived RLS, like `assembly_components`.

**costing_assemblies.source_version** — the kit version a line was copied from. The composition
freeze itself already existed: `add_assembly_to_costing` snapshots the kit's code and name and
copies every line into `costing_items` with its price frozen, and `source_assembly_id` is
`on delete set null` provenance only, so editing or deleting a master kit cannot reach an existing
costing (D-177). Test 23 proves it: a kit is renamed, a line's quantity changed, a line removed, a
line added, the version bumped and the kit retired, and the costing's lines stay identical.

**costing_panels.productivity_factor** (F3) — `numeric(6,3) not null default 1.0`, `> 0`. The one
change that touches the pricing views: `v_costing_panel_costs.labour_cost` and `.hours` are
multiplied by it, so every view above — panel prices, totals, the price schedule — picks it up
unchanged. `labour_cost_standard` and `hours_standard` are appended beside them so the adjustment
can always be explained, the same rule the frozen price columns follow. At 1.0 the arithmetic is
identical, which is why test 15 is unmodified. There is deliberately no costing-wide factor
(D-186).

**labour_actuals** — `company_id`, `costing_id`, `panel_id`, `process_type`, `hours`, `source`
(`manual`/`timesheet`), `note`, `recorded_at`, with the same composite foreign keys the costing
tables use. Never read by the pricing engine. Tenant-owned RLS.

**labour_rate_history** — `labour_rate_id`, `old_hourly_rate`, `new_hourly_rate`, `changed_by`,
`changed_at`, filled by a SECURITY DEFINER trigger. `labour_rates` was the only rate table with no
history; `components`, `material_rates` and `currency_factors` all keep a current value plus a
history table, and effective dating exists nowhere in this schema, so this matches the pattern
rather than the roadmap's `valid_from` wording (D-176).

**v_component_prices** gained the new component columns (appended, so everything selecting by name
is unaffected), which is how the component form shows and edits them without a second query.

`app.add_assembly_to_costing` records `source_version`; `app.create_costing_revision` and
`app.copy_panel` carry `source_version` and `productivity_factor`. Those three column lists are
written by hand, and a column added later and forgotten in them is dropped silently — the bug
migration 0011 had to fix once already.

### Added by migration 0101 — foundations F4 to F6 (advanced track)

**costing_panels** — `parameters` jsonb (the board's defining answers: incomer rating, sources,
form, IP, access, cable entry, APFC kVAr, enclosure dimensions; empty today) and `is_option`
(priced and printed but left out of the total; `option_label` stays the grouping, D-179).

**costing_assemblies** and **costing_items** — `origin` (`manual` / `kit` / `configurator` /
`import` / `ai_proposal`, checked) and `origin_ref`, a bare uuid naming an assistant proposal or an
import job (D-189). Back-filled: `kit` where the holder is a kit, `manual` otherwise.
`app.freeze_component` gained `line_origin` and `line_origin_ref` as trailing parameters with
defaults; `add_assembly_to_costing` passes `kit`; the apply step of an assistant proposal will pass
`ai_proposal` and the proposal id. `create_costing_revision` and `copy_panel` carry all four
columns; test 24 proves it through a revision and a copy.

**documents** — replaces `enquiry_attachments` (D-190). `company_id`, `entity_type` (`enquiry` /
`costing` / `quotation` / `component` / `supplier_price_list`), `entity_id` (nullable for a price
list that belongs to nothing yet), `file_name`, `path` (unique), `mime_type`, `size_bytes`, `note`,
`extracted_text`, `extraction_status` (`pending` / `done` / `failed` / `unsupported`),
`extraction_error`, `extracted_at`. Two triggers replace the composite foreign key:
`documents_check_entity` refuses an enquiry, costing or quotation that is not the company's, and
`documents_follow_entity` on those three tables deletes the rows when the record goes. Rows from
`enquiry_attachments` were copied with their paths unchanged, so nothing in storage moved. Read for
the company and the master admin; write for whoever may edit costings. The `attachments` bucket is
unchanged.

**activity_log** — `company_id`, `actor_user_id` (null for the assistant or a job), `actor_kind`
(`user` / `assistant` / `system`), `entity_type`, `entity_id`, `action`, `before`, `after`, `note`,
`created_at`. Append-only: only `app.write_activity(...)` (SECURITY DEFINER, company from the
caller) may insert, and nobody may update or delete. `costing_history` is untouched (D-178).

### Added by migration 0102 — foundations F7 to F11 (advanced track)

**approval_rules** — per company, ordered: `name`, `condition` (a jsonb list of
`{field, op, value}`, all of which must hold; `[]` always holds), `outcome` (`auto_approve` /
`require_approver` / `require_master_admin` / `block`), `is_active`. One rule per company is
seeded, "Always require an approver", and a new company gets it at birth.
`app.costing_facts(costing)` returns what a rule can test (`total_ex_vat`, the margins,
`profit_margin_pct` = the lower of material and labour, `uses_placeholder_part`,
`price_age_days`, `status`); `app.evaluate_approval_rules(costing)` returns the first holding rule
with the facts, or `require_approver` when none holds. **The lifecycle does not call it** (D-192).

**quotations.valid_until** — set by `release_quotation` to today plus `validity_days`.
**costings.price_snapshot_at** — set by `create_costing`, carried by a revision, fresh on a copy;
back-filled to `created_at` (D-194).

**import_jobs** (`company_id` null = master library, `user_id`, `type` = `catalogue` / `kits` /
`kit_group_hours` / `bom` / `price_list` / `labour_hours`, `document_id → documents`, `file_name`,
`status` = `preview` / `applied` / `failed` / `discarded`, `column_mapping`, `summary`,
`rows_total`, `legacy_batch_id → import_batches` unique, `started_at`, `finished_at`) and
**import_rows** (`job_id`, `row_number`, `raw`, `matched_entity_id`, `match_method`, `status`,
`message`). Filled by the `import_batches_mirror` trigger on insert and update of
`import_batches`, so the three importers of 0010 are untouched; batches from before 0102 got a job
row each (D-191).

**company_options** — `company_id`, `key`, `value` jsonb, `value_type`; unique per company and
key. `app.company_option(key, fallback)` reads the caller's own. Seeded for every company, and
for a new one at birth, with `ai_enabled` false, `ai_monthly_token_budget`,
`ai_price_age_warning_days` 90 and `ai_min_margin_pct`. A company admin writes; only the master
administrator may change `ai_enabled` (trigger `company_options_protect_master`, D-193).
`company_settings`, the older wide table, is unchanged.

**assistant_conversations** (`company_id`, `user_id`, `entity_type` enquiry / costing,
`entity_id`, `title`, `tokens_in`, `tokens_out`, `cost_usd`), **assistant_messages**
(`conversation_id`, `role` user / assistant / tool, `content`, `tool_calls`, `tool_results`
trimmed, `model`, tokens, `latency_ms`) and **assistant_proposals** (`conversation_id`,
`message_id`, `company_id`, `entity_type`, `entity_id`, `type` draft_costing / review /
line_change, `status` open / partially_applied / applied / rejected / expired, `payload`,
`applied_by`, `applied_at`, `result`) — AI spec §6, empty, tenant-owned RLS, no screen yet. A line
created by applying a proposal carries `origin = ai_proposal` and `origin_ref` = the proposal id.

### Added by migration 0103 — what the assistant may ask (advanced track)

No tables and no columns: read-only `security invoker` functions, each with a `public.` wrapper
granted to `authenticated`, so row-level security answers as it does for the screen (D-198).

| Function | Returns |
|---|---|
| `costing_snapshot(costing)` | The costing as one JSON document: header, frozen settings, panels with `parameters`, every line with its items, labour, `origin`, `origin_ref` and `source_version`, the totals from `v_costing_totals`, attached documents. Null when the caller may not see it. |
| `enquiry_snapshot(enquiry)` | Customer, contact, project, the enquiry's costings and documents. |
| `document_text(document, max_chars = 200000)` | `extracted_text` cut to the ceiling, with `truncated` and the extraction status. |
| `search_kits(q, filters, lim = 20)` | Up to 50 active kits by full-text search over name, code, customer wording and labels (plus `ilike`), filtered by `rating_a`, `poles`, `category` (group name), `tag`, `brand`, `frame`; each with today's price (`v_component_prices` × quantity) and hours (`v_assembly_hours`). |
| `search_components(q, filters, lim = 20)` | Up to 50 active components by name, code, part number, description; filters `category`, `bom_category`, `brand`, `rating_a`, `poles`, `unit`; price in the caller's currency, `status`. |
| `kit_detail(kit)` | One kit with lines, prices, parameters, wording, rules, hours. |
| `company_policy()` | The caller's company: margins, rounding, VAT, terms, the four assistant options, approval rules, kit groups, categories. Never a purchase price (spec §8). |
| `price_preview(lines)` | Indicative material, labour and selling price for `[{kit_id \| component_id, qty}]` by the same divisor-and-ceil arithmetic as `v_costing_panel_prices`, nothing written; unpriced parts named under `unpriced`. |
| `assistant_allowance()` | `enabled`, `monthly_token_budget`, `used_this_month` (summed from this month's `assistant_messages`), `recent_requests` (this user's, last 60 s), `rate_limit_per_minute` 20. |
| `assistant_record_usage(conversation, in, out, cost)` | Adds to the conversation's token and cost totals. The one writer, and it writes only its own row. |

### Added by migration 0104 — applying what the assistant proposed (advanced track)

No tables and no columns. Functions, `security invoker`, wrapped in `public.` and granted to
`authenticated` (D-205):

| Function | What it does |
|---|---|
| `apply_proposal(proposal, decisions)` | Applies the lines a person accepted. `decisions` is `{lines: [{panel, line, kind, ref_id, qty, section}], title?}` for a draft, `{finding, panel_id?}` for a review, `{panel_id?}` for a line change. A draft on an enquiry creates a draft costing through `create_costing`; lines go in through `add_assembly_to_costing` / `add_component_to_costing` and are stamped `origin = ai_proposal`, `origin_ref` = the proposal. Sets the proposal to `applied` or `partially_applied`, records `result` (the costing, the lines, the findings applied) and writes `proposal.applied` to the activity log — `actor_kind = user`, because the assistant proposed and a person applied. |
| `apply_line_change(proposal, costing, change, panel)` | One `add` / `change_qty` / `remove` / `set_parameter`: a review's inline fix, or a `line_change` proposal. |
| `apply_proposal_line(proposal, panel, kind, ref, qty, section)` | One line through the engine, with its provenance stamped. Reports `merged` when the engine added to a line that was already there, rather than claiming it. |
| `reject_proposal(proposal, reason)` | Status `rejected` with the reason, and `proposal.rejected` in the activity log. What was already applied stays applied. |
| `assistant_usage()` | For the Assistant admin screen: six months of tokens and answers, this month by person, the month's cost, the proposal counts, and the allowance. |

Refused, as for any other edit: a costing that is not an open draft, a proposal of another company
(to them it is not there), a person without `app.can_edit_costings()`, an empty set of accepted
lines, the same proposal or the same finding twice.

### Added by migration 0105 — supplier price lists (advanced track)

No tables: the F9 framework (0102) already had them. Functions, all SECURITY INVOKER, so
`app.assert_may_import` and the library policies decide who may re-price what.

| Function | What it does |
|---|---|
| `app.normalise_part_key(text)` | A reference with every non-alphanumeric character stripped, upper case. The basis of the loose match. |
| `app.match_price_list_row(to_company, key, maker)` | Four attempts, most trustworthy first: `code`, `part_number`, `manufacturer_part_number`, `part_number_loose`. Returns the part, the method, and how many answered — more than one is a warning, never a guess. |
| `start_price_list(to_company, file_name, rows, mapping, document)` | One `import_jobs` row of type `price_list` plus one `import_rows` row per line, each with its match, old → new, `change_pct` and a status (`changed` / `unchanged` / `new` / `warning` / `rejected`). **Writes nothing else.** |
| `accept_price_rows(job, row_ids)` | Applies the rows a person accepted (all the `changed` ones when `row_ids` is null): sets `purchase_price`, `purchase_currency`, `price_valid_from`, `price_source`, clears `is_placeholder`, marks the row `accepted`, recounts the job and writes `price_list.accepted` to the activity log. |
| `discard_import_job(job, reason)` | A `preview` job nobody wants becomes `discarded`, with the reason kept. |

`app.record_component_price_change` (0008) is re-derived to write `component_price_history.source`
from the component's own `price_source`, so every price change says where it came from (D-212).
### Added by migration 0107 — importing somebody else's parts list (advanced track)

No tables: the F9 framework again, with `import_jobs.type = 'bom'` and the costing it is for kept
in `summary.costing_id`.

| Function | What it does |
|---|---|
| `match_catalogue_row(key, maker)` | The four attempts of 0105 over every component the caller can see — master and own. |
| `kits_with_main_device(component)` | The active kits that part is the main device of, with their group, line count and whether any line is unpriced. |
| `start_bom_import(costing, file_name, rows, mapping, document)` | One job and one row per line: matched part, the kit proposed where exactly one kit uses it as its main device, quantity (blank means one), and a status — `new`, `warning` (nothing matched, or several parts answer to the reference) or `rejected`. Writes nothing to the costing. |
| `add_line_with_origin(panel, kind, ref, qty, section, origin, origin_ref)` | 0104's `apply_proposal_line` with the origin as an argument, merge rule included. |
| `apply_bom_import(job, decisions)` | Brings the chosen rows onto a new panel: each row a kit, a part, a new placeholder (library only, no line) or nothing. Writes `bom.imported` to the activity log. |

The two import policies of 0102 are re-derived with one extra clause each: a `bom` job of this
company may be written by anybody who may edit costings, not only a company administrator (D-222).

### Added by migration 0106 — foundations F12, physical dimensions (advanced track)

Groundwork for the panel layout canvas (roadmap 3.8). Everything nullable; nothing in the engine
reads it.

**components** — `width_mm`, `height_mm`, `depth_mm` (each > 0 or null), `mounting_type`
(`din_rail` / `plate` / `withdrawable` / `door` / `busbar_chamber` / `other`), `clearances` jsonb
(`{top, bottom, left, right}` in mm), `weight_kg`, and `enclosure_layout` jsonb — the latter
allowed only on a row marked `is_enclosure_cubicle` (constraint `components_layout_is_enclosure`),
holding `usable_w_mm` / `usable_h_mm` / `usable_d_mm`, `busbar_chamber`, `cable_chamber` and `form`.
Appended to `v_component_prices`, which was re-derived from the 0100 text by insertion.

**assemblies** — `footprint_w_mm`, `footprint_h_mm`, `footprint_d_mm`: optional overrides. Null
means "derive it from the main device and its clearances".

**panel_layouts** — `company_id`, `panel_id`, `version` (unique per panel), `cubicles` jsonb
(each cubicle with its size and a `placements` array of kit lines at `x_mm`, `y_mm`, `w_mm`,
`h_mm`, `rotation`), `note`. Tenant-owned RLS, written by nobody yet.

| Function | Returns |
|---|---|
| `component_footprint(component)` | The space it takes: its size plus its clearances, with `area_mm2`, or `known: false`. |
| `kit_footprint(kit)` | The kit's own footprint if set, else the main device's, else `known: false` naming what is unmeasured. |
| `panel_fit(panel)` | Footprints on the panel × quantity against the usable area of its cubicles × `company_options.layout_safety_factor` (1.3): verdict `fits` / `tight` / `no_fit` / `unknown`, the areas, `used_pct`, and which kits are unmeasured. Advisory and read-only. |
| `import_dimensions(rows, to_company, apply)` | Reads `dimensions-template.csv`. Touches only the F12 columns; a blank row counts as not filled in yet. |

### Added by migration 0108 — approval rules in force, and validity (advanced track)

**quotations.expired_at** — when the sweep noticed `valid_until` had passed. A fact beside the
status, not a status (D-227). **v_quotation_validity** derives `days_left` and `has_run_out`.

| Function | What it does |
|---|---|
| `approval_review(costing)` | The verdict, and every active rule with each condition, whether it holds and the figure it looked at. Read-only; behind the "why this needs approval" panel. |
| `submit_costing` / `approve_costing` | Re-derived from 0004 by insertion: the verdict is asked for, `block` refuses naming the rule, `auto_approve` approves on the spot with `approved_by = null` and a "approved by rule" history line, `require_master_admin` refuses an ordinary approver, and the deciding rule is written into the history. With only the default rule, behaviour is unchanged. |
| `expire_quotations()` | The nightly sweep: marks every quotation whose validity passed while still released or sent, logs it as `actor_kind = system`, and raises a follow-up on the ones that had been sent. Scheduled by pg_cron where it exists; **revoked from `authenticated`**. |
| `check_my_quotation_expiry()` | The same work for the caller's own company, from a button. |
| `reissue_costing(costing)` | A new revision of an approved costing with every line priced today: `create_costing_revision` for the numbering and history, then `copy_panel` per panel for the re-pricing, and a fresh `price_snapshot_at`. |

### Added by migration 0109 — options, alternatives and optional extras (advanced track)

**costings.chosen_option_label** — which of the job's options the costing's own total means,
matching `costing_panels.option_label`. Null means no choice has been made, and the totals add
every option together exactly as they did before, which is why nothing about an existing costing
changes (D-231). Panels with no option label are common to every option and always count. Carried
by `create_costing_revision` (its hand-written column list) and by `copy_costing` (which starts
from `create_costing`, so the label is set afterwards).

**costing_panels.is_option** — read at last: an optional extra, priced and printed but out of the
total (D-230).

**v_costing_option_choice** — one row per costing: the option its total means (null when none is
chosen, **or when the label matches no panel**, so a stale label falls back to counting everything
rather than silently dropping panels), the label as typed, and how many options the job is on offer
as.

The four costing views were re-derived by insertion, appending columns only:

| View | Appended | Meaning |
|---|---|---|
| `v_costing_panel_costs` | `is_option` | An extra is costed like anything else. |
| `v_costing_panel_prices` | `is_option`, `in_chosen_offer`, `counts_in_total` | `counts_in_total` is the **one place** that decides what a total counts (D-232); the views above it sum on it. |
| `v_costing_totals` | `optional_subtotal`, `optional_tax`, `optional_total`, `chosen_option_label`, `option_count` | The first ten columns keep their names and now count the offer: the chosen option, without extras. |
| `v_costing_option_totals` | `optional_subtotal`, `optional_tax`, `optional_total`, `is_chosen` | Every option's own figures, whichever is chosen — the comparison table. Labels are trimmed. |
| `v_costing_items_by_category` | `is_option`, `in_chosen_offer` | The BOM keeps every row and marks it (D-233). |

### Added by migration 0110 — estimate against actual labour (advanced track)

`labour_actuals` (0100, foundation F3) is written and read at last. Nothing here is reachable from
the pricing engine: a costing keeps the hours it froze (D-235).

| View | What it gives |
|---|---|
| `v_panel_labour_estimate` | Per panel and process type, the hours this costing froze for the whole batch: kit hours × kit quantity × panel quantity × productivity factor — the same arithmetic `v_costing_panel_costs` prices, so the two cannot drift. |
| `v_panel_labour_variance` | Estimate against actual per panel and process: hours each way, the difference in hours and at the frozen rate, the percentage, and how many entries the actual is made of. A process appears when **either** side has something to say. |
| `v_kit_group_labour_variance` | The same by kit group, over every panel with actuals. A panel's hours are **apportioned across its kit lines in proportion to the estimate** (D-236); each row carries jobs, panels and kit units, the hours per kit each way, `suggested_hours` (actual per kit unit) and `standard_hours` (what the group says today). |

| Function | What it does |
|---|---|
| `record_actual_hours(panel, process, worked, note, source, worked_at)` | Appends an entry against that panel and process type, writes the activity log, touches no costing. Refuses negative hours and an unknown process type. |
| `remove_actual_hours(entry)` | Removes one entry — how a wrong figure is corrected — and logs it. |
| `apply_labour_suggestion(kit_group, process)` | Writes the suggested hours into `kit_group_labour`. **Security invoker**, so that table's existing policy decides who may (D-237); raises when nothing has been recorded for that group and process. Called only by a button somebody presses. |

### Added by migration 0111 — hours that belong to no kit group (advanced track)

**v_panel_labour_unattributed** — hours recorded against a panel costed at **none** of that kind
of work. 0110 shares a panel's hours across its kit lines in proportion to the estimate and
divides by the panel's estimated hours for that process, so where that figure is zero — a board
of loose parts, a kit group whose standard hours are still blank, a line added by hand — the
hours reach no kit group and, until this view, left no trace. They are named beside the report
instead: every hour recorded is either shared out or listed here, which test 33 asserts by adding
the two together.

### Added by migration 0112 — kits that work out their own quantities (advanced track)

Roadmap 3.3. `assembly_components.qty_expression` and `kit_parameters` came with F2 in 0100 and
said in their own comments that nothing read them yet. This is the engine reading them.

- **app.eval_qty_expression(expression, params)** — the parameters are substituted first
  (longest name first, so `steps` cannot eat `steps_spare`), and what remains must be digits,
  `+ - * / ( ) . ,` and `ceil`/`floor`/`round`/`greatest`/`least`. A surviving name is refused
  **by name** ("the formula uses gremlins, which is not one of this kit's parameters"), which is
  both the error message an engineer needs and the reason a formula cannot be anything but
  arithmetic. A result that is null, not-a-number or negative is refused too.
- **app.kit_parameter_values(assembly, given)** — the answers over the kit's defaults, checked
  against its ranges, with a name the kit does not have refused rather than ignored.
- **costing_assemblies.parameters** — what the line was worked out from, frozen like every other
  figure. Carried by `create_costing_revision` and `copy_panel`, whose hand-written column lists
  are the trap 0011 and 0014 each fixed once.
- **app.add_assembly_to_costing(panel, kit, qty, section, params)** — the fifth argument defaults
  to null, so the assistant (0104) and the BOM import (0107) call it unchanged. Each line's
  quantity is its formula worked out against the answers, or the fixed quantity where there is no
  formula, which is every line in the owner's library. **A line whose formula comes to zero is not
  written**: a bank of four steps has four lines, not four and an empty fifth.

Nothing about a kit with no parameters changes, which is what the existing suite passing
unaltered — NPP-192 included — is there to prove.

### Edge Functions
- **invite-user**, **remove-user** — as before.
- **extract-document** (0101) — fills `documents.extracted_text` from PDF, Word, Excel and plain
  text; the row's `extraction_status` says what happened. Called by the browser after an upload.
- **assistant** (0103) — one POST per user turn, streamed back as server-sent events. Acts as the
  caller (no service role): asks `assistant_allowance` before building any provider, stores the
  user's message and an empty assistant row, builds the system prompt from `company_policy` and the
  record's snapshot, runs the loop in `supabase/functions/_shared/ai/` (at most 12 rounds), then
  fills the assistant row with text, tool calls, trimmed results, model, tokens and latency,
  records usage on the conversation and writes an `activity_log` row (`actor_kind = assistant`)
  per proposal. Settings: `ANTHROPIC_API_KEY`, `AI_PROVIDER`, `AI_MODEL`, `AI_MODEL_FAST`,
  `AI_FALLBACKS`.

### Storage
- Bucket `quotations`, private. Object path `{company_id}/{quotation_id}.pdf`.
- Policy: first path segment equals `app.current_company_id()::text` (read and write), or master admin (read).
- Bucket `logos`, private, same pattern. Holds the header logo and the footer strip images.
- Bucket `attachments`, private, same pattern. Holds every `documents` row's file: enquiry and costing attachments today.

### Tests
`supabase/tests/` holds pgTAP tests run in CI on every migration change:
- A user of company A cannot select, insert, update or delete rows of company B in any tenant table.
- A company admin cannot change `discount_pct` or master rows.
- Master admin cannot write tenant rows.
- Calculation test: a fixture costing produces known totals from the views.
