# CostMatrix — Roadmap: what to adopt from market-leading software, and what to build now so it does not have to be rebuilt later

**Status:** planning reference, written 10 Sep 2026. Companion to `current-costing-and-quotation-reference.md` (the "reference document"; its §5 decisions remain binding) and `ai-assistant-spec.md`.

**Why this document exists.** Slices 0–4 are built and live. Before more features are added, the data model should be shaped for where the product is going, because a column or table added now costs a migration, while the same change after a year of costings costs a migration *plus* a data back-fill *plus* rework of every screen and export that touched the old shape. §2 lists those foundations; §3–§5 list the features they enable, by phase.

---

## 1. Where the ideas come from

| Software | What it is | The idea CostMatrix borrows |
|---|---|---|
| **EPLAN Electric P8 / Pro Panel** (Friedhelm Loh Group, sister of Rittal) | Electrical CAD for control and power panels; every device is a real part from a parts database; BOMs, terminal plans and wire lists are generated, not typed | A parts database with structured attributes; BOM as a by-product of design; customer-facing wording separate from internal part names; import/export of parts lists |
| **EPLAN Data Portal** | Online library of manufacturer part data (Siemens, ABB, Schneider, Rittal, Phoenix Contact…) | Manufacturer part number as a first-class field, datasheet links, obsolescence and replacement tracking |
| **Rittal RiPanel / Configuration System** | Enclosure configurator: choose cubicles and accessories, get a BOM and drawings | Enclosure as catalogue cubicles plus rules (already decision 1); later, a fill/space check |
| **Schneider EcoStruxure Power Build, ABB e-Configure, Siemens SIVACON configurators** | Guided quoting tools for switchboards: answer questions about incomers, feeders, form, IP, and the tool assembles the offer | The **guided configurator** on top of kits; parameterised kits (`qty = f(parameter)`); technical offer generated from the configuration |
| **Trimble Accubid, ProEst** (electrical estimating) | Labour databases with productivity factors; assemblies; estimate-vs-actual variance | Labour standards that learn from actual shop-floor hours; productivity factors per job; assembly versioning |
| **Salesforce CPQ, Tacton, Odoo Sales** (configure-price-quote) | Rules for pricing and approvals; quotation templates with options; pipeline analytics | Margin-based approval rules; optional/alternative lines; price validity and expiry; win/loss analysis |

What CostMatrix deliberately does **not** copy: 3D panel layout, wiring and terminal diagrams, drawing production. Those stay in EPLAN or the designer's tool; CostMatrix consumes their BOM.

---

## 2. Foundations to build now (before any new feature)

Each item is a small schema change plus, where noted, a minimal screen. None of them changes the pricing engine's behaviour today; they make the phase 2–4 features additive instead of disruptive. Claude Code should check which of these already exist in migrations 0001–0011 before adding anything.

### F1. Component master: room for engineering and commercial data

Today: part number (used as the key), description, category, BOM category, purchase price + currency, unit, brand, rating, poles, breaking capacity, frame size, notes, lump-sum flag, placeholder (unpriced) state.

Add:

| Field | Purpose |
|---|---|
| `manufacturer_part_number` (nullable) | Distinct from the app's `part_number` key, because keys such as `100X10MM` and `1600A/5` are descriptive, not manufacturer codes (reference §6.3). Needed for BOM import matching and for external BOMs. |
| `manufacturer` and `supplier` (separate from `brand`) | Brand is what the quotation says ("SIEMENS"); supplier is who invoices (may be a local distributor). Purchasing and price-list updates key on supplier. |
| `attributes` (jsonb, typed by category) | Structured extras without a migration per attribute: mounting (fixed/withdrawable), operation (manual/motorised), trip unit, IP, dimensions, kVAr, cable size, bar section. Feeds filtering, compatibility checks and the configurator. |
| `status` = active / obsolete / placeholder, `replaced_by` (component id) | Obsolescence and replacement, as in the EPLAN Data Portal. Costings using an obsolete part warn; new costings offer the replacement. Placeholder replaces the current unpriced flag if that is a boolean. |
| `datasheet_url`, `lead_time_days` | Reference and later delivery-date estimates. |
| `price_valid_from`, `price_source` (supplier list name / date / who entered) | Price provenance; drives "price older than N days" warnings. |

Add a **`component_price_history`** table (component id, purchase price, currency, valid_from, source, entered_by) if prices are currently overwritten in place. Frozen costing lines already protect old costings; history is for the review screen, trend charts and the AI review's "price age" check.

### F2. Kits: versioned, parameterisable, with customer wording

Today: kit → kit lines (component, fixed quantity); kit group carries labour hours per process type, per-kit overrides.

Add:

| Field / table | Purpose |
|---|---|
| `kits.version` + `kits.status` (draft / active / retired) and **freeze the kit composition into the costing** (each costing assembly stores the kit version and its lines, not just the kit id) | Editing a master kit must never change an existing costing, exactly as with prices. This is the single most important foundation: without it, every future kit edit corrupts history. |
| `kit_lines.qty_expression` (nullable text) alongside `qty` | Reference §1.3: APFC quantities are formulas of the capacitor steps. Phase 1 leaves it null; phase 3's configurator fills it (`steps * 3` for fuse links). Engine rule: if the expression is null use `qty`. |
| `kit_parameters` table (kit id, name, type, unit, default, min, max) | Inputs a parameterised kit accepts (e.g. `busbar_metres`, `steps`, `feeder_count`). Empty today. |
| `kits.customer_wording` (text) and `kit_lines.customer_wording` | Annexure IV bullets ("1 No. 1600A FP ACB (KPLC)") separate from internal names. Already required by reference §4; make sure it exists on both levels. |
| `kit_compatibility_rules` (jsonb on kit, or a small table) | Later: "requires enclosure depth ≥ 800", "only with frame 2 ACB". Not populated in phase 1. |
| `kits.tags` (text[]) | Free labels such as `incomer`, `outgoer`, `apfc`, `metering` that the configurator and the AI use to find candidate kits without relying on kit-name text. |

### F3. Labour: standards that can learn

Today: hours per process type per kit group, per-kit override; three company rates.

Add:

| Field / table | Purpose |
|---|---|
| `panel_line_items.productivity_factor` (numeric, default 1.0) and optional `costing.productivity_factor` | Accubid-style adjustment for complexity, site conditions or a rush job, without editing the standards. |
| `labour_actuals` table (company, costing, panel line item, process type, hours, source, recorded_at) | Actual shop-floor hours, entered manually now and fed from Opsmatrix timesheets later. Enables the estimate-vs-actual report that improves the standards. |
| `labour_rates` with `valid_from` (rate history) | Rates change; costings already freeze the rate used, history is for reporting. |

### F4. Costing and panel line items: parameters and provenance

| Field | Purpose |
|---|---|
| `panel_line_items.parameters` (jsonb) | The board's defining answers: incomer rating and type, supply sources (mains/gen/solar), feeder schedule, form of separation, IP rating, access, cable entry, APFC kVAr, enclosure dimensions. Today these are typed into notes; as fields they generate Annexure I/IV text, drive the configurator and give the AI something to check against. |
| `costing_assemblies.origin` and `costing_lines.origin` = manual / kit / configurator / import / ai_proposal | Provenance of every line. Required for the AI's audit trail and for BOM import. |
| `panel_line_items.is_option` + `option_group` | Option 1 / Option 2 presentation in one quotation (reference §4 "Options"). |
| `costing.source_documents` → see F5 | The enquiry, spec or tender the costing answers. |

### F5. Documents and attachments (generic)

A single **`documents`** table: company id, `entity_type` + `entity_id` (enquiry, costing, component, quotation, supplier price list), storage path (Supabase Storage bucket per company), file name, mime type, size, uploaded_by, `extracted_text` (nullable, filled by a background job for PDF/DOCX/XLSX), `extraction_status`. Used by: enquiry attachments (customer spec, single-line diagram, tender schedule), supplier price lists, datasheets, released quotation PDFs, and every AI feature.

### F6. Activity log (audit + CRM activity in one)

`activity_log`: company id, actor (user or `assistant`), entity type/id, action, `before`/`after` (jsonb), note, created_at. Serves the approval audit trail, the CRM activity feed (calls, emails, notes) and the record of what the assistant proposed and what a person applied. If an audit table already exists, extend it rather than adding a second one.

### F7. Approval and pricing policy rules

`approval_rules` per company: ordered rules with a condition (e.g. `profit_margin_pct < 8`, `total_ex_vat > 10,000,000`, `uses_placeholder_part`, `price_age_days > 90`) and an outcome (auto-approve, require approver, require master admin, block). Phase 1 ships one default rule ("always require approver"), identical to today's behaviour, so the engine exists before anyone needs a second rule.

### F8. Validity and expiry

`quotations.valid_until` (date, computed from the company's validity-days term when the PDF is released; editable) and a nightly job that marks sent quotations expired and creates a follow-up task. `costing.price_snapshot_at` (timestamp of the last price refresh) so "prices older than N days" is one query.

### F9. Import framework (one mechanism for every import)

The seed importer already validates CSVs. Generalise it into `import_jobs` (company, type = catalogue / kits / bom / price_list / labour_hours, file document id, status, column mapping jsonb, summary) and `import_rows` (job, row number, raw jsonb, matched entity id, match method, status, message). The same two tables then serve the EPLAN/consultant BOM import (phase 2), supplier price-list updates (phase 2) and the AI-assisted mapping (both). Every import ends in a review screen where a person accepts or rejects rows before anything is written to master data or a costing.

### F10. Company settings as typed key–value

If company settings are separate columns today (rounding increment, VAT, currency, exchange rate, terms, letterhead), keep them but add a `company_settings` typed key–value table for everything new (AI on/off, provider, approval policy defaults, expiry follow-up days, productivity defaults), so later settings never need a migration.

### F11. Assistant tables

Defined in `ai-assistant-spec.md` §6: `assistant_conversations`, `assistant_messages`, `assistant_proposals`. Create them in the foundations slice even though the assistant UI comes in phase 2, so the provenance field in F4 and the activity log in F6 can reference them.

### F12. Physical dimensions

Groundwork for the panel layout canvas (3.8), added 11 Sep 2026 at the owner's request and built as
migration 0106. Nothing reads it until the canvas exists, and every column is nullable, so the
library stays valid while it is unmeasured.

- `components`: `width_mm`, `height_mm`, `depth_mm`, `mounting_type` (din_rail / plate /
  withdrawable / door / busbar_chamber / other), `clearances` jsonb (top, bottom, left, right in
  mm) and `weight_kg`.
- `components.enclosure_layout` jsonb, on an enclosure cubicle only: the usable internal mounting
  area (w, h, d), the busbar and cable chamber sizes, and the form of separation it is built to.
- `assemblies`: `footprint_w_mm`, `footprint_h_mm`, `footprint_d_mm` — optional overrides; null
  means "the main device plus its clearances", which is right for most kits.
- `panel_layouts`: one arrangement of one panel line item, versioned — its cubicles, each with the
  placements of kit lines at x, y, w, h and rotation in mm. Empty until 3.8.
- `app.panel_fit(panel)`: an area-only check — the footprints on the panel against the usable area
  of its cubicles, times a per-company safety factor (`company_options.layout_safety_factor`,
  default 1.3) — shown as one advisory line on the costing screen. No price or hour changes.

**Not foundations, do not build now:** busbar run calculator, 3D/space checks, e-signature, email sending, external portals. They sit on top of the above without changing it.

---

## 3. Phase 2 — after the NPP-192 end-to-end trial (next 1–2 months)

Ordered by dependency and value. Each is one Claude Code session and one PR, as per the working agreement.

**Built on `advanced`:** 2.1 (migrations 0100–0102), 2.2 (0105), 2.3 (0107), 2.4 (0103–0104),
2.5 and 2.6 (0108), 2.7 (0109), 2.8 (0110). Left: **2.9**, added after the rest was built, so it
comes next rather than in its numbered place.

| # | Feature | Borrowed from | Depends on |
|---|---|---|---|
| 2.1 | **Foundations migration set** (F1–F11) with seed back-fill and tests; no visible change except new optional fields on component and kit screens | — | — |
| 2.2 | **Price-list update workflow**: upload a supplier list (CSV/XLSX/PDF), map columns, match to components, show a side-by-side diff (old → new price, % change), accept per row or all; writes `component_price_history` | EPLAN Data Portal, CPQ price books | F1, F5, F9 |
| 2.3 | **BOM import**: upload a parts list from EPLAN, a consultant or a customer (CSV/XLSX), match part numbers and manufacturer numbers to the catalogue, propose kits where a matched device is a kit's main device, flag unmatched rows for manual choice or placeholder creation; result lands as a draft panel line item with `origin = import` | EPLAN BOM export | F1, F2, F4, F9 |
| 2.4 | **AI assistant phase 1** (enquiry → draft costing; pre-approval review) per `ai-assistant-spec.md` | — | F4, F5, F6, F11 |
| 2.5 | **Approval rules engine** with the company's first real rules (minimum margin, placeholder parts, price age) and a "why this needs approval" panel on the costing | CPQ approval workflows | F7, F8 |
| 2.6 | **Quotation validity and follow-up**: `valid_until`, expiry job, follow-up reminders, "re-issue with current prices" action that creates a new revision from a refreshed price snapshot | CPQ | F8 |
| 2.7 | **Options and alternatives** on one quotation (Option 1 / Option 2 price blocks, optional line items shown but excluded from the total) | CPQ, current workbook | F4 |
| 2.8 | **Estimate vs actual labour**: manual entry of actual hours per panel line item and process type; variance report by kit group; "suggested new standard" column (no automatic change to standards) | Accubid / ProEst | F3 |
| 2.9 | **Costing grid view**: the whole costing as one grid — panels across the columns, kits and components down the rows — for costing a board of many near-identical panels the way the old workbook did. Added 12 Sep 2026 from the owner's confirmed spec, `costing-grid-view.md`, with the mockup at `mockups/costing-grid-view.html`. No engine or pricing change: every edit goes through the same functions as the panel editor | Current workbook, Accubid takeoff grids | F4 |

## 4. Phase 3 — configurator and learning (3–6 months)

| # | Feature | Borrowed from | Depends on |
|---|---|---|---|
| 3.1 | **Guided LV board configurator**: a short question flow (supply sources, incomer ratings and type, changeover/sync, solar, feeder schedule by rating and quantity, APFC kVAr, metering, form, IP, access, cable entry) that fills `panel_line_items.parameters` and proposes kits with quantities; the engineer edits the result. Standard boards in minutes; non-standard boards still assembly-by-assembly | Schneider Power Build, ABB e-Configure, SIVACON | F2 (tags), F4 |
| 3.2 | **APFC configurator**: target kVAr and step pattern → step kits and quantities using `qty_expression` | Decision 4's "later phase" | F2 |
| 3.3 | **Parameterised kits** in the engine (`qty_expression` evaluated against `kit_parameters`); busbar metres as a kit parameter so a non-standard board adjusts metres in one place | EPLAN macros, Accubid assemblies | F2 |
| 3.4 | **Compatibility checks**: rules on kits/components (frame vs enclosure depth, accessory fits device, feeder total vs incomer rating sanity check) surfaced as warnings, also used by the AI review | EPLAN parts checks | F1 attributes, F2 rules |
| 3.5 | **Labour standards from actuals**: Opsmatrix timesheet feed into `labour_actuals`; admin screen to accept suggested standard hours per kit group | Accubid | F3, Opsmatrix |
| 3.6 | **Sales analytics**: win/loss by customer, product group, value band and reason; hit rate; margin achieved vs quoted; pipeline view | CPQ / CRM phase 2 | F6, CRM |
| 3.8 | **Panel layout canvas**: a front view per cubicle at true scale; kits dragged onto mounting-plate and DIN-rail zones with their clearances respected; busbar and cable chambers drawn as unavailable space; a fit / no-fit verdict that proposes the cubicle count and width for the enclosure line; later exported as the general-arrangement sketch in Annexure IV | Rittal RiPanel, EPLAN Pro Panel | F12, F2 |
| 3.7 | **AI assistant phase 2**: natural-language questions over the company's own data; drafting cover letters, follow-ups and clarification questions; external companies switched on per company | — | 2.4 |

## 5. Phase 4 — deeper integration (6–12 months)

| # | Feature | Borrowed from |
|---|---|---|
| 4.1 | Busbar run calculator (the `CU-OPT1` logic, reference §1.4) as an optional way to fill busbar kit parameters | Current workbook |
| 4.2 | ~~Enclosure fill/space check from component dimensions in `attributes`~~ — **brought forward**: the dimensions are F12 and the check is 3.8 | Rittal RiPanel |
| 4.3 | Technical offer export to Word/EPLAN-compatible parts list; import of EPLAN project metadata (project name, drawing numbers) onto the costing | EPLAN |
| 4.4 | Email sending from the app, e-signature on quotations, customer portal for external buyers to view and accept | CPQ |
| 4.5 | Supplier connectors: scheduled price-list pulls where a supplier offers a feed | EPLAN Data Portal |

---

## 6. Rules that keep the roadmap honest

1. Reference document §5 decisions stay binding; anything here that appears to conflict is a later-phase extension and must not change phase-1 behaviour.
2. Every new capability that writes to master data or a costing goes through a review step with a person (imports, price updates, AI proposals). Nothing is auto-applied.
3. Anything frozen into a costing (prices, factors, rates, kit composition, parameters) stays frozen; new features read history, they do not rewrite it.
4. One gap per Claude Code session, tests plus a PR that Alpesh reviews and merges; foundations (2.1) may be split into two PRs (master data; costing/audit) if the migration set is large.
