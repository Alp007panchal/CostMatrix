# CostMatrix — Specification

Version 0.2 — 2026-09-04 (updated after reading the reference quotation and costing workbook). This document is the source of truth for what CostMatrix does.
When a decision here changes, add a line to `decisions.md` and update this file.

## 1. Purpose

CostMatrix is a web application for end-to-end costing and quotation of electrical panel
boards (control panels, power panels, motor control centres, distribution boards).

It replaces the Excel sheets used by the costing team today. In those sheets, components are
listed with quantity and price, labour is added as a percentage of the component total, and
a profit margin percentage is added on top.

The labour method is wrong: the labour to build a panel depends on how many hours of which
kind of work it needs, not on how expensive its components are. A panel full of cheap
terminals can take longer to wire than one with a single expensive breaker. CostMatrix fixes
this by costing labour as fixed hours per assembly, per process type, at an hourly rate.

## 2. Glossary

| Term | Meaning |
|---|---|
| Component | A single purchasable item: a breaker, a contactor, a length of busbar, a gland plate. Has a category, a unit and a price. |
| Category | Grouping of components used to split BOMs: switchgear, busbar, accessories & hardware, fabricated enclosure parts. |
| Assembly (also "kit") | A standard building block of a panel: e.g. enclosure cubicle, mounting plate with switchgear, busbar set, wiring, accessories, hardware. Carries its own material list and its own labour hours. One level only; assemblies do not contain other assemblies. |
| Process type | One of three kinds of labour: panel/component assembly, wiring of electrical components, busbar fabrication and assembly. Each has an hourly rate. |
| Panel | One physical panel board inside a costing, with a quantity. Made of assemblies. May carry an option label when the customer is offered alternatives (Option 1, Option 2). |
| Rate-based component | A component priced as weight per unit × a material rate per kg (copper busbar). Its price follows the rate. |
| Fabricated part | Enclosure and sheet-metal items. Costed in a separate application; entered here as ordinary priced components in the enclosure category. |
| Costing | A priced set of panels for one job, built by a costing engineer, approved by an approver. |
| Revision | A numbered copy of an approved costing that was changed afterwards (Rev 1, Rev 2…). Older revisions are read-only. |
| Quotation | The commercial PDF released from an approved costing to the customer. |
| Enquiry | A request from a customer that leads to one or more costings. |
| Company (tenant) | An organisation using CostMatrix. Data of one company is invisible to another. |
| Master library | Components, assemblies, prices and hours maintained by the master admin and visible to all companies. |
| Private library | Components and assemblies a company creates for its own use only. |

## 3. Tenancy and roles

CostMatrix is a multi-company product. Each company is a separate tenant.

### 3.1 Companies
- Kinds: `in_house` (the operator's own company), `external` (contractors, consultants) and `buyer`. All kinds are full tenants with the same features in release 1.
- Each company has: name, working currency, exchange rate to KES, discount percentage (set by the master admin), labour hourly rates per process type, material margin %, labour margin %, VAT %, quotation defaults (payment terms, validity, bank details, terms text), logo and address.
- No company can see another company's data. The only exception is the master admin, who has read-only visibility of all company data for support.

### 3.2 Roles
| Role | Scope | Can do |
|---|---|---|
| Master admin | Whole system | Create and deactivate companies; create the first company admin of a company; set each company's discount %; maintain the master component library, master assemblies, master prices, master hours and master default hourly rates; read (not edit) any company's data. |
| Company admin | One company | Manage that company's users and their roles; set currency, exchange rate, labour hourly rates, margins, VAT %, quotation defaults; create and edit the company's private components and assemblies, including their labour hours; override master hours per assembly for the company. |
| Costing engineer | One company | Create and edit costings in draft; submit costings; create revisions of approved costings; manage CRM records; export BOMs. |
| Approver | One company | Everything a costing engineer can do, plus approve or return submitted costings and release the PDF quotation. |

- A user belongs to exactly one company.
- A user may hold several roles in that company (a small company may have one person who is admin, engineer and approver).
- The master admin belongs to the in-house company and may also hold company roles there.

## 4. Library rules

### 4.1 Categories
- Master-only list. Seeded with: `switchgear`, `busbar`, `accessories_hardware`, `enclosure_parts`.
- Every component, master or private, must have exactly one category.
- Companies cannot add categories in release 1.

### 4.2 Components
- Master components: created and edited only by the master admin. Priced in KES.
- Private components: created and edited by a company admin, visible only to that company. Priced in the company's currency. No discount applies.
- Companies cannot edit or delete master components. They can hide them from their own pick lists (later phase; not in release 1).
- Fields: code, name, description, category, unit (pcs, m, set…), manufacturer (make), part number (manufacturer reference), pricing mode, unit price or weight per unit, currency, active flag.
- Pricing mode is `fixed` (a price per unit) or `weight_rate` (weight per unit × a material rate). Busbar sizes are `weight_rate` components with kg per metre; the copper rate per kg is a material rate. Fabricated enclosure and sheet-metal parts are `fixed` components in the enclosure category, priced from the separate fabrication costing.
- Every price change is recorded in a price history with who changed it and when.

### 4.3 Assemblies
- Master assemblies: created and edited only by the master admin. May reference only master components. Carry master labour hours per process type.
- Private assemblies: created by a company admin. May reference master components and the company's own private components. Labour hours per process type are entered by the company admin.
- Companies cannot edit or delete master assemblies.
- A company admin may set company-level override hours for a master assembly, per process type. When present, these replace the master hours for that company's costings. The master hours stay visible beside the override.
- An assembly may involve one, two or all three process types. Hours for an unused process type are zero.

### 4.4 Labour rates
- Master admin maintains default hourly rates per process type in KES. These are shown to a new company as a starting suggestion.
- Each company sets its own hourly rate per process type in its own currency. These rates are what the company's costings use.

### 4.5 Material rates
- Master admin maintains default material rates in KES. Release 1 is seeded with one: copper busbar at 3,000 per kg. The rate is editable at any time, and every change is recorded with the user and time, like a component price.
- Each company sets its own material rates in its own currency. Changing a rate changes the price of every `weight_rate` component in future costings; existing costings keep the frozen value.

## 5. Pricing rules

- KES is the master currency. All master prices and master default rates are in KES.
- Each company works in one currency (KES or another). The company admin sets the currency and the exchange rate, defined as **KES per 1 unit of the company currency** (1.00 for a KES company; about 130 for a USD company).
- Price a company sees for a master component:

      unit_price = master_price_kes × (1 − discount%) ÷ exchange_rate

- The in-house company uses the same mechanism with discount 0%. There is no separate cost price.
- Rate-based components: `unit_price = weight_per_unit × company material rate`. For a master rate-based component the company's own rate is used, so discount does not apply; the weight comes from the master record.
- Private component prices are used as entered, with no discount and no conversion.
- Companies never see the undiscounted master price or their discount percentage as separate values in the costing screens; they see their price. (The master admin sees both.)

## 6. Labour rules

- Labour for an assembly = Σ over process types (hours × company hourly rate for that process type).
- Hours come from, in order of precedence: the value edited on the costing line, else the company override for that assembly, else the master hours (or the private assembly's own hours).
- On a costing line the engineer may edit hours. The source hours (override or master) are shown beside the edited value so the deviation is visible.
- Labour is never calculated as a percentage of material.

## 7. Costing model and calculation

A costing contains one or more panels. Each panel has a quantity and contains one or more
assemblies. Each assembly line has a quantity, a material list (items) and labour lines.

    unit_price (company currency) =
        master fixed component:  master_price_kes × (1 − discount%) ÷ exchange_rate
        rate-based component:    weight_per_unit × company material rate
        private component:       private_price

    assembly material   = Σ item.qty × item.unit_price
    assembly labour     = Σ over process types (hours × hourly_rate)
    panel material      = Σ assembly material × assembly.qty        (cost of one panel)
    panel labour        = Σ assembly labour   × assembly.qty
    material sell       = panel material ÷ (1 − material_margin%)
    labour sell         = panel labour   ÷ (1 − labour_margin%)
    panel unit price    = (material sell + labour sell) ÷ (1 − negotiation_margin%)
    panel unit price    = rounded UP to the company rounding step (default 100)
    panel total         = panel unit price × panel.qty
    subtotal            = Σ panel totals                              (per option, if options are used)
    VAT                 = subtotal × vat%
    grand total         = subtotal + VAT

Worked example from the reference job (one panel, qty 1, material 4,164,997.80, negotiation 0):
with the sheet's 10% profit margin applied by division, 4,164,997.80 ÷ 0.9 = 4,627,775.33,
rounded up to 4,627,800. Labour is then added as hours × rate rather than the sheet's ÷ 0.8.
VAT 16% on the printed 5,784,800 is 925,568.00 and the total 6,710,368.00, as on the quotation.

Rules:
- Margins are applied by division, ÷ (1 − margin %), as in the existing sheets, so a 20 % margin means 20 % of the selling price. The UI shows the resulting markup beside each percentage so nobody is surprised.
- Material and labour are carried separately so the two margins apply to their own part. The UI offers a "same margin for both" shortcut. The negotiation margin is a third, optional percentage per costing, default 0, applied to the whole panel price.
- The panel unit price is rounded up to the company's rounding step (default 100 in the company currency). Costs underneath stay exact. Money is stored with 2 decimal places; lines are not rounded.
- A panel may carry an option label. Panels with the same label form one option; the price schedule prints one table with its own subtotal, VAT and total per option. Panels without a label form the base offer.
- Each panel carries a technical description (free text printed in the quotation), proposed enclosure dimensions and a unit of measure (default PC). The app drafts the description from the panel's assemblies and items; the engineer edits it.
- The calculation is implemented once, in the database. Screens, PDFs and exports all read the same totals.
- After adding an assembly to a costing, the engineer may add, remove or change quantities of items in that costing line without affecting the library assembly.

### 7.1 Freezing
When an assembly or component is added to a costing, the following are copied into the
costing and never change afterwards: component code, name, category, unit, master price in
KES, discount %, exchange rate, weight and material rate for rate-based items, computed unit
price, hours, source hours, hourly rates, the three margins, rounding step and VAT %. Later changes to the master library, company rates or discount do not
alter an existing costing. A new revision re-reads current values only for lines the user
explicitly refreshes.

## 8. Costing lifecycle

    draft ──submit──▶ submitted ──approve──▶ approved
      ▲                  │
      └───return (comment required)

- **Draft**: editable by costing engineers and approvers of the company.
- **Submitted**: read-only. An approver may approve, or return it to draft with a mandatory comment.
- **Approved**: read-only for ever. Only an approver may release a quotation from it.
- **Revision**: any change after approval is made by creating a new revision. The new revision starts in draft with revision number +1, keeps the same costing number and the same family. The earlier revision stays approved and read-only. Only the current revision may be edited or quoted.
- **Numbering**: the internal costing number is `CM-YYYY-NNNN` per company per year, issued when the costing is created. Revisions are shown as `CM-2026-0007 Rev 2`. The printed quotation reference is separate (see §9).
- **History**: every status change, revision, price refresh, release and quotation status change is logged with user, timestamp and details. The log is visible on the costing and cannot be edited.

## 9. Quotation

- Released only by an approver, only from an approved, current costing.
- **Reference number**: company prefix + sequence + `-REV` + revision number, e.g. `NPP-193-REV0`, `NPP-193-REV1`. The company admin sets the prefix (default `QT`) and whether the year is included (`QT-2026-0193-REV0`). The sequence is issued once per costing family at first release; later revisions keep the sequence and change only the REV suffix.
- **Layout** follows `docs/quotation-template.md`, derived from the reference file: letterhead on every page; cover letter (reference, date, customer, subject, annexure list, sign-off); Annexure I notes on the offer; Annexure II price schedule per option with subtotal, VAT and total; Annexure III terms (scope, validity, payment, delivery terms, delivery timelines); Annexure IV technical offer with one row per panel.
- **Text sources**: letterhead, signatory and default terms come from company settings; prices, panels and VAT from the costing; subject, notes on the offer, terms wording and signatory are pre-filled and editable by the approver at release, then frozen with the quotation.
- **Currency**: amounts in the company currency, labelled with the company's currency word (for example "KSH"). No second currency on the PDF in release 1.
- The PDF is generated at release and stored. It is the document of record and is never regenerated silently. A changed costing needs a new revision and a new release.
- Status after release: `released` → `sent` → `won` or `lost`. A lost quotation requires a reason.
- Follow-ups: a sent quotation may carry one or more follow-up reminders with a due date, note and assignee. A follow-up list shows due and overdue items per company.

## 10. BOM exports

From any costing (draft or approved), four separate exports, each in CSV and XLSX:
1. Switchgear only
2. Busbar only
3. Accessories & hardware only
4. Fabricated enclosure parts only

Each export lists component code, name, unit, quantity (summed across panels and multiplied by panel and assembly quantities), and optionally unit price and line total. Exports are per costing revision.

## 10a. Excel import and export of the library

There is no finished master component list today, so the library is built inside the app by
uploading spreadsheets, and kept up to date the same way. Every library screen can be
downloaded to Excel and uploaded back.

### Download
- **Components**: one row per component with all editable columns, plus a read-only id column. Master admin downloads the master list; a company admin downloads its private list.
- **Assemblies**: one sheet listing assemblies, one listing their components and quantities, one listing their labour hours per process type.
- Downloads are also the upload template: an empty library downloads as a file with headers and one example row.

### Upload
- Accepts `.xlsx` and `.xlsm`. The user picks the sheet if the file has several.
- Column headers are matched by name; the order does not matter. Unknown columns are ignored and reported.
- Matching an existing component: by the read-only id column when present, else by manufacturer part number within the same make, else by make plus item plus description. Anything that matches nothing is a new component.
- A category must be set for every row, either as a column or chosen once for the whole upload.
- **Preview before anything is saved**: the app shows how many rows are new, changed (with the old and new value side by side), unchanged, and rejected with the reason. The user confirms or cancels.
- Price changes made by upload are written to the price history like any other change, with the user and time.
- Rows are never deleted by an upload. Removing a component is a separate, deliberate action.
- The same rules apply to a company admin uploading private components, and to master and private assemblies.

### Practical uses
- Build the master list from the "db" sheets of the existing workbooks (Make, Item, Description, Reference, Price).
- Send the list to a supplier, get updated prices back, upload the file, review the price changes, confirm.
- Bulk-add a new manufacturer range.

Costing BOM exports (§10) are separate and read-only; they are not uploaded back.

## 11. CRM

### 11.1 Phase 1 (release 1)
- **Customers**: single-entry master record per company. Name, address, city, country, tax PIN, notes.
- **Contacts**: belong to a customer. Name, email, phone, job title, primary flag.
- **Projects**: belong to a customer. Name, site location, notes.
- **Enquiries**: numbered `EN-YYYY-NNNN`, linked to customer, optional contact and project. Received date, description, source, status, owner.
- Costings link to an enquiry. Customer, contact and project are always chosen from dropdowns, never re-typed.
- Quotation status sent / won / lost with lost reason, and follow-up reminders (see §9).

### 11.2 Later phases (schema reserved, not built)
- Sales pipeline / funnel view: enquiries already carry a `stage` and an `owner`.
- Activity and call notes per customer: an `activities` table linked to customer and enquiry.
- Email sending from the app: an `email_log` table; quotations already store the PDF path.
- Sales targets and performance reports: a `sales_targets` table keyed by company, user and period.

## 12. Non-functional requirements

- **Backend**: Supabase (Postgres, Auth, Storage) in region eu-west-1 (Ireland).
- **Tenant isolation**: Postgres row-level security. Every tenant-owned table carries `company_id`. Shared master rows use `company_id IS NULL`. Tests prove a user of company A cannot read company B rows.
- **Schema as code**: every schema change is a numbered SQL migration in `supabase/migrations/`. The database can be rebuilt from scratch with one command.
- **Frontend**: a simple, clean single-page web app. Few screens, consistent layout, no clutter.
- **Code organisation**: separate modules by concern (auth, admin, library, costing, quotation, crm). No source file over roughly 300 lines.
- **Operability**: the owner is not a developer. Every operational step is documented in `docs/operations.md` in plain language.
- **Backups**: daily managed backups plus a weekly off-site dump; a restore drill before go-live and quarterly.
- **Audit**: costing history log; price history; created_by/updated_at on every table.
- **Excel round-trip**: the component library is built and maintained by downloading and uploading Excel files (§10). This is how the master list is created in the first place, since no finished list exists today.
- **Data protection**: a short terms page in the app states what is stored, that data is held in Ireland, that no company can see another company's data, and that a company's data is deleted on request. Shown at sign-up and linked from the footer.
- **Language**: English only in release 1.

## 13. Out of scope for release 1

- Sales pipeline view, activities, email sending, sales targets (later CRM phases).
- Hiding master components per company.
- Company-defined categories.
- Multi-company users.
- Purchase orders, stock, or supplier management.
- Manufacturer data sheets: stored and attached outside the app in release 1, as today.
- Mobile app (the web app should still be usable on a tablet).
