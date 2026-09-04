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
- `option_label` text nullable — panels sharing a label form one priced option
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

### Storage
- Bucket `quotations`, private. Object path `{company_id}/{quotation_id}.pdf`.
- Policy: first path segment equals `app.current_company_id()::text` (read and write), or master admin (read).
- Bucket `logos`, private, same pattern. Holds the header logo and the footer strip images.

### Tests
`supabase/tests/` holds pgTAP tests run in CI on every migration change:
- A user of company A cannot select, insert, update or delete rows of company B in any tenant table.
- A company admin cannot change `discount_pct` or master rows.
- Master admin cannot write tenant rows.
- Calculation test: a fixture costing produces known totals from the views.
